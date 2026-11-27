/**
 * What a job posting asks a candidate to have, read by a model with the
 * company story, benefits, and legal text left out. Safe to import in the
 * browser: no model client here.
 */

export const REQUIREMENT_KINDS = ['tool', 'practice', 'domain', 'credential'] as const;

/**
 * tool: a named technology, language, platform, or product.
 * practice: a concrete skill or method. domain: an industry or business area.
 * credential: a degree, certification, or license.
 */
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export type RequirementImportance = 'required' | 'preferred';

export interface JobRequirement {
  /** As the posting writes it. */
  term: string;
  kind: RequirementKind;
  importance: RequirementImportance;
  /** Other names for exactly the same thing, e.g. "Postgres" for PostgreSQL. */
  aliases: string[];
  /** Broader skills it belongs to, e.g. "Relational databases" for PostgreSQL. */
  broader?: string[];
  /** For a degree: the lowest level and the fields it accepts. */
  degree?: DegreeHint | null;
}

export interface DegreeHint {
  /** "bachelors", "masters", and so on; null for "a degree". */
  level: string | null;
  fields: string[];
  /** "or a related field", "or equivalent". */
  orRelated: boolean;
}

export const JOB_REQUIREMENT_LIMITS = {
  maxItems: 25,
  maxAliases: 3,
  maxBroader: 3,
  maxFields: 4,
  maxTermChars: 80,
  maxAliasChars: 40,
} as const;
