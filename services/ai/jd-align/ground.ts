/**
 * Turn a model's alignment into spans the screen can draw.
 *
 * Quotes that are not in the document are dropped. A "matched" requirement
 * with no honest support is drawn as missing. Overlapping marks on the job
 * description collapse to the longer one so the marker stays readable.
 */

import { z } from 'zod';

import { emptyKeywordMatch } from '@/services/ai/evaluate/types';

import { JD_ALIGN_LIMITS } from './limits';
import { locateQuote, type LocatedQuote } from './locate';
import { evidenceSetSupports, isScreenable, quoteContributes, requirementTokens } from './support';
import {
  emptyAlignResult,
  type AlignAspect,
  type AlignEvidence,
  type JdAlignResult,
} from './types';

const aspectSchema = z.object({
  label: z.string().optional(),
  jdQuote: z.string(),
  status: z.string().optional(),
  note: z.string().optional(),
  resumeQuotes: z.array(z.string()).optional(),
});

interface DraftAspect {
  label: string;
  quote: string;
  start: number;
  end: number;
  status: 'matched' | 'missing';
  note: string;
  evidence: LocatedQuote[];
}

function cleanNote(value: string | undefined, status: 'matched' | 'missing'): string {
  const trimmed = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (trimmed) return trimmed.slice(0, 180);
  return status === 'matched' ? 'On your resume.' : 'Not written on your resume.';
}

function cleanLabel(value: string | undefined, quote: string): string {
  const trimmed = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (trimmed) return trimmed.slice(0, 64);
  return quote.replace(/\s+/g, ' ').trim().slice(0, 48);
}

function cleanRole(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (trimmed.split(' ').length > 12) return null;
  return trimmed;
}

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number }
): boolean {
  return a.start < b.end && b.start < a.end;
}

function takeNonOverlapping<T extends { start: number; end: number }>(items: T[]): T[] {
  const sorted = [...items].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start
  );
  const kept: T[] = [];
  for (const item of sorted) {
    if (kept.some((existing) => rangesOverlap(existing, item))) continue;
    kept.push(item);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

function specificity(aspect: DraftAspect): number {
  return (
    Math.min(aspect.quote.length, 180) +
    requirementTokens(aspect.quote, aspect.label).length * 12 +
    (aspect.status === 'matched' ? 10 : 0)
  );
}

function capAspects(aspects: DraftAspect[]): DraftAspect[] {
  const room = JD_ALIGN_LIMITS.maxAspects;
  if (aspects.length <= room) return aspects;

  const matched = aspects.filter((aspect) => aspect.status === 'matched');
  const missing = aspects.filter((aspect) => aspect.status === 'missing');
  let matchedRoom: number = room;
  let missingRoom: number = room;
  if (matched.length > 0 && missing.length > 0) {
    missingRoom = Math.min(6, missing.length, room - 1);
    matchedRoom = room - missingRoom;
    if (matched.length < matchedRoom) {
      missingRoom = Math.min(missing.length, room - matched.length);
      matchedRoom = room - missingRoom;
    }
  }

  const byScore = (list: DraftAspect[]) =>
    [...list].sort((a, b) => specificity(b) - specificity(a) || a.start - b.start);
  const kept = [
    ...byScore(matched).slice(0, matchedRoom),
    ...byScore(missing).slice(0, missingRoom),
  ];
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

function readAspects(model: unknown): { roleHint: string | null; raw: unknown[] } {
  if (!model || typeof model !== 'object') return { roleHint: null, raw: [] };
  const record = model as Record<string, unknown>;
  const roleHint = cleanRole(record.roleHint);
  const raw = Array.isArray(record.aspects) ? record.aspects : [];
  return { roleHint, raw };
}

function draftFromUnknown(
  value: unknown,
  resumeText: string,
  jobDescription: string
): DraftAspect | null {
  const parsed = aspectSchema.safeParse(value);
  if (!parsed.success) return null;

  const jd = locateQuote(jobDescription, parsed.data.jdQuote);
  if (!jd || jd.quote.length > JD_ALIGN_LIMITS.maxQuoteChars) return null;

  const label = cleanLabel(parsed.data.label, jd.quote);
  if (!isScreenable(jd.quote, label)) return null;

  const located = (parsed.data.resumeQuotes ?? [])
    .map((quote) => locateQuote(resumeText, quote))
    .filter((quote): quote is LocatedQuote => quote != null)
    .filter((quote) => quote.quote.length <= JD_ALIGN_LIMITS.maxQuoteChars)
    .filter((quote) => quoteContributes(jd.quote, label, quote.quote));

  const uniqueEvidence = takeNonOverlapping(located).slice(0, JD_ALIGN_LIMITS.maxEvidence);
  const supported = evidenceSetSupports(
    jd.quote,
    label,
    uniqueEvidence.map((quote) => quote.quote)
  );
  const askedMissing = parsed.data.status === 'missing';
  const status = !askedMissing && supported ? 'matched' : 'missing';
  const trustedNote = status === 'matched' || askedMissing;

  return {
    label,
    quote: jd.quote,
    start: jd.start,
    end: jd.end,
    status,
    note: cleanNote(trustedNote ? parsed.data.note : undefined, status),
    evidence: status === 'matched' ? uniqueEvidence : [],
  };
}

function assignIds(aspects: DraftAspect[]): AlignAspect[] {
  return aspects.map((aspect, index) => {
    const id = `a${index + 1}`;
    const evidence: AlignEvidence[] = aspect.evidence.map((quote, evidenceIndex) => ({
      id: `${id}-e${evidenceIndex + 1}`,
      quote: quote.quote,
      start: quote.start,
      end: quote.end,
    }));
    return {
      id,
      label: aspect.label,
      quote: aspect.quote,
      start: aspect.start,
      end: aspect.end,
      status: aspect.status,
      note: aspect.note,
      evidence,
    };
  });
}

/**
 * Ground a model payload against the exact resume and job description.
 * Safe to call with any JSON the model returned.
 */
export function groundAlignment(
  model: unknown,
  resumeText: string,
  jobDescription: string
): JdAlignResult {
  const { roleHint, raw } = readAspects(model);
  const drafts = raw
    .map((aspect) => draftFromUnknown(aspect, resumeText, jobDescription))
    .filter((aspect): aspect is DraftAspect => aspect != null);

  const aspects = assignIds(capAspects(takeNonOverlapping(drafts)));
  if (aspects.length === 0) return emptyAlignResult(roleHint);

  return {
    roleHint,
    aspects,
    matchedCount: aspects.filter((aspect) => aspect.status === 'matched').length,
    missingCount: aspects.filter((aspect) => aspect.status === 'missing').length,
    keywords: emptyKeywordMatch(),
    expert: null,
  };
}
