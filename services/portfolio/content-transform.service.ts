/**
 * Portfolio Content Transform Service
 *
 * Turns resume-shaped profile data into portfolio-owned content:
 * short summaries, at most one highlight per role, concise project blurbs.
 *
 * Sources (onboarding parse or a Follio resume) are snapshotted here and then
 * live independently in `TemplatePortfolio.content`. Narrative copy (About me,
 * headlines) is produced by the existing pipeline; this service owns the
 * structural entries templates render in experience / projects / awards.
 *
 * All owned text is plain text — TipTap HTML from the resume is stripped at
 * the transform boundary before AI or deterministic shaping.
 */

import { executeAICall, isAIAvailable } from '@/lib/ai-client';
import { logger } from '@/lib/logger';
import {
  cloneProfileData,
  sanitizeOwnedProfileText,
  toPortfolioPlainText,
} from '@/lib/portfolio/templates/content';

import type { TemplateProfileData } from '@/lib/portfolio/templates/types';

const transformLogger = logger.child({ source: 'portfolio-content-transform' });

/** Max characters for a deterministic (non-AI) summary fallback. */
const DETERMINISTIC_SUMMARY_MAX = 280;

export interface ContentTransformOptions {
  /**
   * Project narratives from Stage D (keyed by exact project title).
   * Baked into `projects[].description` so templates render owned text.
   */
  projectNarratives?: Record<string, string>;
  /** Skip the AI call and use deterministic truncation only. */
  skipAI?: boolean;
}

interface ExperienceTransform {
  summary: string;
}

interface ProjectTransform {
  description: string;
}

interface AwardTransform {
  description: string;
}

interface ContentTransformAIResult {
  experiences?: Record<string, ExperienceTransform>;
  projects?: Record<string, ProjectTransform>;
  awards?: Record<string, AwardTransform>;
}

const SYSTEM_PROMPT = `You are a portfolio editor. You rewrite resume-style entries into portfolio-style entries.

THIS IS NOT A RESUME:
- Portfolio entries are short, human, and scannable.
- Each work experience gets ONE summary sentence (two only if impact truly needs it). Never a bullet list.
- Project descriptions are 1-2 sentences: what it is and why it matters. Lead with impact or purpose.
- Award descriptions are one short sentence or empty if nothing meaningful.
- NEVER invent metrics, employers, titles, or technologies. Only rephrase what is given.
- Drop filler resume language ("Responsible for", "Leveraged", "Spearheaded").
- Prefer concrete outcomes over duties.
- If an entry has almost no useful detail, write a minimal factual line (role + domain) rather than inventing.
- Output PLAIN TEXT only. Never include HTML tags, attributes, or markup (no <p>, <strong>, style=, etc.).

Respond with ONLY valid JSON matching the requested schema.`;

/**
 * Transform resume/profile data into portfolio-owned content.
 * Always returns a deep clone — never mutates the source.
 */
