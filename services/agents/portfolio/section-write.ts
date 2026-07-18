/**
 * Per-section narrative writers for the portfolio agent.
 * Each call follows that section's policy and only returns fields for that section.
 */

import { executeAICall } from '@/lib/ai-client';
import {
  formatPolicyForPrompt,
  getSectionPolicy,
  type PortfolioSectionPolicyId,
} from '@/services/agents/portfolio/policies';
import type { AssessedItem } from '@/services/agents/portfolio/assess';
import type { CollectedProfileData } from '@/types/portfolio';

export type NarrativeSectionId = Extract<
  PortfolioSectionPolicyId,
  'hero' | 'about' | 'experience' | 'projects' | 'writing' | 'github' | 'contact'
>;

export interface NarrativePatches {
  headline?: string;
  subheadline?: string;
  introParagraph?: string;
  metaBio?: string;
  sectionIntros?: Record<string, string>;
  projectFramings?: Record<string, string>;
  experienceNarrative?: string | null;
  githubNarrative?: string | null;
  writingNarrative?: string | null;
  pullQuote?: string | null;
  ctaText?: string;
}

export interface WriteSectionContext {
  collected: CollectedProfileData;
  projectAssessments?: AssessedItem[];
  focusNotes?: string;
  attachedSourceKinds?: string[];
}

const SECTION_JSON_HINT: Record<NarrativeSectionId, string> = {
  hero: `{ "headline": "3-8 word first-person identity", "subheadline": "one sentence context" }`,
  about: `{ "introParagraph": "2-4 sentence third-person story", "metaBio": "one SEO sentence", "sectionIntros": { "about": "optional 1 sentence" }, "pullQuote": "string or null" }`,
  experience: `{ "experienceNarrative": "2-3 sentence career arc or null", "sectionIntros": { "experience-timeline": "optional 1 sentence" } }`,
  projects: `{ "projectFramings": { "Exact Title": "1-3 sentences per policy/quality" }, "sectionIntros": { "featured-projects": "optional 1 sentence" } }`,
  writing: `{ "writingNarrative": "string or null", "sectionIntros": { "blog-showcase": "optional 1 sentence" } }`,
  github: `{ "githubNarrative": "string or null", "sectionIntros": { "github-showcase": "optional 1 sentence" } }`,
  contact: `{ "ctaText": "natural CTA like Get in touch" }`,
};

export async function writePortfolioSection(
  sectionId: NarrativeSectionId,
  ctx: WriteSectionContext
): Promise<NarrativePatches> {
  const attached = ctx.attachedSourceKinds ?? [];
  if (sectionId === 'writing' && !attached.includes('writing')) {
    return { writingNarrative: null };
  }
  if (sectionId === 'github' && !attached.includes('github')) {
    return { githubNarrative: null };
  }

  const policy = getSectionPolicy(sectionId);
  const userPrompt = buildSectionUserPrompt(sectionId, ctx);

  const { data } = await executeAICall<NarrativePatches>({
    stage: 'narrativeGeneration',
    taskType: 'creative',
    systemPrompt: `You are Follio's portfolio section writer.
Write ONLY the "${sectionId}" section.
Follow this policy exactly:
${formatPolicyForPrompt(policy)}

Never invent facts, metrics, employers, or titles.
Return ONLY valid JSON matching the requested shape for this section.`,
    userPrompt,
  });

  return sanitizeSectionPatch(sectionId, data);
}

