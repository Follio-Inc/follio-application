/**
 * Outcome claims: the fabrication that carries no number.
 *
 * Phase 3A's guards were built around *entities and figures* — an employer
 * the resume never names, a 40% that appears nowhere. The first live run went
 * straight through them, because the model's favourite way of making a bullet
 * sound better is not to invent a statistic. It is to staple a benefit onto
 * the end of a true sentence:
 *
 *     "…to store data from learning management systems, enhancing data
 *      retrieval speed."
 *
 * Every word of that clause is innocuous in isolation. It introduces no name,
 * no number and no credential, so every check in guards.ts passed it, and the
 * semantic verifier — asked only whether the rewrite "preserves the factual
 * meaning" — read it as consistent with building an API and approved it. It
 * is nonetheless a claim the resume does not make. Speed was never measured,
 * never mentioned, and may never have improved.
 *
 * This module detects that shape. Three ideas keep it from flagging every
 * verb:
 *
 *   1. **An outcome claim is a construction, not a word.** "Improved" inside
 *      a bullet the user already wrote is their claim. The signal is a
 *      *result construction* — a trailing `, improving X`, a `leading to X`,
 *      a bare `Improved X` — introduced by the rewrite.
 *   2. **Category, not string, decides novelty.** If the original already
 *      asserts an improvement of the same kind, rewording it is a faithful
 *      paraphrase and is left alone. A rewrite only trips this check when it
 *      claims a *kind* of benefit the original never claimed.
 *   3. **Support is established against the resume, never against the
 *      proposal.** A claim is supported when the thing being improved is
 *      actually written somewhere on this resume. The Rewrite Agent's own
 *      explanation of why its sentence is better is not evidence for the
 *      sentence, and nothing here reads it.
 *
 * Like the rest of lib/resume-rewrite this is a floor, not a proof: an
 * outcome phrased in a way these patterns miss will pass, and the
 * Verification Agent's claim comparison is the second line for that.
 */

import { normalizeText, stripHtml, type ResumeEvidence } from './evidence';

// ============================================================================
// CATEGORIES
// ============================================================================

/**
 * Kinds of benefit a rewrite can claim.
 *
 * The categories exist so a reworded version of an outcome the user already
 * asserted is recognised as the same claim. They are deliberately coarse:
 * finer categories would split a paraphrase across two of them and flag it.
 */
export type OutcomeCategory =
  | 'performance'
  | 'productivity'
  | 'accuracy'
  | 'cost'
  | 'adoption'
  | 'learning'
  | 'business'
  | 'stakeholder'
  | 'delivery'
  | 'unspecified';

/** Words that place a claim in a category. Matched as stems, not substrings. */
const CATEGORY_TERMS: Array<[OutcomeCategory, string[]]> = [
  [
    'performance',
    [
      'speed',
      'faster',
      'fast',
      'latency',
      'throughput',
      'performance',
      'responsiveness',
      'runtime',
      'load',
      'scalability',
      'scalable',
      'efficiency',
      'efficient',
      'optimisation',
      'optimization',
      'uptime',
      'downtime',
      'retrieval',
      'query',
    ],
  ],
  [
    'productivity',
    [
      'productivity',
      'velocity',
      'throughput',
      'turnaround',
      'manual',
      'effort',
      'workload',
      'overhead',
      'toil',
      'hours',
      'time',
      'workflow',
      'process',
      'capability',
      'capabilities',
    ],
  ],
  [
    'accuracy',
    [
      'accuracy',
      'accurate',
      'precision',
      'correctness',
      'reliability',
      'reliable',
      'quality',
      'robustness',
      'stability',
      'errors',
      'bugs',
      'defects',
      'consistency',
    ],
  ],
  [
    'cost',
    ['cost', 'costs', 'spend', 'budget', 'savings', 'cheaper', 'licensing', 'infrastructure'],
  ],
  [
    'adoption',
    [
      'adoption',
      'engagement',
      'usage',
      'users',
      'retention',
      'uptake',
      'traffic',
      'signups',
      'downloads',
      'reach',
      'visibility',
    ],
  ],
  [
    'learning',
    [
      'understanding',
      'learning',
      'comprehension',
      'literacy',
      'awareness',
      'education',
      'educational',
      'pedagogy',
      'students',
      'teaching',
      'insight',
      'insights',
    ],
  ],
  [
    'business',
    [
      'revenue',
      'profit',
      'growth',
      'conversion',
      'roi',
      'sales',
      'churn',
      'margin',
      'value',
      'impact',
      'outcomes',
      'compliance',
    ],
  ],
  [
    'stakeholder',
    [
      'collaboration',
      'collaborative',
      'stakeholder',
      'stakeholders',
      'alignment',
      'communication',
      'morale',
      'onboarding',
      'team',
      'teams',
      'cross-functional',
      'partners',
      'customers',
      'satisfaction',
    ],
  ],
  [
    'delivery',
    [
      'delivery',
      'delivered',
      'launch',
      'release',
      'shipped',
      'schedule',
      'deadline',
      'milestone',
      'rollout',
      'deployment',
      'successful',
      'successfully',
    ],
  ],
];

