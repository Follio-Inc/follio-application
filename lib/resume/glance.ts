/**
 * Recruiter highlights, already written for a resume.
 * Opening Highlights only reads this. The resume text stays the source: each
 * company gets marker phrases copied from its own bullets, one impact summary,
 * and a few skill tags, all drawn into the resume itself.
 */

/** The stored shape the page draws. An older stored glance is rewritten on the next read in the builder. */
export const GLANCE_VERSION = 2;

export const GLANCE_LIMITS = {
  /** One sentence that fits one line of the impact box on a letter-width page. */
  summaryChars: 105,
  /** A marker stroke, not a sentence. */
  phraseChars: 60,
  /** Marker phrases per company. More and nothing stands out. */
  phrases: 6,
  /** Tags in the skills box: the key skills the role demonstrated. */
  skills: 5,
  /** Characters in one tag. */
  skillChars: 40,
} as const;

export type GlanceCompany = {
  company: string;
  /** Exact spans from this company's bullets, drawn with a marker. */
  phrases: string[];
  /** The combined impact of this company's bullets. */
  summary: string | null;
  /** Skills those bullets prove. */
  skills: string[];
};

export type ResumeGlance = {
  version: 2;
  companies: GlanceCompany[];
};

export function emptyGlance(): ResumeGlance {
  return { version: 2, companies: [] };
}

export function glanceHasNotes(glance: ResumeGlance | null | undefined): boolean {
  return Boolean(glance?.companies.length);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((item): item is string => Boolean(item));
}

function parseCompany(item: unknown, version: 1 | 2): GlanceCompany[] {
  if (!item || typeof item !== 'object') return [];
  const row = item as Record<string, unknown>;
  const company = asString(row.company);
  if (!company) return [];
  const parsed: GlanceCompany = {
    company,
    // A version 1 note had no marker phrases and called its summary "impact".
    phrases: version === 2 ? asStringList(row.phrases) : [],
    summary: asString(version === 2 ? row.summary : row.impact),
    skills: asStringList(row.skills),
  };
  if (!parsed.summary && parsed.skills.length === 0 && parsed.phrases.length === 0) return [];
  return [parsed];
}

/**
 * Accept a stored JSON value. A broken payload reads as no highlights,
 * never as a half-parsed paragraph. A version 1 sticky-note glance keeps its
 * company impact and skills until the next save rewrites it.
 */
export function parseResumeGlance(value: unknown): ResumeGlance | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 && raw.version !== 2) return null;
  const version = raw.version;
  const companies = Array.isArray(raw.companies)
    ? raw.companies.flatMap((item) => parseCompany(item, version))
    : [];
  return { version: 2, companies };
}
