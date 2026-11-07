/**
 * Degrees are compared by level and field, never as text. "B.Tech, Computer
 * Science and Engineering" meets "Bachelor's degree in Computer Science",
 * and "MS in a technical field" is met by any computing or engineering
 * master's or higher.
 */

import { foldPhrase, indexText } from '@/services/ai/evaluate/keywords';
import type { DegreeHint } from '@/services/ai/job-requirements/types';

export const DEGREE_LEVELS = ['diploma', 'associate', 'bachelors', 'masters', 'doctorate'] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

export const DEGREE_LEVEL_LABELS: Record<DegreeLevel, string> = {
  diploma: 'Diploma',
  associate: 'Associate degree',
  bachelors: 'Bachelor’s degree',
  masters: 'Master’s degree',
  doctorate: 'Doctorate',
};

/** Field families. A requirement of "computer science or a related field" accepts the same primary family. */
type Family =
  | 'computing'
  | 'engineering'
  | 'science'
  | 'math'
  | 'business'
  | 'design'
  | 'social'
  | 'humanities'
  | 'health'
  | 'law';

interface FieldEntry {
  id: string;
  label: string;
  aka: readonly string[];
  /** The first is the primary family. */
  families: readonly Family[];
}

const FIELDS: readonly FieldEntry[] = [
  {
    id: 'computer-science',
    label: 'Computer Science',
    aka: [
      'computer science',
      'cs',
      'comp sci',
      'computing',
      'computer sciences',
      'computer and information science',
      'computer and information sciences',
      'cse',
      'computer science and engineering',
      'computer science engineering',
      'computer applications',
      'mca',
      'bca',
    ],
    families: ['computing', 'math'],
  },
  {
    id: 'computer-engineering',
    label: 'Computer Engineering',
    aka: [
      'computer engineering',
      'cse',
      'computer science and engineering',
      'computer science engineering',
      'computer systems engineering',
      'electrical and computer engineering',
    ],
    families: ['computing', 'engineering'],
  },
  {
    id: 'software-engineering',
    label: 'Software Engineering',
    aka: ['software engineering', 'software development'],
    families: ['computing', 'engineering'],
  },
  {
    id: 'information-technology',
    label: 'Information Technology',
    aka: ['information technology', 'information and communication technology', 'ict'],
    families: ['computing'],
  },
  {
    id: 'information-systems',
    label: 'Information Systems',
    aka: [
      'information systems',
      'management information systems',
      'mis',
      'computer information systems',
      'cis',
    ],
    families: ['computing', 'business'],
  },
  {
    id: 'data-science',
    label: 'Data Science',
    aka: ['data science', 'data analytics', 'analytics', 'business analytics'],
    families: ['computing', 'math'],
  },
  {
    id: 'artificial-intelligence',
    label: 'Artificial Intelligence',
    aka: ['artificial intelligence', 'ai', 'machine learning'],
    families: ['computing', 'math'],
  },
  {
    id: 'electrical-engineering',
    label: 'Electrical Engineering',
    aka: [
      'electrical engineering',
      'ee',
      'eee',
      'electrical and electronics engineering',
      'electrical and electronic engineering',
      'electrical and computer engineering',
    ],
    families: ['engineering', 'science'],
  },
  {
    id: 'electronics-engineering',
    label: 'Electronics Engineering',
    aka: [
      'electronics engineering',
      'electronics',
      'ece',
      'electronics and communication engineering',
      'electronics and communications engineering',
      'electronics and telecommunication engineering',
    ],
    families: ['engineering', 'science'],
  },
  {
    id: 'mechanical-engineering',
    label: 'Mechanical Engineering',
    aka: ['mechanical engineering'],
    families: ['engineering', 'science'],
  },
  {
    id: 'civil-engineering',
    label: 'Civil Engineering',
    aka: ['civil engineering'],
    families: ['engineering', 'science'],
  },
  {
    id: 'chemical-engineering',
    label: 'Chemical Engineering',
    aka: ['chemical engineering'],
    families: ['engineering', 'science'],
  },
  {
    id: 'industrial-engineering',
    label: 'Industrial Engineering',
    aka: [
      'industrial engineering',
      'operations research',
      'industrial and systems engineering',
      'systems engineering',
    ],
    families: ['engineering', 'math'],
  },
  {
    id: 'aerospace-engineering',
    label: 'Aerospace Engineering',
    aka: ['aerospace engineering', 'aeronautical engineering'],
    families: ['engineering', 'science'],
  },
  {
    id: 'biomedical-engineering',
    label: 'Biomedical Engineering',
    aka: ['biomedical engineering', 'bioengineering'],
    families: ['engineering', 'science', 'health'],
  },
  {
    id: 'engineering',
    label: 'Engineering',
    aka: ['engineering'],
    families: ['engineering'],
  },
  {
    id: 'mathematics',
    label: 'Mathematics',
    aka: ['mathematics', 'math', 'maths', 'applied mathematics', 'applied math'],
    families: ['math', 'science'],
  },
  {
    id: 'statistics',
    label: 'Statistics',
    aka: ['statistics', 'applied statistics', 'biostatistics'],
    families: ['math', 'science'],
  },
  {
    id: 'physics',
    label: 'Physics',
    aka: ['physics', 'applied physics', 'engineering physics'],
    families: ['science', 'math'],
  },
  {
    id: 'chemistry',
    label: 'Chemistry',
    aka: ['chemistry', 'biochemistry'],
    families: ['science'],
  },
  {
    id: 'biology',
    label: 'Biology',
    aka: ['biology', 'life sciences', 'biological sciences', 'biotechnology', 'neuroscience'],
    families: ['science', 'health'],
  },
  {
    id: 'economics',
    label: 'Economics',
    aka: ['economics', 'econ', 'econometrics'],
    families: ['social', 'math', 'business'],
  },
  {
    id: 'finance',
    label: 'Finance',
    aka: ['finance', 'financial engineering', 'banking and finance'],
    families: ['business', 'math'],
  },
  {
    id: 'accounting',
    label: 'Accounting',
    aka: ['accounting', 'accountancy', 'commerce', 'bcom', 'mcom'],
    families: ['business'],
  },
  {
    id: 'business-administration',
    label: 'Business Administration',
    aka: [
      'business administration',
      'business',
      'management',
      'business management',
      'mba',
      'bba',
      'entrepreneurship',
    ],
    families: ['business'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    aka: ['marketing', 'advertising'],
    families: ['business'],
  },
  {
    id: 'communications',
    label: 'Communications',
    aka: [
      'communications',
      'communication',
      'mass communication',
      'media studies',
      'journalism',
      'public relations',
    ],
    families: ['humanities', 'social'],
  },
  {
    id: 'design',
    label: 'Design',
    aka: [
      'design',
      'graphic design',
      'visual design',
      'industrial design',
      'interaction design',
      'product design',
      'fine arts',
      'bfa',
      'mfa',
      'hci',
      'human computer interaction',
    ],
    families: ['design', 'computing'],
  },
  {
    id: 'psychology',
    label: 'Psychology',
    aka: ['psychology', 'cognitive science'],
    families: ['social', 'science'],
  },
  {
    id: 'social-sciences',
    label: 'Social Sciences',
    aka: [
      'sociology',
      'political science',
      'social sciences',
      'anthropology',
      'international relations',
      'public policy',
    ],
    families: ['social'],
  },
  {
    id: 'humanities',
    label: 'Humanities',
    aka: [
      'english',
      'literature',
      'history',
      'philosophy',
      'linguistics',
      'humanities',
      'liberal arts',
    ],
    families: ['humanities'],
  },
  {
    id: 'health',
    label: 'Health Sciences',
    aka: ['nursing', 'medicine', 'public health', 'pharmacy', 'health sciences', 'mbbs'],
    families: ['health', 'science'],
  },
  {
    id: 'law',
    label: 'Law',
    aka: ['law', 'llb', 'legal studies'],
    families: ['law'],
  },
];

/** Words a posting uses for a group of fields rather than one field. */
const FAMILY_WORDS: Record<string, readonly Family[]> = {
  technical: ['computing', 'engineering', 'math', 'science'],
  stem: ['computing', 'engineering', 'math', 'science'],
  quantitative: ['math', 'computing', 'engineering', 'science'],
  'computer related': ['computing'],
  'computer related field': ['computing'],
  analytical: ['math', 'computing', 'engineering', 'science'],
};

const fieldsByForm = new Map<string, string[]>();
const fieldById = new Map<string, FieldEntry>();
let longestField = 1;
for (const field of FIELDS) {
  fieldById.set(field.id, field);
  for (const name of [field.label, ...field.aka]) {
    const fold = foldPhrase(name);
    const ids = fieldsByForm.get(fold) ?? [];
    if (!ids.includes(field.id)) ids.push(field.id);
    fieldsByForm.set(fold, ids);
    longestField = Math.max(longestField, fold.split(' ').length);
  }
}

/** Spellings of each level, as folded tokens or phrases. */
const LEVEL_FORMS: Record<DegreeLevel, readonly string[]> = {
  doctorate: ['phd', 'doctorate', 'doctoral', 'dphil', 'doctor of philosophy', 'edd', 'dba'],
  masters: [
    'master',
    'masters',
    'ms',
    'msc',
    'ma',
    'mtech',
    'meng',
    'mba',
    'mca',
    'mfa',
    'mph',
    'mse',
    'mres',
    'mphil',
    'mcom',
    'llm',
    'graduate degree',
    'postgraduate',
    'post graduate',
  ],
  bachelors: [
    'bachelor',
    'bachelors',
    'bs',
    'bsc',
    'ba',
    'btech',
    'beng',
    'bca',
    'bba',
    'bcom',
    'bfa',
    'bse',
    'bsc hons',
    'ab',
    'undergraduate degree',
    'llb',
    'mbbs',
    'four year degree',
    '4 year degree',
  ],
  associate: ['associate', 'associates', 'aa', 'aas', 'associate degree'],
  diploma: ['diploma', 'high school', 'ged', 'secondary school'],
};

/** "BE" and "ME" read as degrees only in capitals, so "be" and "me" in a sentence do not. */
const DOTTED_LEVELS: Record<string, DegreeLevel> = {
  be: 'bachelors',
  me: 'masters',
  as: 'associate',
};

function rank(level: DegreeLevel): number {
  return DEGREE_LEVELS.indexOf(level);
}

/** "B.Tech" and "Ph.D." as one word each; the shared tokenizer reads "B.T" as an initialism. */
function undot(text: string): string {
  return text.replace(/(?<=[A-Za-z])\.(?=[A-Za-z])/g, '');
}

/** Every degree level a text names, lowest first. "BS/MS" is bachelor's and master's. */
export function readDegreeLevels(text: string): DegreeLevel[] {
  const tokens = indexText(undot(text));
  const folds = tokens.map((token) => token.fold);
  const found = new Set<DegreeLevel>();
  for (const level of DEGREE_LEVELS) {
    for (const form of LEVEL_FORMS[level]) {
      const parts = form.split(' ');
      for (let i = 0; i + parts.length <= folds.length; i += 1) {
        if (parts.every((part, offset) => folds[i + offset] === part)) found.add(level);
      }
    }
  }
  for (const token of tokens) {
    const level = DOTTED_LEVELS[token.fold];
    if (level && token.raw === token.raw.toUpperCase()) found.add(level);
  }
  return [...found].sort((a, b) => rank(a) - rank(b));
}

/** Field ids a text names, longest phrase first. "Computer Science and Engineering" is CS and computer engineering. */
export function readFields(text: string): string[] {
  const folds = indexText(undot(text)).map((token) => token.fold);
  const ids = new Set<string>();
  let i = 0;
  while (i < folds.length) {
    let step = 1;
    for (let size = Math.min(longestField, folds.length - i); size >= 1; size -= 1) {
      const matched = fieldsByForm.get(folds.slice(i, i + size).join(' '));
      if (!matched) continue;
      for (const id of matched) ids.add(id);
      step = size;
      break;
    }
    i += step;
  }
  // "Engineering" alone adds nothing once a specific engineering field is named.
  if (ids.size > 1) ids.delete('engineering');
  return [...ids];
}

function familiesOf(fieldIds: readonly string[]): Set<Family> {
  return new Set(fieldIds.flatMap((id) => fieldById.get(id)?.families ?? []));
}

function primaryFamilies(fieldIds: readonly string[]): Set<Family> {
  return new Set(
    fieldIds.flatMap((id) => {
      const primary = fieldById.get(id)?.families[0];
      return primary ? [primary] : [];
    })
  );
}

function familyWords(text: string): Set<Family> {
  const fold = ` ${foldPhrase(text)} `;
  const families = new Set<Family>();
  for (const [word, list] of Object.entries(FAMILY_WORDS)) {
    if (fold.includes(` ${word} `)) for (const family of list) families.add(family);
  }
  return families;
}

export function fieldLabel(id: string): string {
  return fieldById.get(id)?.label ?? id;
}

/** One education entry, read for matching. */
export interface ResumeDegree {
  ref: string;
  /** As the resume writes it, e.g. "B.Tech, Computer Science and Engineering". */
  label: string;
  /** The highest level the entry names, or null when it names none. */
  level: DegreeLevel | null;
  fields: string[];
}

export function readResumeDegree(
  ref: string,
  entry: { degree: string; field: string }
): ResumeDegree {
  const levels = readDegreeLevels(`${entry.degree} ${entry.field}`);
  return {
    ref,
    label: [entry.degree, entry.field].filter(Boolean).join(', '),
    level: levels[levels.length - 1] ?? null,
    fields: readFields(`${entry.field} ${entry.degree}`),
  };
}

/** What a posting asks for in a degree. Hints from the model fill in what the wording leaves out. */
export interface DegreeRequirement {
  /** The lowest level accepted, or null for "a degree". */
  level: DegreeLevel | null;
  fields: string[];
  families: Family[];
  /** "or a related field", "or equivalent": the field's family is enough. */
  orRelated: boolean;
}

const RELATED_WORDS = /\b(related|equivalent|similar|relevant|comparable|allied)\b/i;

function readLevelHint(value: string | null | undefined): DegreeLevel | null {
  if (!value) return null;
  const direct = DEGREE_LEVELS.find((level) => level === value.trim().toLowerCase());
  return direct ?? readDegreeLevels(value)[0] ?? null;
}

/** Whether a requirement is about a degree at all. */
export function isDegreeText(text: string): boolean {
  return /\bdegree\b/i.test(text) || readDegreeLevels(text).length > 0;
}

export function readDegreeRequirement(
  term: string,
  hint: DegreeHint | null = null
): DegreeRequirement {
  const fieldText = [term, ...(hint?.fields ?? [])].join(' ; ');
  return {
    level: readDegreeLevels(term)[0] ?? readLevelHint(hint?.level),
    fields: readFields(fieldText),
    families: [...familyWords(fieldText)],
    orRelated: hint?.orRelated === true || RELATED_WORDS.test(term),
  };
}

export type DegreeFit = 'meets' | 'partly' | 'no';

export interface DegreeMatch {
  fit: DegreeFit;
  degree: ResumeDegree | null;
}

function fieldFits(requirement: DegreeRequirement, degree: ResumeDegree): boolean {
  if (requirement.fields.length === 0 && requirement.families.length === 0) return true;
  if (degree.fields.some((id) => requirement.fields.includes(id))) return true;
  const have = familiesOf(degree.fields);
  if (requirement.families.some((family) => have.has(family))) return true;
  // A bare "Engineering" accepts any engineering field.
  if (requirement.fields.includes('engineering') && have.has('engineering')) return true;
  if (!requirement.orRelated) return false;
  const wanted = primaryFamilies(requirement.fields);
  return [...primaryFamilies(degree.fields)].some((family) => wanted.has(family));
}

function levelFits(requirement: DegreeRequirement, degree: ResumeDegree): boolean | null {
  if (!requirement.level) return true;
  if (!degree.level) return null;
  return rank(degree.level) >= rank(requirement.level);
}

/**
 * The best education entry for a degree requirement. Meets: level and field
 * both fit. Partly: one of them fits, e.g. the right field at a lower level.
 */
export function matchDegree(
  requirement: DegreeRequirement,
  degrees: readonly ResumeDegree[]
): DegreeMatch {
  let partly: ResumeDegree | null = null;
  for (const degree of degrees) {
    const level = levelFits(requirement, degree);
    const field = fieldFits(requirement, degree);
    if (level === true && field) return { fit: 'meets', degree };
    if (!partly && (field || level === true)) partly = degree;
  }
  return partly ? { fit: 'partly', degree: partly } : { fit: 'no', degree: null };
}
