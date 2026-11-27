/**
 * Deterministic resume quality analysis — types.
 *
 * This module answers questions that can be settled by reading the resume
 * text itself: is a section empty, does a bullet carry a number, does it open
 * with an action verb, is it padded with filler. None of it is a judgement
 * about the person, and none of it needs a model — which is the point. The
 * Evaluation Agent uses these findings as its evidence and spends the model
 * only on prioritising and phrasing them.
 */

/** How much substance an item carries. Matches the portfolio assessor's bands. */
export type ItemQuality = 'rich' | 'adequate' | 'thin' | 'empty';

export type FindingSeverity = 'high' | 'medium' | 'low';

/**
 * One thing worth fixing, located precisely enough that a user can act on it.
 *
 * `evidence` quotes the resume's own text so every finding is checkable, and
 * nothing here asserts anything the resume does not say.
 */
export interface QualityFinding {
  /** Stable code, e.g. 'no-metrics', 'weak-opener'. */
  code: string;
  severity: FindingSeverity;
  /** Where it was found, e.g. "Senior Engineer @ Acme". */
  location: string;
  /** What was observed, stated factually. */
  detail: string;
  /** The resume's own words, when the finding points at specific text. */
  evidence?: string;
}

export interface BulletAnalysis {
  text: string;
  length: number;
  /** Contains a number, percentage, or currency amount. */
  hasMetric: boolean;
  /** Opens with something that reads as an action verb. */
  startsWithActionVerb: boolean;
  /** Filler phrases found, e.g. "responsible for". */
  weakPhrases: string[];
}

export interface ExperienceAnalysis {
  id: string;
  location: string;
  bulletCount: number;
  quality: ItemQuality;
  bulletsWithMetrics: number;
  bullets: BulletAnalysis[];
}

export interface ProjectAnalysis {
  id: string;
  title: string;
  quality: ItemQuality;
  hasDescription: boolean;
  highlightCount: number;
  techCount: number;
}

/** Counts computed from the stored resume, never from a model. */
export interface QualityCounts {
  experiences: number;
  education: number;
  skills: number;
  projects: number;
  totalBullets: number;
  bulletsWithMetrics: number;
}

export interface ResumeQualityReport {
  /** Sections that are empty, in a stable order. */
  missingSections: string[];
  counts: QualityCounts;
  /** Share of bullets carrying a measurable result, 0–100. */
  metricCoveragePercent: number;
  experiences: ExperienceAnalysis[];
  projects: ProjectAnalysis[];
  /** Everything worth fixing, most severe first. */
  findings: QualityFinding[];
  /** How this report was produced. Surfaced so nothing reads as a verdict. */
  basis: string;
}

/**
 * The resume shape this module needs.
 *
 * A structural subset of `ConnectorProfileView`, so the agent's
 * `AgentResumeView` is assignable without an adapter, while this module stays
 * independent of the connector's exact type.
 */
export interface ResumeForQuality {
  headline: string | null;
  summary: string | null;
  contact: { email: string | null; phone: string | null; website: string | null };
  experiences: Array<{ id: string; company: string; role: string; bullets: string[] }>;
  education: Array<{ id: string; institution: string; degree: string | null }>;
  skills: string[];
  projects: Array<{
    id: string;
    title: string;
    description: string | null;
    highlights: string[];
    techStack: string[];
  }>;
}