function buildSectionUserPrompt(sectionId: NarrativeSectionId, ctx: WriteSectionContext): string {
  const { collected, focusNotes, projectAssessments } = ctx;
  const name =
    [collected.basics.firstName, collected.basics.lastName].filter(Boolean).join(' ') ||
    'This person';
  const current = collected.workExperiences.find((w) => w.isCurrent);

  const shared = [
    `Person: ${name}`,
    `Headline on file: ${collected.basics.headline || 'none'}`,
    `Summary on file: ${collected.basics.summary || 'none'}`,
    current ? `Current role: ${current.role} at ${current.company}` : 'Current role: unknown',
    focusNotes ? `Focus notes: ${focusNotes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (sectionId === 'hero' || sectionId === 'about' || sectionId === 'contact') {
    return `${shared}

Companies: ${[...new Set(collected.workExperiences.map((w) => w.company))].join(', ') || 'none'}
Themes from work: ${collected.workExperiences
      .flatMap((w) => w.bullets)
      .slice(0, 6)
      .join(' | ')}

Return JSON: ${SECTION_JSON_HINT[sectionId]}`;
  }

  if (sectionId === 'experience') {
    return `${shared}

Work history:
${collected.workExperiences
  .map(
    (w) =>
      `- ${w.role} @ ${w.company} (${w.startDate}–${w.isCurrent ? 'Present' : w.endDate || '?'})
  Bullets: ${w.bullets.slice(0, 4).join(' | ') || 'none'}`
  )
  .join('\n')}

Return JSON: ${SECTION_JSON_HINT.experience}`;
  }

  if (sectionId === 'projects') {
    const assessments = new Map((projectAssessments ?? []).map((a) => [a.title.toLowerCase(), a]));
    const projects = collected.projects.slice(0, 8);
    return `${shared}

Projects to frame:
${projects
  .map((p) => {
    const a = assessments.get(p.title.toLowerCase());
    return `- **${p.title}** [quality=${a?.quality ?? 'unknown'}]
  Desc: ${p.description || p.shortDesc || '(none)'}
  Tech: ${p.techStack.join(', ') || 'n/a'}
  GitHub: ${p.github ? `★${p.github.stars} pinned:${p.github.isPinned}` : 'n/a'}
  Strategy: ${a?.strategy ?? 'Polish if rich; synthesize carefully if thin/empty — no invented metrics.'}`;
  })
  .join('\n\n')}

Return JSON: ${SECTION_JSON_HINT.projects}`;
  }

  if (sectionId === 'writing') {
    return `${shared}

Posts:
${
  collected.blogPosts
    .slice(0, 8)
    .map((b) => `- "${b.title}" (${b.platform || 'blog'}) ${b.excerpt?.slice(0, 120) || ''}`)
    .join('\n') || 'none'
}

Return JSON: ${SECTION_JSON_HINT.writing}`;
  }

  // github
  return `${shared}

GitHub profile: ${
    collected.github
      ? `@${collected.github.username} repos:${collected.github.publicRepos} stars:${collected.github.totalStars} langs:${collected.github.primaryLanguages.join(', ')}`
      : 'aggregate profile missing — use project-level GitHub only'
  }
Top projects: ${collected.projects
    .filter((p) => p.github)
    .slice(0, 5)
    .map((p) => `${p.title} (★${p.github?.stars ?? 0})`)
    .join('; ')}

Return JSON: ${SECTION_JSON_HINT.github}`;
}

function sanitizeSectionPatch(
  sectionId: NarrativeSectionId,
  data: NarrativePatches
): NarrativePatches {
  switch (sectionId) {
    case 'hero':
      return {
        headline: data.headline,
        subheadline: data.subheadline,
      };
    case 'about':
      return {
        introParagraph: data.introParagraph,
        metaBio: data.metaBio,
        pullQuote: data.pullQuote ?? null,
        sectionIntros: data.sectionIntros?.about ? { about: data.sectionIntros.about } : undefined,
      };
    case 'experience':
      return {
        experienceNarrative: data.experienceNarrative ?? null,
        sectionIntros: data.sectionIntros?.['experience-timeline']
          ? { 'experience-timeline': data.sectionIntros['experience-timeline'] }
          : undefined,
      };
    case 'projects':
      return {
        projectFramings: data.projectFramings ?? {},
        sectionIntros: data.sectionIntros?.['featured-projects']
          ? { 'featured-projects': data.sectionIntros['featured-projects'] }
          : undefined,
      };
    case 'writing':
      return {
        writingNarrative: data.writingNarrative ?? null,
        sectionIntros: data.sectionIntros?.['blog-showcase']
          ? { 'blog-showcase': data.sectionIntros['blog-showcase'] }
          : undefined,
      };
    case 'github':
      return {
        githubNarrative: data.githubNarrative ?? null,
        sectionIntros: data.sectionIntros?.['github-showcase']
          ? { 'github-showcase': data.sectionIntros['github-showcase'] }
          : undefined,
      };
    case 'contact':
      return { ctaText: data.ctaText };
  }
}

export function mergeNarrativePatches(
  patches: NarrativePatches[]
): Omit<import('@/types/portfolio').NarrativeContent, '_meta'> {
  const merged: Omit<import('@/types/portfolio').NarrativeContent, '_meta'> = {
    headline: '',
    subheadline: '',
    introParagraph: '',
    metaBio: '',
    sectionIntros: {},
    projectFramings: {},
    experienceNarrative: null,
    githubNarrative: null,
    writingNarrative: null,
    pullQuote: null,
    ctaText: 'Get in touch',
  };

  for (const patch of patches) {
    if (patch.headline) merged.headline = patch.headline;
    if (patch.subheadline) merged.subheadline = patch.subheadline;
    if (patch.introParagraph) merged.introParagraph = patch.introParagraph;
    if (patch.metaBio) merged.metaBio = patch.metaBio;
    if (patch.ctaText) merged.ctaText = patch.ctaText;
    if (patch.experienceNarrative !== undefined) {
      merged.experienceNarrative = patch.experienceNarrative;
    }
    if (patch.githubNarrative !== undefined) merged.githubNarrative = patch.githubNarrative;
    if (patch.writingNarrative !== undefined) merged.writingNarrative = patch.writingNarrative;
    if (patch.pullQuote !== undefined) merged.pullQuote = patch.pullQuote;
    if (patch.projectFramings) {
      merged.projectFramings = { ...merged.projectFramings, ...patch.projectFramings };
    }
    if (patch.sectionIntros) {
      merged.sectionIntros = { ...merged.sectionIntros, ...patch.sectionIntros };
    }
  }

  return merged;
}

export const DEFAULT_SECTION_WRITE_ORDER: NarrativeSectionId[] = [
  'contact',
  'experience',
  'projects',
  'writing',
  'github',
  'about',
  'hero',
];
