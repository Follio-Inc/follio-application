/**
 * Regenerate the university name → domain lookup used by the brand logo service.
 *
 * Source: Hipo/university-domains-list, the standard open-source dataset of
 * world universities and their registered domains (~10k institutions).
 *
 * We need this because a university's domain frequently cannot be derived from
 * its name: "University of San Francisco" is usfca.edu, "UC Berkeley" is
 * berkeley.edu, "MIT" is mit.edu. Guessing produces misses at best and another
 * institution's logo at worst.
 *
 * Usage: node scripts/build-university-domains.mjs
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';

const OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'lib',
  'brand-logo',
  'data',
  'university-domains.json'
);

/** Must stay in sync with `normalizeSchoolName` in lib/brand-logo/universities.ts. */
function normalizeName(name) {
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

/** Shortest domain wins: it is the institution's root, not a campus or service. */
function pickDomain(domains) {
  return [...domains].filter(Boolean).sort((a, b) => a.length - b.length)[0] ?? null;
}

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`Failed to download dataset: HTTP ${response.status}`);
}

const universities = await response.json();
const lookup = {};
let skipped = 0;

for (const entry of universities) {
  const key = normalizeName(entry.name ?? '');
  const domain = pickDomain(entry.domains ?? []);

  if (!key || !domain) {
    skipped += 1;
    continue;
  }

  // First entry wins. The dataset is roughly alphabetical by country, and
  // duplicate names across countries are rare enough that either is defensible.
  if (!lookup[key]) lookup[key] = domain;
}

const sorted = Object.fromEntries(Object.entries(lookup).sort(([a], [b]) => a.localeCompare(b)));

await writeFile(OUT_PATH, `${JSON.stringify(sorted)}\n`, 'utf8');

console.log(`Wrote ${Object.keys(sorted).length} universities (${skipped} skipped) to ${OUT_PATH}`);
