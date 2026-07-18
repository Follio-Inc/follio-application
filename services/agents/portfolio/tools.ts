/**
 * Tools for the portfolio-generation agent.
 * Reusable by other portfolio-related agents later (section rewrite, regen copy, …).
 */

import { z } from 'zod';

import { defineTool } from '@/lib/agents';
import { transformToPortfolioContent } from '@/services/portfolio/content-transform.service';
import { collectProfileData } from '@/services/portfolio/data-collector.service';
import { loadNormalizedProfile } from '@/services/portfolio/plan-helpers';
import {
  applyValidationFixes,
  executeEvidenceExtraction,
  executeNarrativeGeneration,
  executePortfolioStrategy,
  executeProfileUnderstanding,
  executeValidation,
} from '@/services/portfolio/pipeline';
import { assessExperience, assessProject } from '@/services/agents/portfolio/assess';
import {
  buildEnrichmentFromParts,
  mapNarrativeToTemplateCopy,
} from '@/services/agents/portfolio/map-to-template';
import {
  formatPolicyForPrompt,
  getSectionPolicy,
  listSectionPolicies,
  type PortfolioSectionPolicyId,
} from '@/services/agents/portfolio/policies';
import { listAttachedSources } from '@/services/agents/portfolio/sources';
import {
  DEFAULT_SECTION_WRITE_ORDER,
  mergeNarrativePatches,
  writePortfolioSection,
  type NarrativePatches,
  type NarrativeSectionId,
} from '@/services/agents/portfolio/section-write';

import type {
  TemplateCopy,
  TemplateAIEnrichment,
  TemplateProfileData,
} from '@/lib/portfolio/templates/types';
import type {
  CollectedProfileData,
  EvidenceExtraction,
  NarrativeContent,
  ProfileUnderstanding,
} from '@/types/portfolio';
import type { AssessedItem } from '@/services/agents/portfolio/assess';

const MEMORY_COLLECTED = 'collectedProfileData';
const MEMORY_NORMALIZED = 'normalizedProfile';
const MEMORY_ASSESSMENT = 'contentAssessment';
const MEMORY_SYNTHESIS = 'portfolioSynthesis';
const MEMORY_PATCHES = 'narrativePatches';
const MEMORY_UNDERSTANDING = 'understanding';
const MEMORY_EVIDENCE = 'evidence';
const MEMORY_STRATEGY = 'strategy';
const MEMORY_STAGES = 'stagesRun';
const MEMORY_TOKENS = 'sectionTokens';
const MEMORY_PIPELINE_START = 'pipelineStart';

export const listAttachedSourcesTool = defineTool({
  name: 'list_attached_sources',
  description:
    'List every data source attached to this profile (resume, GitHub, writing/Medium/Substack, LinkedIn, photos, etc.). Call this before writing so you only use what the user actually attached.',
  inputSchema: z.object({
    profileId: z.string().describe('Profile id to inspect'),
  }),
  execute: async ({ profileId }, ctx) => {
    const collected =
      ctx.memory.get<CollectedProfileData>(MEMORY_COLLECTED) ??
      (await collectProfileData(profileId));
    ctx.memory.set(MEMORY_COLLECTED, collected);
    ctx.memory.set('profileId', profileId);

    const sources = listAttachedSources(collected);
    return {
      profileId,
      handle: collected.meta.handle,
      completeness: collected.meta.completeness,
      activeSources: collected.meta.activeSources,
      sources,
      guidance:
        'Skip sections whose source is not attached (e.g. no writing → no writing narrative). Prefer attached evidence over assumptions.',
    };
  },
});

export const loadProfileContextTool = defineTool({
  name: 'load_profile_context',
  description:
    'Load the full profile bundle used for generation (career data, projects, writing, GitHub). Stores it in agent memory for later tools.',
  inputSchema: z.object({
    profileId: z.string(),
  }),
  execute: async ({ profileId }, ctx) => {
    const [collected, normalized] = await Promise.all([
      ctx.memory.get<CollectedProfileData>(MEMORY_COLLECTED) ?? collectProfileData(profileId),
      ctx.memory.get<TemplateProfileData>(MEMORY_NORMALIZED) ?? loadNormalizedProfile(profileId),
    ]);
    if (!normalized) {
      throw new Error(`Profile not found: ${profileId}`);
    }
    ctx.memory.set(MEMORY_COLLECTED, collected);
    ctx.memory.set(MEMORY_NORMALIZED, normalized);
    ctx.memory.set('profileId', profileId);

    return {
      basics: collected.basics,
      counts: {
        experiences: collected.workExperiences.length,
        education: collected.education.length,
        skills: collected.skills.length,
        projects: collected.projects.length,
        blogPosts: collected.blogPosts.length,
        awards: collected.awards.length,
        certifications: collected.certifications.length,
        videos: collected.youtubeVideos.length,
        photos: collected.photos.length,
        hasGithubProfile: !!collected.github,
      },
      sampleProjectTitles: collected.projects.slice(0, 8).map((p) => p.title),
      samplePostTitles: collected.blogPosts.slice(0, 5).map((b) => b.title),
    };
  },
});