// ============================================================================
// TRIGGERS
// ============================================================================

interface TriggerPattern {
  pattern: RegExp;
  /**
   * Whether the claim lives in a clause that can simply be struck out.
   *
   * This is what decides the verdict: a trailing `, improving X` can be
   * removed and the sentence still says what the user did, so the rewrite can
   * be revised. A claim woven into the main clause ("Improved X by building
   * Y") cannot be deleted without rewriting the sentence around it, and only
   * the user knows whether the claim is true — so that one goes to them.
   */
  removable: boolean;
}

/**
 * Result constructions, most specific first.
 *
 * Each pattern captures the trigger in group 1 and the thing being claimed in
 * group 2, so the support test has something concrete to look for rather than
 * a verb.
 */
const TRIGGERS: TriggerPattern[] = [
  // ", improving data retrieval speed" — the appended benefit clause.
  {
    pattern:
      /[,;]\s*(improving|enhancing|increasing|reducing|boosting|accelerating|streamlining|optimizing|optimising|strengthening|driving|enabling|allowing|delivering|saving|cutting|doubling|halving|elevating|maximizing|maximising|minimizing|minimising|speeding up|freeing up)\s+([^.;]*)/gi,
    removable: true,
  },
  // "leading to improved understanding of …"
  {
    pattern:
      /\b(leading to|resulting in|thereby|culminating in|with the result that|contributing to|which (?:improved|increased|reduced|enabled|allowed|accelerated|streamlined|enhanced|led to))\s+([^.;]*)/gi,
    removable: true,
  },
  // "to improve data retrieval speed" — purpose written as achieved benefit.
  {
    pattern:
      /\b(to (?:improve|increase|reduce|boost|accelerate|optimize|optimise|enhance|streamline|speed up))\s+([^.;,]*)/gi,
    removable: false,
  },
  // "Improved data retrieval speed by …" — the benefit as the main verb.
  {
    pattern:
      /\b(improved|enhanced|increased|reduced|optimized|optimised|accelerated|streamlined|boosted|strengthened|doubled|halved|eliminated)\s+([a-z][^.;,]{0,80})/gi,
    removable: false,
  },
];

/**
 * Outcome claims carried by a single word.
 *
 * "Successfully delivered the migration" claims an outcome with no object to
 * test, so the word itself is the claim and the resume has to use it.
 */
const STANDALONE_TRIGGERS: Array<{ pattern: RegExp; category: OutcomeCategory }> = [
  { pattern: /\bsuccessfully\b/gi, category: 'delivery' },
  { pattern: /\b(?:ahead of|on) schedule\b/gi, category: 'delivery' },
  { pattern: /\bon time\b/gi, category: 'delivery' },
  { pattern: /\bseamless(?:ly)?\b/gi, category: 'delivery' },
  { pattern: /\bwidely (?:adopted|used)\b/gi, category: 'adoption' },
  { pattern: /\bhigh[- ]impact\b/gi, category: 'business' },
  { pattern: /\bmission[- ]critical\b/gi, category: 'business' },
  { pattern: /\bbest[- ]in[- ]class\b/gi, category: 'business' },
  {
    pattern: /\b(?:significantly|dramatically|substantially|greatly|markedly)\b/gi,
    category: 'unspecified',
  },
];

// ============================================================================
// WORDS
// ============================================================================

/** Words that carry no claim and are ignored when testing support. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'to',
  'in',
  'on',
  'at',
  'by',
  'with',
  'and',
  'or',
  'from',
  'into',
  'across',
  'through',
  'their',
  'its',
  'our',
  'this',
  'that',
  'these',
  'those',
  'it',
  'as',
  'more',
  'most',
  'better',
  'greater',
  'higher',
  'lower',
  'overall',
  'both',
  'all',
  'new',
  'while',
  'when',
  'per',
  'up',
  'down',
  'out',
  'over',
  'within',
]);

/**
 * A crude stem, so "collaboration" and "collaborative" count as the same word.
 *
 * Deliberately not a real stemmer: a wrong stem here can only make support
 * *harder* to establish, which fails towards asking rather than asserting.
 */
