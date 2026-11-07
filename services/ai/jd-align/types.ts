/**
 * Resume ↔ job-description alignment.
 *
 * The screen draws these spans. They are exact slices of the texts the
 * reader pasted, so a highlight can never show words the model invented.
 */

import { emptyKeywordMatch, type KeywordMatch } from '@/services/ai/evaluate/types';
import type { ExpertRead } from '@/services/ai/judge/types';

export type AlignStatus = 'matched' | 'missing';

export interface AlignEvidence {
  id: string;
  /** Exact slice of the resume. */
  quote: string;
  start: number;
  end: number;
}

export interface AlignAspect {
  id: string;
  /** Short name for the requirement, used in the hover caption. */
  label: string;
  /** Exact slice of the job description. */
  quote: string;
  start: number;
  end: number;
  status: AlignStatus;
  /** One sentence shown while the mark is hovered. */
  note: string;
  /** Resume slices that support a matched requirement. Empty when missing. */
  evidence: AlignEvidence[];
}

export interface JdAlignResult {
  roleHint: string | null;
  aspects: AlignAspect[];
  matchedCount: number;
  missingCount: number;
  keywords: KeywordMatch;
  expert: ExpertRead | null;
}

export function emptyAlignResult(roleHint: string | null = null): JdAlignResult {
  return {
    roleHint,
    aspects: [],
    matchedCount: 0,
    missingCount: 0,
    keywords: emptyKeywordMatch(),
    expert: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isExactSlice(text: string, start: unknown, end: unknown, quote: unknown): quote is string {
  return (
    typeof quote === 'string' &&
    typeof start === 'number' &&
    typeof end === 'number' &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end <= text.length &&
    start < end &&
    text.slice(start, end) === quote
  );
}

/** True when every highlight is an exact slice of the texts being shown. */
export function alignmentFits(
  value: unknown,
  resumeText: string,
  jobDescription: string
): value is JdAlignResult {
  if (!isRecord(value) || !Array.isArray(value.aspects)) return false;
  return value.aspects.every((aspect) => {
    if (!isRecord(aspect)) return false;
    if (aspect.status !== 'matched' && aspect.status !== 'missing') return false;
    if (!isExactSlice(jobDescription, aspect.start, aspect.end, aspect.quote)) return false;
    if (!Array.isArray(aspect.evidence)) return false;
    if (aspect.status === 'missing' && aspect.evidence.length > 0) return false;
    if (aspect.status === 'matched' && aspect.evidence.length === 0) return false;
    return aspect.evidence.every(
      (evidence) =>
        isRecord(evidence) && isExactSlice(resumeText, evidence.start, evidence.end, evidence.quote)
    );
  });
}