export const getSectionPolicyTool = defineTool({
  name: 'get_section_policy',
  description:
    'Fetch writing policy for one portfolio section (experience, projects, education, skills, writing, …). Use before synthesizing that kind of content.',
  inputSchema: z.object({
    sectionId: z
      .enum([
        'hero',
        'about',
        'experience',
        'education',
        'skills',
        'projects',
        'awards',
        'certifications',
        'writing',
        'github',
        'contact',
      ])
      .describe('Section policy id'),
  }),
  execute: async ({ sectionId }) => {
    const policy = getSectionPolicy(sectionId as PortfolioSectionPolicyId);
    return {
      policy,
      promptBlock: formatPolicyForPrompt(policy),
    };
  },
});

export const listAllSectionPoliciesTool = defineTool({
  name: 'list_section_policies',
  description: 'Return all section writing policies in one shot.',
  inputSchema: z.object({}),
  execute: async () => {
    const policies = listSectionPolicies();
    return {
      policies,
      promptBlock: policies.map(formatPolicyForPrompt).join('\n\n'),
    };
  },
});

export const assessContentQualityTool = defineTool({
  name: 'assess_content_quality',
  description:
    'Assess whether projects/experiences have rich, thin, or empty descriptions so rewrite strategy can adapt (especially GitHub repos with weak READMEs).',
  inputSchema: z.object({
    profileId: z.string().optional(),
  }),
  execute: async ({ profileId }, ctx) => {
    const id = profileId || ctx.memory.get<string>('profileId');
    if (!id) throw new Error('profileId required');

    const collected =
      ctx.memory.get<CollectedProfileData>(MEMORY_COLLECTED) ?? (await collectProfileData(id));
    ctx.memory.set(MEMORY_COLLECTED, collected);

    const projects = collected.projects.map((p, index) =>
      assessProject({
        id: `project-${index}`,
        title: p.title,
        description: p.description,
        shortDesc: p.shortDesc,
        highlights: p.highlights,
        techStack: p.techStack,
        github: p.github
          ? {
              stars: p.github.stars,
              readme: p.github.readme,
              isPinned: p.github.isPinned,
            }
          : null,
      })
    );

    const experiences = collected.workExperiences.map((e, index) =>
      assessExperience({
        id: `experience-${index}`,
        role: e.role,
        company: e.company,
        bullets: e.bullets,
      })
    );

    const assessment = { projects, experiences };
    ctx.memory.set(MEMORY_ASSESSMENT, assessment);

    return {
      summary: {
        projects: {
          rich: projects.filter((p) => p.quality === 'rich').length,
          adequate: projects.filter((p) => p.quality === 'adequate').length,
          thin: projects.filter((p) => p.quality === 'thin').length,
          empty: projects.filter((p) => p.quality === 'empty').length,
        },
        experiences: {
          rich: experiences.filter((e) => e.quality === 'rich').length,
          thin: experiences.filter((e) => e.quality === 'thin' || e.quality === 'empty').length,
        },
      },
      projects,
      experiences,
    };
  },
});