export function stemWord(word: string): string {
  let stem = word.toLowerCase().replace(/[^a-z0-9+#-]/g, '');
  const suffixes = [
    'ization',
    'isation',
    'ational',
    'atives',
    'ative',
    'ations',
    'ation',
    'ements',
    'ement',
    'ments',
    'ment',
    'ively',
    'ive',
    'ness',
    'ities',
    'ity',
    'ingly',
    'ings',
    'ing',
    'edly',
    'ies',
    'ers',
    'er',
    'ed',
    'ally',
    'ly',
    'es',
    's',
  ];
  for (const suffix of suffixes) {
    if (stem.length - suffix.length >= 4 && stem.endsWith(suffix)) {
      stem = stem.slice(0, stem.length - suffix.length);
      break;
    }
  }
  return stem;
}

function contentWords(text: string): string[] {
  return normalizeText(text)
    .split(/[\s-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/** Every stem the resume uses anywhere. Built once per check. */
function resumeStems(evidence: ResumeEvidence): Set<string> {
  const stems = new Set<string>();
  for (const word of evidence.haystack.split(/[\s-]+/)) {
    const stem = stemWord(word);
    if (stem) stems.add(stem);
  }
  for (const name of evidence.names) {
    for (const part of name.split(/[\s-]+/)) {
      const stem = stemWord(part);
      if (stem) stems.add(stem);
    }
  }
  return stems;
}

// ============================================================================
// CLAIMS
// ============================================================================

export interface OutcomeClaim {
  /** The matched text, as written in the rewrite. */
  phrase: string;
  /** The construction that makes this a claim, e.g. "leading to". */
  trigger: string;
  /** What is claimed to have got better. Empty for a one-word claim. */
  object: string;
  category: OutcomeCategory;
  /** Whether striking the clause leaves a sentence that still reads. */
  removable: boolean;
}

function categorize(text: string): OutcomeCategory {
  const stems = new Set(contentWords(text).map(stemWord));
  for (const [category, terms] of CATEGORY_TERMS) {
    if (terms.some((term) => stems.has(stemWord(term)))) return category;
  }
  return 'unspecified';
}

/** Every outcome claim a piece of text makes. */
export function extractOutcomeClaims(text: string): OutcomeClaim[] {
  const clean = stripHtml(text);
  const claims: OutcomeClaim[] = [];
  const seen = new Set<string>();

  const push = (claim: OutcomeClaim) => {
    const key = `${claim.trigger.toLowerCase()}|${normalizeText(claim.object)}`;
    if (seen.has(key)) return;
    seen.add(key);
    claims.push(claim);
  };

  for (const { pattern, removable } of TRIGGERS) {
    const matcher = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(clean)) !== null) {
      const trigger = match[1] ?? '';
      const object = (match[2] ?? '').trim();
      if (!trigger) continue;
      push({
        phrase: match[0].trim(),
        trigger: trigger.trim(),
        object,
        // The object names what got better; the trigger alone does not.
        category: categorize(object || trigger),
        removable,
      });
    }
  }

  for (const { pattern, category } of STANDALONE_TRIGGERS) {
    const matcher = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(clean)) !== null) {
      push({
        phrase: match[0].trim(),
        trigger: match[0].trim(),
        object: '',
        category,
        // An adverb can always be struck.
        removable: true,
      });
    }
  }

  return claims;
}

// ============================================================================
// SUPPORT
// ============================================================================

export interface UnsupportedOutcome {
  claim: OutcomeClaim;
  /** The words in the claim this resume never uses. */
  unsupportedTerms: string[];
}

/**
 * Is the thing this claim says got better actually written on the resume?
 *
 * Every content word of the claim must appear somewhere in the resume's own
 * text. That is a strict test and deliberately so — but it is a test against
 * the *whole* resume, not against the bullet being rewritten, so a rewrite
 * that surfaces an outcome the user recorded elsewhere passes.
 */
function unsupportedTermsOf(claim: OutcomeClaim, stems: Set<string>): string[] {
  const words = contentWords(claim.object || claim.trigger);
  if (words.length === 0) return [];
  return [...new Set(words.filter((word) => !stems.has(stemWord(word))))];
}

export interface OutcomeCheckInput {
  /** The proposed replacement text. */
  proposed: string;
  /** The resume's current text at the same target. */
  original: string;
  /** Everything the resume says, from `buildResumeEvidence`. */
  evidence: ResumeEvidence;
}

/**
 * Outcome claims the rewrite added that the resume does not establish.
 *
 * A claim is *added* when the original asserts no benefit of the same kind.
 * Rewording an improvement the user already claimed is a paraphrase and is
 * not reported; claiming a new kind of benefit is, unless the resume's own
 * words support it.
 */
export function findUnsupportedOutcomeClaims(input: OutcomeCheckInput): UnsupportedOutcome[] {
  const proposedClaims = extractOutcomeClaims(input.proposed);
  if (proposedClaims.length === 0) return [];

  const originalClaims = extractOutcomeClaims(input.original);
  const originalCategories = new Set(originalClaims.map((claim) => claim.category));
  const originalPhrases = new Set(
    originalClaims.map((claim) => `${claim.trigger.toLowerCase()}|${normalizeText(claim.object)}`)
  );

  const stems = resumeStems(input.evidence);
  const findings: UnsupportedOutcome[] = [];

  for (const claim of proposedClaims) {
    const key = `${claim.trigger.toLowerCase()}|${normalizeText(claim.object)}`;
    // Already in the original, verbatim: the user's own claim, untouched.
    if (originalPhrases.has(key)) continue;
    // The original already claims this kind of benefit, so the rewrite is
    // rephrasing it rather than inventing one.
    if (originalCategories.has(claim.category)) continue;

    const unsupportedTerms = unsupportedTermsOf(claim, stems);
    if (unsupportedTerms.length === 0) continue;

    findings.push({ claim, unsupportedTerms });
  }

  return findings;
}
