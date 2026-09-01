/**
 * Lightweight tokenization helpers for JD ↔ resume matching.
 */

const STOPWORDS = new Set(
  [
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'as',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'should',
    'could',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'you',
    'your',
    'we',
    'our',
    'they',
    'their',
    'i',
    'me',
    'my',
    'he',
    'she',
    'his',
    'her',
    'who',
    'what',
    'which',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'nor',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'about',
    'into',
    'over',
    'after',
    'before',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'also',
    'job',
    'role',
    'position',
    'team',
    'work',
    'working',
    'experience',
    'years',
    'year',
    'including',
    'include',
    'includes',
    'required',
    'require',
    'requirements',
    'preferred',
    'preference',
    'ability',
    'able',
    'using',
    'use',
    'used',
    'across',
    'within',
    'etc',
    'eg',
    'ie',
    'new',
    'well',
    'strong',
    'good',
    'great',
    'excellent',
    'please',
    'apply',
    'application',
    'company',
    'opportunity',
    'candidate',
    'candidates',
    'description',
    'responsibilities',
    'responsibility',
    'qualification',
    'qualifications',
    'benefit',
    'benefits',
    'equal',
    'employer',
    'status',
    'gender',
    'race',
    'disability',
  ].map((w) => w.toLowerCase())
);

/** Normalize for comparison: lower-case, collapse punctuation. */
export function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Split text into meaningful tokens (words + common multi-word tech phrases kept as singles when hyphenated/slashed).
 */
export function tokenize(text: string): string[] {
  const normalized = normalizeToken(text);
  if (!normalized) return [];

  const parts = normalized.split(' ').filter(Boolean);
  const out: string[] = [];

  for (const part of parts) {
    if (part.length < 2) continue;
    if (STOPWORDS.has(part)) continue;
    // Drop pure numbers unless they look like versions (kept via earlier normalize)
    if (/^\d+$/.test(part)) continue;
    out.push(part);
  }

  return out;
}

export function uniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** Extract likely skill-like phrases: tokens that appear in resume skills or look technical. */
export function extractKeywordCandidates(jdText: string, knownSkills: string[]): string[] {
  const jdTokens = uniqueTokens(jdText);
  const skillNorm = knownSkills
    .map((s) => normalizeToken(s))
    .filter(Boolean)
    .map((s) => s.replace(/\s+/g, ' '));

  const matchedFromSkills: string[] = [];
  const jdLower = normalizeToken(jdText);

  for (const skill of skillNorm) {
    if (!skill) continue;
    // Multi-word or single: substring match in JD
    if (jdLower.includes(skill) || jdTokens.has(skill.split(' ')[0] ?? '')) {
      if (skill.split(' ').every((t) => t.length < 2 || jdLower.includes(t) || jdTokens.has(t))) {
        // Prefer exact phrase presence
        if (jdLower.includes(skill)) {
          matchedFromSkills.push(skill);
        }
      }
    }
  }

  // Also pull capitalized / tech-looking tokens from JD that aren't stopwords
  const techish = [...jdTokens].filter((t) => {
    if (t.length < 3) return false;
    // Common tech signals
    return (
      /[+#.]/.test(t) ||
      /^(react|node|python|java|aws|gcp|azure|sql|api|ui|ux|ml|ai|ios|android|typescript|javascript|golang|rust|kotlin|swift|docker|kubernetes|k8s|terraform|graphql|redis|postgres|mongodb|spark|kafka|figma|salesforce|workday)$/i.test(
        t
      )
    );
  });

  const combined = new Set([...matchedFromSkills, ...techish]);
  return [...combined];
}

export function bandFromScore(score: number): import('./types').MatchBand {
  if (score >= 75) return 'strong';
  if (score >= 55) return 'good';
  if (score >= 35) return 'fair';
  return 'weak';
}

export function labelForBand(band: import('./types').MatchBand): string {
  switch (band) {
    case 'strong':
      return 'Strong match';
    case 'good':
      return 'Good match';
    case 'fair':
      return 'Fair match';
    case 'weak':
      return 'Weak match';
  }
}