export const synthesizePortfolioTool = defineTool({
  name: 'synthesize_portfolio',
  description:
    'Run the portfolio synthesis pipeline (understanding → evidence → strategy → narrative → validation → content transform) using attached profile data, section policies, and quality assessment from memory. Call after sources are loaded and quality is assessed.',
  inputSchema: z.object({
    profileId: z.string().optional(),
    focusNotes: z
      .string()
      .optional()
      .describe('Optional notes from the agent about what to emphasize or skip'),
  }),
  execute: async ({ profileId, focusNotes }, ctx) => {
    const id = profileId || ctx.memory.get<string>('profileId');
    if (!id) throw new Error('profileId required');

    const collected =
      ctx.memory.get<CollectedProfileData>(MEMORY_COLLECTED) ?? (await collectProfileData(id));
    const normalized =
      ctx.memory.get<TemplateProfileData>(MEMORY_NORMALIZED) ?? (await loadNormalizedProfile(id));
    if (!normalized) {
      throw new Error(`Profile not found: ${id}`);
    }
    ctx.memory.set(MEMORY_COLLECTED, collected);
    ctx.memory.set(MEMORY_NORMALIZED, normalized);

    const sources = listAttachedSources(collected);
    const policiesBlock = listSectionPolicies().map(formatPolicyForPrompt).join('\n\n');
    const assessment = ctx.memory.get<{
      projects: ReturnType<typeof assessProject>[];
      experiences: ReturnType<typeof assessExperience>[];
    }>(MEMORY_ASSESSMENT);

    const stagesRun: string[] = [];
    const pipelineStart = Date.now();
    let totalInput = 0;
    let totalOutput = 0;

    const understanding = await executeProfileUnderstanding(collected);
    stagesRun.push('profileUnderstanding');
    totalInput += understanding._meta.tokensUsed.input;
    totalOutput += understanding._meta.tokensUsed.output;

    const evidence = await executeEvidenceExtraction(collected, understanding);
    stagesRun.push('evidenceExtraction');
    totalInput += evidence._meta.tokensUsed.input;
    totalOutput += evidence._meta.tokensUsed.output;

    const strategy = await executePortfolioStrategy(collected, understanding, evidence);
    stagesRun.push('portfolioStrategy');
    totalInput += strategy._meta.tokensUsed.input;
    totalOutput += strategy._meta.tokensUsed.output;

    const attachedKinds = sources.filter((s) => s.attached).map((s) => s.kind);
    ctx.memory.set('sectionPoliciesPrompt', policiesBlock);

    let narrative = await executeNarrativeGeneration(collected, understanding, evidence, strategy, {
      focusNotes,
      projectAssessments: assessment?.projects,
      experienceAssessments: assessment?.experiences,
      attachedSourceKinds: attachedKinds,
    });
    stagesRun.push('narrativeGeneration');
    totalInput += narrative._meta.tokensUsed.input;
    totalOutput += narrative._meta.tokensUsed.output;

    const validation = await executeValidation(collected, narrative);
    stagesRun.push('validation');
    totalInput += validation._meta.tokensUsed.input;
    totalOutput += validation._meta.tokensUsed.output;

    if (validation.modifications.length > 0) {
      narrative = applyValidationFixes(narrative, validation);
    }

    // Defense in depth — Stage D also clears these when sources are missing
    if (!sources.find((s) => s.kind === 'writing')?.attached) {
      narrative = { ...narrative, writingNarrative: null };
    }
    if (!sources.find((s) => s.kind === 'github')?.attached) {
      narrative = { ...narrative, githubNarrative: null };
    }

    const copy = mapNarrativeToTemplateCopy(narrative, collected, normalized);
    const enrichment = buildEnrichmentFromParts({
      understanding,
      evidence,
      validation,
      collected,
      pipelineStart,
      totalInput,
      totalOutput,
      stagesRun,
    });

    const content = await transformToPortfolioContent(normalized, {
      projectNarratives: copy.projectNarratives,
      skipAI: false,
    });
    stagesRun.push('contentTransform');

    const synthesis = {
      copy,
      enrichment,
      content,
      stagesRun,
      narrative,
      tokensUsed: { input: totalInput, output: totalOutput },
    };
    ctx.memory.set(MEMORY_SYNTHESIS, synthesis);

    return {
      ok: true,
      stagesRun,
      headline: copy.heroHeadline,
      aboutPreview: copy.aboutText.slice(0, 160),
      projectNarrativeCount: Object.keys(copy.projectNarratives || {}).length,
      writingNarrative: copy.writingNarrative,
      tokensUsed: synthesis.tokensUsed,
      note: 'Synthesis stored in memory. Call submit_portfolio_result to finish.',
    };
  },
});

