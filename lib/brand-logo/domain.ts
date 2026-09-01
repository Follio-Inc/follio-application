/**
 * Resolve a company or school name to the domain that owns its logo.
 *
 * There is no authoritative free name-to-domain index, so this produces an
 * ordered list of *candidates*. The fetcher tries each in turn and keeps the
 * first that returns a real logo, which means a wrong guess costs a miss rather
 * than showing the wrong company's mark.
 */

import { universityDomain } from './universities';

export type BrandKind = 'company' | 'school';

/** Legal suffixes carry no signal in a domain name. */
const LEGAL_SUFFIXES = [
  'incorporated',
  'inc',
  'corporation',
  'corp',
  'company',
  'co',
  'limited',
  'ltd',
  'llc',
  'llp',
  'plc',
  'gmbh',
  'ag',
  'sa',
  'nv',
  'bv',
  'ab',
  'oy',
  'as',
  'pty',
  'pvt',
  'private',
  'holdings',
  'group',
  'technologies',
  'labs',
];

/** Words that schools share, so they rarely appear in the domain. */
const SCHOOL_FILLER = ['university', 'college', 'institute', 'school', 'of', 'the', 'at'];

/**
 * Deliberately narrow. Guessing extra TLDs finds unrelated real companies
 * rather than the right one — `google.io` and `techscale.io` both serve real
 * logos for businesses that are not the employer being described. A monogram
 * beats another company's mark, so anything outside these lists needs an
 * explicit company or school URL.
 */
const TLDS: Record<BrandKind, string[]> = {
  company: ['com'],
  school: ['edu', 'ac.uk'],
};

const MAX_CANDIDATES = 4;

/** Strips accents so "Nestlé" becomes "nestle". */
function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function words(name: string): string[] {
  return (
    deaccent(name)
      .toLowerCase()
      // Collapse dotted abbreviations so "S.A." and "N.V." survive as single
      // tokens and can be recognized as legal suffixes.
      .replace(/\b(?:[a-z]\.){2,}/g, (match) => match.replace(/\./g, ''))
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter(Boolean)
  );
}

/**
 * Extract a bare hostname from a user-supplied URL.
 * Returns null for anything that is not a public http(s) host.
 */
export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const raw = url.trim();

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  // Reject bare hostnames, IPs, and internal addresses.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  if (/^\d+\./.test(host)) return null;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;

  return host;
}

/**
 * Ordered domain candidates for a brand name, best guess first.
 * Returns an empty list when the name is too generic to guess safely.
 */
export function domainCandidates(name: string, kind: BrandKind): string[] {
  const all = words(name);
  if (all.length === 0) return [];

  const meaningful =
    kind === 'school'
      ? all.filter((word) => !SCHOOL_FILLER.includes(word))
      : all.filter((word) => !LEGAL_SUFFIXES.includes(word));

  // Everything was filler ("Holdings Group", "University of"). Not guessable.
  if (meaningful.length === 0) return [];
  const core = meaningful;

  // A single very short token ("X", "Go") collides with too many unrelated
  // domains to risk showing its logo.
  const joined = core.join('');
  if (joined.length < 4) return [];

  const stems = [joined];
  // "Molson Coors Beverage" also lives at molsoncoors.com — try dropping the
  // trailing descriptor, but never below two words.
  if (core.length > 2) {
    stems.push(core.slice(0, 2).join(''));
  }
  // Schools are commonly known by a qualifier plus a place: "UC Berkeley" is
  // berkeley.edu. Safe here because it is paired only with academic TLDs.
  if (kind === 'school' && core.length > 1) {
    const last = core[core.length - 1];
    if (last.length >= 4) stems.push(last);
  }

  const candidates: string[] = [];
  for (const tld of TLDS[kind]) {
    for (const stem of stems) {
      const candidate = `${stem}.${tld}`;
      if (!candidates.includes(candidate)) candidates.push(candidate);
    }
  }

  return candidates.slice(0, MAX_CANDIDATES);
}

/**
 * Full candidate list for a brand, in order of confidence:
 *
 * 1. An explicit URL — the person told us where they work or studied.
 * 2. For schools, an exact match in the university dataset.
 * 3. Name-shaped guesses, verified by the fetcher before use.
 */
export function resolveBrandDomains(input: {
  name: string;
  url?: string | null;
  kind: BrandKind;
}): string[] {
  const explicit = domainFromUrl(input.url);
  if (explicit) return [explicit];

  const guesses = domainCandidates(input.name, input.kind);

  if (input.kind === 'school') {
    const known = universityDomain(input.name);
    // Known-good first, but keep the guesses as a fallback for institutions
    // missing from the dataset.
    if (known) return [known, ...guesses.filter((domain) => domain !== known)];
  }

  return guesses;
}
