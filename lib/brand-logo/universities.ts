import universityDomains from './data/university-domains.json';

/**
 * Name → domain lookup for universities, backed by the open-source
 * Hipo/university-domains-list dataset (~10k institutions worldwide).
 *
 * A school's domain usually cannot be derived from its name: the University of
 * San Francisco is usfca.edu, MIT is mit.edu, Oxford is ox.ac.uk. Guessing
 * yields a miss at best; the dataset turns these into exact hits.
 *
 * Regenerate with `node scripts/build-university-domains.mjs`.
 */

const lookup = universityDomains as Record<string, string>;

/** Must stay in sync with `normalizeName` in scripts/build-university-domains.mjs. */
function normalizeSchoolName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/\s+/g, '');
}

/**
 * Common ways people write a school that differ from its dataset name.
 * Tried in order; the first that resolves wins.
 */
function variants(name: string): string[] {
  const base = normalizeSchoolName(name);
  const forms = new Set<string>([base]);

  // "Univ." / "U of X" style shorthands.
  forms.add(base.replace(/^univ(ersityof)?/, 'universityof'));
  forms.add(base.replace(/^uof/, 'universityof'));

  // People often drop or add the "University of" prefix.
  if (base.startsWith('universityof')) {
    forms.add(base.slice('universityof'.length));
  } else {
    forms.add(`universityof${base}`);
  }

  return [...forms].filter(Boolean);
}

/** The registered domain for a school name, or null when it is not in the dataset. */
export function universityDomain(name: string): string | null {
  if (!name?.trim()) return null;

  for (const key of variants(name)) {
    const domain = lookup[key];
    if (domain) return domain;
  }

  return null;
}