export async function transformToPortfolioContent(
  source: TemplateProfileData,
  options: ContentTransformOptions = {}
): Promise<TemplateProfileData> {
  const content = applyDeterministicTransform(source, options.projectNarratives);

  const useAI = !options.skipAI && isAIAvailable();
  if (!useAI) {
    transformLogger.info('Using deterministic portfolio content transform', {
      profileId: source.id,
      skipAI: options.skipAI ?? false,
    });
    return content;
  }

  try {
    const aiResult = await runContentTransformAI(content);
    return applyAITransform(content, aiResult);
  } catch (error) {
    transformLogger.warn('AI content transform failed; using deterministic content', {
      profileId: source.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return content;
  }
}

/**
 * Deterministic portfolio-style shaping (no AI).
 * Used as the baseline and as a fallback when AI is unavailable.
 * Strips resume HTML first so tags never become the "summary".
 */
export function applyDeterministicTransform(
  source: TemplateProfileData,
  projectNarratives?: Record<string, string>
): TemplateProfileData {
  const content = sanitizeOwnedProfileText(cloneProfileData(source));

  content.workExperiences = content.workExperiences.map((exp) => ({
    ...exp,
    bullets: summarizeBullets(exp.bullets),
  }));

  content.projects = content.projects.map((project) => {
    const narrative = toPortfolioPlainText(projectNarratives?.[project.title]);
    const description = narrative || truncateText(project.description, DETERMINISTIC_SUMMARY_MAX);
    return { ...project, description };
  });

  content.awards = content.awards.map((award) => ({
    ...award,
    description: truncateText(award.description, DETERMINISTIC_SUMMARY_MAX),
  }));

  return content;
}

// ============================================================================
// AI
// ============================================================================

async function runContentTransformAI(
  content: TemplateProfileData
): Promise<ContentTransformAIResult> {
  const experiencesNeedingSummary = content.workExperiences.filter(
    (exp) => exp.isVisible && exp.bullets.length > 0
  );
  const projectsNeedingCopy = content.projects.filter(
    (p) => p.isVisible && p.showOnPortfolio && p.description
  );
  const awardsNeedingCopy = content.awards.filter((a) => a.isVisible && a.description);

  if (
    experiencesNeedingSummary.length === 0 &&
    projectsNeedingCopy.length === 0 &&
    awardsNeedingCopy.length === 0
  ) {
    return {};
  }

  const userPrompt = buildUserPrompt(
    experiencesNeedingSummary,
    projectsNeedingCopy,
    awardsNeedingCopy
  );

  const { data } = await executeAICall<ContentTransformAIResult>({
    stage: 'contentTransform',
    taskType: 'creative',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  });

  return data ?? {};
}

function buildUserPrompt(
  experiences: TemplateProfileData['workExperiences'],
  projects: TemplateProfileData['projects'],
  awards: TemplateProfileData['awards']
): string {
  return `Rewrite these resume entries as portfolio-style summaries.
All values below are already plain text. Return plain text only — no HTML.

## Work experiences
${
  experiences.length > 0
    ? experiences
        .map(
          (exp) =>
            `- id: ${exp.id}\n  role: ${exp.role}\n  company: ${exp.company}\n  bullets:\n${exp.bullets.map((b) => `    - ${b}`).join('\n')}`
        )
        .join('\n')
    : '(none)'
}

## Projects
${
  projects.length > 0
    ? projects
        .map(
          (p) =>
            `- id: ${p.id}\n  title: ${p.title}\n  description: ${p.description}\n  tech: ${p.techStack.join(', ') || 'n/a'}`
        )
        .join('\n')
    : '(none)'
}

## Awards
${
  awards.length > 0
    ? awards
        .map((a) => `- id: ${a.id}\n  title: ${a.title}\n  description: ${a.description}`)
        .join('\n')
    : '(none)'
}

Return JSON with this EXACT shape (omit empty maps):
{
  "experiences": {
    "<id>": { "summary": "One portfolio-style sentence (two max)." }
  },
  "projects": {
    "<id>": { "description": "1-2 sentence portfolio blurb." }
  },
  "awards": {
    "<id>": { "description": "One short sentence or empty string." }
  }
}

Only include ids from the lists above. Do not invent new entries.`;
}

function applyAITransform(
  content: TemplateProfileData,
  ai: ContentTransformAIResult
): TemplateProfileData {
  const experiences = ai.experiences ?? {};
  const projects = ai.projects ?? {};
  const awards = ai.awards ?? {};

  return {
    ...content,
    workExperiences: content.workExperiences.map((exp) => {
      const summary = toPortfolioPlainText(experiences[exp.id]?.summary);
      if (!summary) return exp;
      return { ...exp, bullets: [summary] };
    }),
    projects: content.projects.map((project) => {
      const description = toPortfolioPlainText(projects[project.id]?.description);
      if (!description) return project;
      return { ...project, description };
    }),
    awards: content.awards.map((award) => {
      if (!Object.prototype.hasOwnProperty.call(awards, award.id)) return award;
      const description = toPortfolioPlainText(awards[award.id]?.description) || null;
      return { ...award, description };
    }),
  };
}

// ============================================================================
// DETERMINISTIC HELPERS
// ============================================================================

/** Collapse resume bullets into a single portfolio highlight. */
function summarizeBullets(bullets: string[]): string[] {
  const cleaned = bullets.map(toPortfolioPlainText).filter(Boolean);
  if (cleaned.length === 0) return [];
  if (cleaned.length === 1) return [truncateText(cleaned[0], DETERMINISTIC_SUMMARY_MAX) ?? ''];

  // Prefer the first bullet; if it's very short, append a second.
  const first = cleaned[0];
  if (first.length >= 80) {
    return [truncateText(first, DETERMINISTIC_SUMMARY_MAX) ?? first];
  }
  const combined = `${first} ${cleaned[1]}`.trim();
  return [truncateText(combined, DETERMINISTIC_SUMMARY_MAX) ?? combined];
}

function truncateText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = toPortfolioPlainText(value);
  if (!trimmed) return null;
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}