export const analyzeProfileTool = defineTool({
  name: 'analyze_profile',
  description:
    'Run profile understanding, evidence extraction, and strategy (stages A–C). Call once before writing sections.',
  inputSchema: z.object({
    profileId: z.string().optional(),
  }),
  execute: async ({ profileId }, ctx) => {
    const id = profileId || ctx.memory.get<string>('profileId');
    if (!id) throw new Error('profileId required');

    const collected =
      ctx.memory.get<CollectedProfileData>(MEMORY_COLLECTED) ?? (await collectProfileData(id));
    ctx.memory.set(MEMORY_COLLECTED, collected);
    ctx.memory.set(MEMORY_PIPELINE_START, Date.now());
    ctx.memory.set(MEMORY_STAGES, [] as string[]);
    ctx.memory.set(MEMORY_TOKENS, { input: 0, output: 0 });

    const understanding = await executeProfileUnderstanding(collected);
    const evidence = await executeEvidenceExtraction(collected, understanding);
    const strategy = await executePortfolioStrategy(collected, understanding, evidence);

    ctx.memory.set(MEMORY_UNDERSTANDING, understanding);
    ctx.memory.set(MEMORY_EVIDENCE, evidence);
    ctx.memory.set(MEMORY_STRATEGY, strategy);

    const stages = ctx.memory.get<string[]>(MEMORY_STAGES) ?? [];
    stages.push('profileUnderstanding', 'evidenceExtraction', 'portfolioStrategy');
    ctx.memory.set(MEMORY_STAGES, stages);

    const tokens = ctx.memory.get<{ input: number; output: number }>(MEMORY_TOKENS)!;
    tokens.input +=
      understanding._meta.tokensUsed.input +
      evidence._meta.tokensUsed.input +
      strategy._meta.tokensUsed.input;
    tokens.output +=
      understanding._meta.tokensUsed.output +
      evidence._meta.tokensUsed.output +
      strategy._meta.tokensUsed.output;

    return {
      ok: true,
      archetype: understanding.primaryArchetype,
      mustFeature: evidence.mustFeature.slice(0, 5),
      tone: strategy.tone,
      leadWith: strategy.leadWith,
      recommendedSections: DEFAULT_SECTION_WRITE_ORDER,
    };
  },
});

export const writePortfolioSectionTool = defineTool({
  name: 'write_portfolio_section',
  description:
    'Write one portfolio narrative section using its policy (hero, about, experience, projects, writing, github, contact). Call once per needed section after analyze_profile.',
  inputSchema: z.object({
    sectionId: z.enum(['hero', 'about', 'experience', 'projects', 'writing', 'github', 'contact']),
    focusNotes: z.string().optional(),
  }),
  execute: async ({ sectionId, focusNotes }, ctx) => {
    const collected = ctx.memory.get<CollectedProfileData>(MEMORY_COLLECTED);
    if (!collected) {
      return { error: 'Call load_profile_context or analyze_profile first' };
    }

    const assessment = ctx.memory.get<{
      projects: AssessedItem[];
      experiences: AssessedItem[];
    }>(MEMORY_ASSESSMENT);
    const sources = listAttachedSources(collected);
    const attachedKinds = sources.filter((s) => s.attached).map((s) => s.kind);

    const patch = await writePortfolioSection(sectionId as NarrativeSectionId, {
      collected,
      projectAssessments: assessment?.projects,
      focusNotes: focusNotes || (ctx.memory.get('__input') as { focusNotes?: string })?.focusNotes,
      attachedSourceKinds: attachedKinds,
    });

    const patches = ctx.memory.get<NarrativePatches[]>(MEMORY_PATCHES) ?? [];
    patches.push(patch);
    ctx.memory.set(MEMORY_PATCHES, patches);

    const stages = ctx.memory.get<string[]>(MEMORY_STAGES) ?? [];
    stages.push(`write:${sectionId}`);
    ctx.memory.set(MEMORY_STAGES, stages);

    return {
      ok: true,
      sectionId,
      patchKeys: Object.keys(patch),
      sectionsWritten: patches.length,
    };
  },
});

