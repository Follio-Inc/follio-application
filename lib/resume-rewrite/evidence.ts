/**
 * What the resume actually says.
 *
 * Fabrication checks are comparisons against this corpus: a number, a product
 * name or a certification that appears in a proposed rewrite but nowhere in
 * the resume is, by definition, something the agent supplied rather than
 * something the user wrote. That is a *textual* claim and nothing more — the
 * user may well have done the thing. It is simply not on their resume, so
 * Follio must not write it there on their behalf.
 *
 * Deliberately conservative in both directions. Every extractor here can miss
 * things (a metric phrased in words, a lowercase product name), and the
 * checks that use them are therefore a floor, not a proof. See `guards.ts`
 * for how that floor is combined with the Verification Agent.
 */

import type { ResumeForRewrite } from './types';

/** Strip HTML and collapse whitespace. Resume text can carry light markup. */
export function stripHtml(text: string): string {
  return String(text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercased, punctuation-light form used for substring containment. */
export function normalizeText(text: string): string {
  return stripHtml(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Comparison form for "is this the same text?".
 *
 * Stricter than `normalizeText` on purpose: punctuation and case are dropped
 * so a proposal is not rejected over a curly apostrophe, but word order and
 * wording must match exactly.
 */
export function canonicalizeForEquality(text: string): string {
  return stripHtml(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ============================================================================
// NUMERIC CLAIMS
// ============================================================================

/**
 * Quantities written as words. A rewrite that introduces "halved" is making a
 * measurement claim just as surely as one that introduces "50%".
 */
const QUANTITY_WORDS = [
  'half',
  'halved',
  'double',
  'doubled',
  'triple',
  'tripled',
  'quadrupled',
  'twofold',
  'threefold',
  'tenfold',
  'dozens',
  'hundreds',
  'thousands',
  'millions',
];

const NUMBER_PATTERN =
  /\d+(?:[.,]\d+)?\s*%|[$£€]\s*\d+(?:[.,]\d+)?[kmb]?|\d+(?:[.,]\d+)?\s*[kmb]\b|\d+(?:[.,]\d+)?x\b|\d+(?:[.,]\d+)?/gi;

/**
 * Every numeric or quantity claim in a piece of text, normalized.
 *
 * Normalization drops separators and the unit, so "1,200" and "1200" are the
 * same claim and "50%" is recognised as the number 50 appearing. That is the
 * conservative direction: it makes the check *less* likely to call something
 * a fabrication.
 */
export function extractNumericClaims(text: string): Set<string> {
  const claims = new Set<string>();
  const clean = stripHtml(text);

  for (const raw of clean.match(NUMBER_PATTERN) ?? []) {
    const digits = raw.replace(/[^0-9.]/g, '').replace(/\.$/, '');
    if (digits) claims.add(digits);
  }

  const lower = clean.toLowerCase();
  for (const word of QUANTITY_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) claims.add(word);
  }

  return claims;
}

// ============================================================================
// PROPER NOUNS
// ============================================================================

/**
 * Capitalized words that are not claims about anything: sentence openers,
 * months, and the handful of title-cased words that appear in ordinary resume
 * prose. Keeping this list short matters — every entry is a hole in the
 * check — so it holds only words that cannot name an employer, a product or a
 * qualification.
 */
const COMMON_CAPITALIZED = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'built',
  'by',
  'delivered',
  'designed',
  'for',
  'from',
  'i',
  'improved',
  'in',
  'increased',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'led',
  'managed',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'of',
  'on',
  'owned',
  'reduced',
  'shipped',
  'the',
  'to',
  'with',
]);

/** A token that could name something: `Kubernetes`, `AWS`, `Node.js`, `C++`. */
const PROPER_NOUN_TOKEN = /^[A-Z][A-Za-z0-9+#.&-]*$/;
const ACRONYM_TOKEN = /^[A-Z][A-Z0-9+#.&-]+$/;

function stripEdgePunctuation(token: string): string {
  return token.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9+#]+$/, '');
}

/**
 * Names introduced by a piece of text.
 *
 * A capitalized word is only counted when it is *not* the first word of a
 * sentence, because "Delivered the migration" says nothing about a product.
 * All-caps tokens are counted wherever they appear, since "AWS" at the start
 * of a bullet is still a claim about AWS.
 */
export function extractProperNouns(text: string): Set<string> {
  const names = new Set<string>();
  const clean = stripHtml(text);

  for (const sentence of clean.split(/(?<=[.!?;])\s+/)) {
    const tokens = sentence.split(/\s+/).map(stripEdgePunctuation).filter(Boolean);

    tokens.forEach((token, index) => {
      if (COMMON_CAPITALIZED.has(token.toLowerCase())) return;
      const isAcronym = ACRONYM_TOKEN.test(token) && token.length >= 2;
      if (isAcronym) {
        names.add(token.toLowerCase());
        return;
      }
      // Sentence-initial capitalization carries no information.
      if (index === 0) return;
      if (!PROPER_NOUN_TOKEN.test(token)) return;
      if (token.length < 2) return;
      names.add(token.toLowerCase());
    });
  }

  return names;
}

// ============================================================================
// THE CORPUS
// ============================================================================

/** Everything the resume says, in the forms the checks need. */
export interface ResumeEvidence {
  /** Normalized full text, for substring containment. */
  haystack: string;
  /** Every numeric or quantity claim anywhere on the resume. */
  numbers: Set<string>;
  /** Every name the resume mentions, lowercased. */
  names: Set<string>;
  /** The resume's skills, normalized. */
  skills: Set<string>;
}

/**
 * Build the evidence corpus for one resume.
 *
 * Employer names, roles, institutions and skills are included even though
 * they are not rewritable: a bullet may legitimately mention the company it
 * was written under, and the corpus is about what the resume *says*, not
 * about what is editable.
 */
export function buildResumeEvidence(resume: ResumeForRewrite): ResumeEvidence {
  const parts: string[] = [];

  if (resume.headline) parts.push(resume.headline);
  if (resume.summary) parts.push(resume.summary);
  parts.push(...(resume.skills ?? []));

  for (const experience of resume.experiences ?? []) {
    parts.push(experience.company, experience.role, ...(experience.bullets ?? []));
  }
  for (const education of resume.education ?? []) {
    parts.push(education.institution, education.degree ?? '', education.fieldOfStudy ?? '');
  }
  for (const project of resume.projects ?? []) {
    parts.push(
      project.title,
      project.description ?? '',
      ...(project.highlights ?? []),
      ...(project.techStack ?? [])
    );
  }

  const joined = parts.filter(Boolean).join('\n');

  const names = extractProperNouns(joined);
  // Skills and tech stacks are names wherever they appear, including lower
  // case ones the sentence-position heuristic would skip.
  for (const skill of resume.skills ?? []) {
    const normalized = normalizeText(skill);
    if (normalized) names.add(normalized);
  }
  for (const project of resume.projects ?? []) {
    for (const tech of project.techStack ?? []) {
      const normalized = normalizeText(tech);
      if (normalized) names.add(normalized);
    }
  }

  return {
    haystack: normalizeText(joined),
    numbers: extractNumericClaims(joined),
    names,
    skills: new Set((resume.skills ?? []).map((skill) => normalizeText(skill)).filter(Boolean)),
  };
}

/** Does the resume mention this phrase anywhere? */
export function evidenceMentions(evidence: ResumeEvidence, phrase: string): boolean {
  const normalized = normalizeText(phrase);
  if (!normalized) return false;
  if (evidence.names.has(normalized)) return true;
  return evidence.haystack.includes(normalized);
}