export const assembleFromSectionsTool = defineTool({
  name: 'assemble_from_sections',
  description:
    'Merge written section patches into TemplateCopy + owned content. Call after write_portfolio_section for all needed sections, then submit_portfolio_result.',
  inputSchema: z.object({
    profileId: z.string().optional(),
  }),
  execute: async ({ profileId }, ctx) => {
    const id = profileId || ctx.memory.get<string>('profileId');
    if (!id) throw new Error('profileId required');

    const collected =
      ctx.memory.get<CollectedProfileData>(MEMORY_COLLECTED) ?? (await collectProfileData(id));
    const normalized =
      ctx.memory.get<TemplateProfileData>(MEMORY_NORMALIZED) ?? (await loadNormalizedProfile(id));
    if (!normalized) throw new Error(`Profile not found: ${id}`);

    const patches = ctx.memory.get<NarrativePatches[]>(MEMORY_PATCHES) ?? [];
    if (patches.length === 0) {
      return { error: 'No section patches in memory. Call write_portfolio_section first.' };
    }

    let understanding = ctx.memory.get<ProfileUnderstanding>(MEMORY_UNDERSTANDING);
    let evidence = ctx.memory.get<EvidenceExtraction>(MEMORY_EVIDENCE);
    if (!understanding || !evidence) {
      understanding = await executeProfileUnderstanding(collected);
      evidence = await executeEvidenceExtraction(collected, understanding);
      ctx.memory.set(MEMORY_UNDERSTANDING, understanding);
      ctx.memory.set(MEMORY_EVIDENCE, evidence);
    }

    const merged = mergeNarrativePatches(patches);
    let narrative = {
      ...merged,
      _meta: {
        stage: 'narrativeGeneration',
        model: 'section-write',
        tokensUsed: { input: 0, output: 0 },
        durationMs: 0,
        timestamp: new Date().toISOString(),
      },
    } as NarrativeContent;

    const sources = listAttachedSources(collected);
    if (!sources.find((s) => s.kind === 'writing')?.attached) {
      narrative = { ...narrative, writingNarrative: null };
    }
    if (!sources.find((s) => s.kind === 'github')?.attached) {
      narrative = { ...narrative, githubNarrative: null };
    }

    const validation = await executeValidation(collected, narrative);
    if (validation.modifications.length > 0) {
      narrative = applyValidationFixes(narrative, validation);
    }

    const stages = ctx.memory.get<string[]>(MEMORY_STAGES) ?? [];
    stages.push('validation', 'assemble');
    const tokens = ctx.memory.get<{ input: number; output: number }>(MEMORY_TOKENS) ?? {
      input: 0,
      output: 0,
    };
    tokens.input += validation._meta.tokensUsed.input;
    tokens.output += validation._meta.tokensUsed.output;

    const pipelineStart = ctx.memory.get<number>(MEMORY_PIPELINE_START) ?? Date.now();
    const copy = mapNarrativeToTemplateCopy(narrative, collected, normalized);
    const enrichment = buildEnrichmentFromParts({
      understanding,
      evidence,
      validation,
      collected,
      pipelineStart,
      totalInput: tokens.input,
      totalOutput: tokens.output,
      stagesRun: [...stages, 'contentTransform'],
    });

    const content = await transformToPortfolioContent(normalized, {
      projectNarratives: copy.projectNarratives,
      skipAI: false,
    });

    const synthesis = {
      copy,
      enrichment,
      content,
      stagesRun: [...stages, 'contentTransform'],
      narrative,
      tokensUsed: tokens,
    };
    ctx.memory.set(MEMORY_SYNTHESIS, synthesis);
    ctx.memory.set(MEMORY_STAGES, synthesis.stagesRun);

    return {
      ok: true,
      headline: copy.heroHeadline,
      sectionsMerged: patches.length,
      projectNarrativeCount: Object.keys(copy.projectNarratives || {}).length,
      note: 'Assembled. Call submit_portfolio_result to finish.',
    };
  },
});

export const submitPortfolioResultTool = defineTool({
  name: 'submit_portfolio_result',
  description:
    'Submit the final portfolio generation result. Call after assemble_from_sections or synthesize_portfolio. This ends the agent run.',
  inputSchema: z.object({
    summary: z.string().optional().describe('One-line summary of what was generated'),
  }),
  execute: async ({ summary }, ctx) => {
    const synthesis = ctx.memory.get<{
      copy: TemplateCopy;
      enrichment: TemplateAIEnrichment;
      content: TemplateProfileData;
      stagesRun: string[];
      narrative: NarrativeContent;
      tokensUsed: { input: number; output: number };
    }>(MEMORY_SYNTHESIS);

    if (!synthesis) {
      return {
        error: 'No synthesis in memory. Call assemble_from_sections or synthesize_portfolio first.',
      };
    }

    return {
      copy: synthesis.copy,
      enrichment: synthesis.enrichment,
      content: synthesis.content,
      stagesRun: synthesis.stagesRun,
      tokensUsed: synthesis.tokensUsed,
      summary: summary || `Generated portfolio with headline: ${synthesis.copy.heroHeadline}`,
    };
  },
});

export const PORTFOLIO_AGENT_TOOLS = [
  listAttachedSourcesTool,
  loadProfileContextTool,
  getSectionPolicyTool,
  listAllSectionPoliciesTool,
  assessContentQualityTool,
  analyzeProfileTool,
  writePortfolioSectionTool,
  assembleFromSectionsTool,
  synthesizePortfolioTool,
  submitPortfolioResultTool,
];
