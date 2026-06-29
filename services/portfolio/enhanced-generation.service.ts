/**
 * Enhanced Portfolio Generation Service
 *
 * Orchestrates the AI pipeline to produce deeply enriched template portfolios.
 * This replaces the simple "AI writes some copy" approach with a full analysis
 * pipeline that understands the person, extracts evidence, writes narratives,
 * and validates everything — then feeds it all into the template system.
 *
 * Pipeline flow:
 *   1. Collect profile data (DB → CollectedProfileData)
 *   2. Stage A: Profile Understanding (who are they?)
 *   3. Stage B: Evidence Extraction (what's impressive?)
 *   4. Stage D: Narrative Generation (write the copy)
 *   5. Stage F: Validation (fact-check everything)
 *   6. Compose into TemplatePortfolio with enrichment
 *
 * Stages C (Strategy) and E (Design Brief) are skipped because
 * templates handle their own structure and design. When we add
 * AI-driven template selection in the future, Stage C can inform which
 * template to pick and Stage E can suggest accent colors.
 *
 * Design principles:
 * - Template-agnostic: produces data any template can consume
 * - Backwards compatible: enrichment is optional, core copy always present
 * - Graceful degradation: falls back to simple generation if AI fails
 * - Observable: full pipeline metadata stored for debugging
 */

import { isAIAvailable } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { normalizeProfileForTemplate } from '@/lib/portfolio/templates/normalizer';
import { getDefaultTemplateId, getTemplateMeta } from '@/lib/portfolio/templates/registry';
import { Prisma } from '@prisma/client';

import type {
  TemplateAIEnrichment,
  TemplateCopy,
  TemplateKitMeta,
  TemplatePortfolio,
  TemplateSectionConfig,
  TemplateSectionType,
  TemplateStyleConfig,
} from '@/lib/portfolio/templates/types';
import type { FullProfile } from '@/types';
import type {
  CollectedProfileData,
  EvidenceExtraction,
  NarrativeContent,
  ProfileUnderstanding,
  ValidationReport,
} from '@/types/portfolio';

import { collectProfileData, computeDataRichness } from './data-collector.service';
import {
  applyValidationFixes,
  executeEvidenceExtraction,
  executeNarrativeGeneration,
  executePortfolioStrategy,
  executeProfileUnderstanding,
  executeValidation,
} from './pipeline';
import { getDefaultCopy } from './template-copy.service';

const enhancedLogger = logger.child({ source: 'enhanced-generation' });

// ============================================================================
// PUBLIC API
// ============================================================================

export interface EnhancedGenerateOptions {
  /** Override template ID (defaults to registry default) */
  templateId?: string;
  /** Override accent color */
  accentColor?: string;
  /** Override font family */
  fontFamily?: string;
  /** Skip AI entirely — use default copy, no enrichment */
  skipAI?: boolean;
  /** Progress callback for UI updates */
  onProgress?: ProgressCallback;
}

export interface EnhancedGenerateResult {
  portfolioId: string;
  templateId: string;
  isAIGenerated: boolean;
  generationTimeMs: number;
  pipelineStagesRun: string[];
}

export type ProgressCallback = (progress: GenerationProgress) => void;

export interface GenerationProgress {
  stage: string;
  stagesCompleted: number;
  totalStages: number;
  message: string;
}

/**
 * Type guard: is this stored `plan` a template-based portfolio (vs a legacy
 * AI-only plan or `null`)? Template-based plans are the only ones the public
 * portfolio page and dashboard can render directly.
 */
export function isTemplateBasedPlan(plan: unknown): plan is TemplatePortfolio {
  return (
    !!plan &&
    typeof plan === 'object' &&
    typeof (plan as { templateId?: unknown }).templateId === 'string'
  );
}

/**
 * Guarantee that a profile has an active, renderable (template-based) portfolio.
 *
 * Designating a resume as the user's portfolio must never leave the public
 * portfolio surface broken. If the profile already has an active template-based
 * portfolio we leave it untouched (so AI copy / user edits are preserved).
 * Otherwise we generate a deterministic portfolio **without AI** so it is
 * instantly available and the request never depends on a slow/optional AI
 * pipeline. The user can enrich it later from the portfolio editor.
 */
export async function ensureActiveTemplatePortfolio(
  profileId: string,
  options: { templateId?: string } = {}
): Promise<{ portfolioId: string; created: boolean }> {
  const existing = await db.generatedPortfolio.findFirst({
    where: {
      profileId,
      isActive: true,
      status: { in: ['PUBLISHED', 'DRAFT'] },
    },
    orderBy: { version: 'desc' },
    select: { id: true, plan: true },
  });

  if (existing && isTemplateBasedPlan(existing.plan)) {
    return { portfolioId: existing.id, created: false };
  }

  const result = await generateEnhancedPortfolio(profileId, {
    templateId: options.templateId,
    skipAI: true,
  });

  return { portfolioId: result.portfolioId, created: true };
}

/**
 * Generate a fully AI-enriched template portfolio.
 *
 * This is the primary portfolio generation entry point.
 * Runs the AI pipeline (understand → extract evidence → narrate → validate),
 * then assembles a TemplatePortfolio with enrichment data any template can use.
 *
 * Falls back to simple copy generation if AI is unavailable or fails.
 */
export async function generateEnhancedPortfolio(
  profileId: string,
  options: EnhancedGenerateOptions = {}
): Promise<EnhancedGenerateResult> {
  const startTime = Date.now();
  const stagesRun: string[] = [];

  const report = (stage: string, completed: number, total: number, message: string) => {
    options.onProgress?.({ stage, stagesCompleted: completed, totalStages: total, message });
  };

  try {
    enhancedLogger.info('Starting enhanced portfolio generation', { profileId });

    // ── Resolve template ──────────────────────────────────────────────
    const templateId = options.templateId || getDefaultTemplateId();
    const templateMeta = getTemplateMeta(templateId);
    if (!templateMeta) {
      throw Errors.badRequest(`Template "${templateId}" does not exist`);
    }

    // ── Load profile for template normalizer ──────────────────────────
    const profile = await loadProfileWithRelations(profileId);
    if (!profile) {
      throw Errors.notFound('Profile not found');
    }

    // Load GitHub profile separately
    let githubProfile = null;
    try {
      githubProfile = await db.gitHubProfile.findUnique({
        where: { profileId },
        select: {
          username: true,
          avatarUrl: true,
          bio: true,
          publicRepos: true,
          followers: true,
          totalStars: true,
          primaryLanguages: true,
        },
      });
    } catch {
      enhancedLogger.warn('Failed to fetch GitHub profile, continuing without it');
    }

    // Normalize for template rendering
    const serialized = JSON.parse(JSON.stringify(profile));
    const normalizedProfile = normalizeProfileForTemplate(serialized, {
      githubProfile: githubProfile ? JSON.parse(JSON.stringify(githubProfile)) : null,
    });

    // ── Decide: AI pipeline or simple fallback ────────────────────────
    const useAI = !options.skipAI && isAIAvailable();

    let copy: TemplateCopy;
    let enrichment: TemplateAIEnrichment | null = null;

    if (useAI) {
      const pipelineResult = await runAIPipeline(profileId, normalizedProfile, report);
      copy = pipelineResult.copy;
      enrichment = pipelineResult.enrichment;
      stagesRun.push(...pipelineResult.stagesRun);
    } else {
      enhancedLogger.info('AI unavailable or skipped, using default copy');
      copy = getDefaultCopy(normalizedProfile);
    }

    // ── Determine sections ────────────────────────────────────────────
    report('sections', useAI ? 5 : 1, useAI ? 6 : 2, 'Configuring sections...');
    const sections = determineSections(normalizedProfile, templateMeta.defaultSections, enrichment);

    // ── Style ─────────────────────────────────────────────────────────
    const style: TemplateStyleConfig = {
      accentColor:
        options.accentColor || templateMeta.compatibleAccentColors[0]?.value || '#3b82f6',
      fontFamily: options.fontFamily || templateMeta.compatibleFonts[0]?.id || 'inter',
    };

    // ── Assemble TemplatePortfolio ────────────────────────────────────
    const templatePortfolio: TemplatePortfolio = {
      templateId,
      copy,
      sections,
      style,
      enrichment,
    };

    // ── Save to DB ────────────────────────────────────────────────────
    report('saving', useAI ? 6 : 2, useAI ? 6 : 2, 'Saving your portfolio...');
    const generationTimeMs = Date.now() - startTime;

    // Deactivate existing active portfolios
    await db.generatedPortfolio.updateMany({
      where: { profileId, isActive: true },
      data: { isActive: false },
    });

    // Determine next version
    const latestVersion = await db.generatedPortfolio.findFirst({
      where: { profileId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const saved = await db.generatedPortfolio.create({
      data: {
        profileId,
        version: nextVersion,
        status: 'PUBLISHED',
        plan: templatePortfolio as unknown as Prisma.InputJsonValue,
        isActive: true,
        generationTimeMs,
        pipelineVersion: useAI ? 'enhanced-v1' : 'template-v1',
        publishedAt: new Date(),
        totalTokensUsed: enrichment?._meta?.totalTokensUsed
          ? JSON.parse(JSON.stringify(enrichment._meta.totalTokensUsed))
          : undefined,
      },
    });

    enhancedLogger.info('Enhanced portfolio generated', {
      portfolioId: saved.id,
      templateId,
      version: nextVersion,
      generationTimeMs,
      isAIGenerated: useAI,
      stagesRun,
    });

    return {
      portfolioId: saved.id,
      templateId,
      isAIGenerated: useAI,
      generationTimeMs,
      pipelineStagesRun: stagesRun,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    enhancedLogger.error('Enhanced portfolio generation failed', error, {
      profileId,
      durationMs,
    });
    throw error;
  }
}

// ============================================================================
// AI PIPELINE EXECUTION
// ============================================================================

interface PipelineResult {
  copy: TemplateCopy;
  enrichment: TemplateAIEnrichment;
  stagesRun: string[];
}

/**
 * Run the AI pipeline stages and produce enriched copy + insights.
 *
 * Runs: Stage A → B → D → F (skips C strategy and E design since templates handle those).
 * Each stage feeds into the next. Validation fixes are applied to the narrative.
 */
async function runAIPipeline(
  profileId: string,
  normalizedProfile: import('@/lib/portfolio/templates/types').TemplateProfileData,
  report: (stage: string, completed: number, total: number, message: string) => void
): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  const stagesRun: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  // ── Collect data for AI pipeline ────────────────────────────────────
  report('collecting', 0, 6, 'Gathering your profile data...');
  const collectedData = await collectProfileData(profileId);
  stagesRun.push('dataCollection');

  // ── Stage A: Profile Understanding ──────────────────────────────────
  report('understanding', 1, 6, 'Understanding who you are...');
  const understanding = await executeProfileUnderstanding(collectedData);
  stagesRun.push('profileUnderstanding');
  totalInput += understanding._meta.tokensUsed.input;
  totalOutput += understanding._meta.tokensUsed.output;

  enhancedLogger.info('Stage A complete', {
    archetype: understanding.primaryArchetype,
    careerStage: understanding.careerStage,
    themes: understanding.definingThemes,
  });

  // ── Stage B: Evidence Extraction ────────────────────────────────────
  report('evidence', 2, 6, 'Finding your strongest proof points...');
  const evidence = await executeEvidenceExtraction(collectedData, understanding);
  stagesRun.push('evidenceExtraction');
  totalInput += evidence._meta.tokensUsed.input;
  totalOutput += evidence._meta.tokensUsed.output;

  enhancedLogger.info('Stage B complete', {
    topEvidenceCount: evidence.topEvidence.length,
    mustFeature: evidence.mustFeature.length,
    weakItems: evidence.weakItems.length,
  });

  // ── Stage C: Portfolio Strategy (lightweight, for section ordering) ─
  // We run strategy to get intelligent section ordering and hook strategy,
  // even though the template controls the visual structure.
  report('strategy', 3, 6, 'Planning your portfolio structure...');
  const strategy = await executePortfolioStrategy(collectedData, understanding, evidence);
  stagesRun.push('portfolioStrategy');
  totalInput += strategy._meta.tokensUsed.input;
  totalOutput += strategy._meta.tokensUsed.output;

  enhancedLogger.info('Stage C complete', {
    tone: strategy.tone,
    leadWith: strategy.leadWith,
    hookStrategy: strategy.hookStrategy,
  });

  // ── Stage D: Narrative Generation ───────────────────────────────────
  report('narrative', 4, 6, 'Writing your portfolio story...');
  let narrative = await executeNarrativeGeneration(
    collectedData,
    understanding,
    evidence,
    strategy
  );
  stagesRun.push('narrativeGeneration');
  totalInput += narrative._meta.tokensUsed.input;
  totalOutput += narrative._meta.tokensUsed.output;

  enhancedLogger.info('Stage D complete', {
    headline: narrative.headline,
    hasProjectFramings: Object.keys(narrative.projectFramings).length,
    hasPullQuote: !!narrative.pullQuote,
  });

  // ── Stage F: Validation ─────────────────────────────────────────────
  report('validation', 5, 6, 'Verifying accuracy...');
  const validation = await executeValidation(collectedData, narrative);
  stagesRun.push('validation');
  totalInput += validation._meta.tokensUsed.input;
  totalOutput += validation._meta.tokensUsed.output;

  // Apply fixes if validation found issues
  if (validation.modifications.length > 0) {
    narrative = applyValidationFixes(narrative, validation);
    enhancedLogger.info('Applied validation fixes', {
      fixes: validation.modifications.length,
      overallScore: validation.overallScore,
    });
  }

  enhancedLogger.info('Stage F complete', {
    score: validation.overallScore,
    passed: validation.passed,
    warnings: validation.warnings.length,
  });

  // ── Map to TemplateCopy + Enrichment ────────────────────────────────
  const copy = mapNarrativeToTemplateCopy(narrative, collectedData, normalizedProfile);
  const enrichment = buildEnrichment(
    understanding,
    evidence,
    validation,
    collectedData,
    pipelineStart,
    totalInput,
    totalOutput,
    stagesRun
  );

  return { copy, enrichment, stagesRun };
}

// ============================================================================
// MAPPING: AI Pipeline Output → Template Types
// ============================================================================

/**
 * Map the full narrative content from Stage D into the TemplateCopy format.
 * This bridges the AI pipeline output to the template's copy contract.
 *
 * Core fields (heroHeadline, aboutText, etc.) are always present.
 * Extended fields (sectionIntros, projectNarratives, etc.) are populated
 * from the richer pipeline output.
 */
function mapNarrativeToTemplateCopy(
  narrative: NarrativeContent,
  data: CollectedProfileData,
  normalizedProfile: import('@/lib/portfolio/templates/types').TemplateProfileData
): TemplateCopy {
  const name =
    [data.basics.firstName, data.basics.lastName].filter(Boolean).join(' ') || 'Portfolio';

  return {
    // Core copy
    heroHeadline: narrative.headline,
    heroSubtext: narrative.subheadline,
    aboutTitle: buildAboutTitle(data),
    aboutText: narrative.introParagraph,
    contactTitle: 'Let\u2019s work together',
    contactSubtext: narrative.ctaText,
    primaryCtaLabel: inferCtaLabel(normalizedProfile),
    seoTitle: `${name} \u2014 ${data.basics.headline || 'Portfolio'}`,
    seoDescription: narrative.metaBio,

    // Extended copy from pipeline
    sectionIntros: mapSectionIntros(narrative.sectionIntros),
    projectNarratives: narrative.projectFramings,
    experienceNarrative: narrative.experienceNarrative ?? null,
    githubNarrative: narrative.githubNarrative ?? null,
    writingNarrative: narrative.writingNarrative ?? null,
    pullQuote: narrative.pullQuote ?? null,
  };
}

/**
 * Build a personal about title from the data.
 */
function buildAboutTitle(data: CollectedProfileData): string {
  const name = [data.basics.firstName, data.basics.lastName].filter(Boolean).join(' ');

  if (name) {
    return `About ${name}`;
  }
  return 'About Me';
}

/**
 * Infer a contextual CTA label based on available data.
 */
function inferCtaLabel(
  profile: import('@/lib/portfolio/templates/types').TemplateProfileData
): string {
  const hasProjects = profile.projects.filter((p) => p.isVisible && p.showOnPortfolio).length > 0;
  if (hasProjects) return 'View My Work \u2192';
  return 'Get In Touch \u2192';
}

/**
 * Map the AI pipeline's generic section intros to TemplateSectionType keys.
 * The pipeline uses PortfolioSectionType names; templates use TemplateSectionType.
 */
function mapSectionIntros(
  pipelineIntros: Partial<Record<string, string>> | undefined
): Partial<Record<TemplateSectionType, string>> | undefined {
  if (!pipelineIntros || Object.keys(pipelineIntros).length === 0) return undefined;

  const mapping: Record<string, TemplateSectionType> = {
    about: 'about',
    'experience-timeline': 'experience',
    'experience-highlights': 'experience',
    'featured-projects': 'projects',
    'all-projects': 'projects',
    'skills-overview': 'skills',
    'skills-detailed': 'skills',
    education: 'education',
    certifications: 'certifications',
    awards: 'awards',
    'github-showcase': 'github',
    'blog-showcase': 'blog',
    'featured-writing': 'blog',
    contact: 'contact',
  };

  const mapped: Partial<Record<TemplateSectionType, string>> = {};
  for (const [pipelineKey, text] of Object.entries(pipelineIntros)) {
    if (!text) continue;
    const templateKey = mapping[pipelineKey];
    if (templateKey && !mapped[templateKey]) {
      mapped[templateKey] = text;
    }
  }

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

/**
 * Build the AI enrichment payload from pipeline outputs.
 * This provides deep insights templates can use for smarter rendering.
 */
function buildEnrichment(
  understanding: ProfileUnderstanding,
  evidence: EvidenceExtraction,
  validation: ValidationReport,
  data: CollectedProfileData,
  pipelineStart: number,
  totalInput: number,
  totalOutput: number,
  stagesRun: string[]
): TemplateAIEnrichment {
  const richness = computeDataRichness(data);

  return {
    archetype: understanding.primaryArchetype,
    secondaryArchetypes: understanding.secondaryArchetypes,
    careerStage: understanding.careerStage,
    definingThemes: understanding.definingThemes,
    uniqueAngles: understanding.uniqueAngles,
    domains: understanding.domains,

    mustFeature: evidence.mustFeature,
    weakItems: evidence.weakItems,

    highlightFacts: buildHighlightFacts(data, evidence),
    stats: buildStats(data),

    dataRichness: richness.overall,
    validationScore: validation.overallScore,

    _meta: {
      pipelineVersion: 'enhanced-v1',
      generatedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - pipelineStart,
      totalTokensUsed: { input: totalInput, output: totalOutput },
      stagesRun,
    },
  };
}

/**
 * Build human-readable highlight facts for badge/pill display.
 */
function buildHighlightFacts(data: CollectedProfileData, evidence: EvidenceExtraction): string[] {
  const facts: string[] = [];

  const years = calculateYearsExperience(data);
  if (years > 0) facts.push(`${Math.round(years)}+ years experience`);

  const companies = [...new Set(data.workExperiences.map((w) => w.company))];
  if (companies.length > 1) facts.push(`${companies.length} companies`);

  if (data.github?.totalStars && data.github.totalStars > 10) {
    facts.push(`${data.github.totalStars} GitHub stars`);
  }

  if (data.blogPosts.length > 0) {
    facts.push(`${data.blogPosts.length} published articles`);
  }

  if (data.projects.length > 3) {
    facts.push(`${data.projects.length}+ projects`);
  }

  if (evidence.measurableOutcomes.length > 0) {
    // Include the first measurable outcome as a highlight
    facts.push(evidence.measurableOutcomes[0]);
  }

  // Limit to 5 most impactful facts
  return facts.slice(0, 5);
}

/**
 * Build stats array for optional display.
 */
function buildStats(data: CollectedProfileData): Array<{ label: string; value: string }> {
  const stats: Array<{ label: string; value: string }> = [];

  const years = calculateYearsExperience(data);
  if (years > 0) {
    stats.push({ label: 'Years Experience', value: `${Math.round(years)}+` });
  }

  if (data.projects.length > 0) {
    stats.push({ label: 'Projects', value: String(data.projects.length) });
  }

  if (data.github?.totalStars && data.github.totalStars > 0) {
    stats.push({ label: 'GitHub Stars', value: String(data.github.totalStars) });
  }

  if (data.blogPosts.length > 0) {
    stats.push({ label: 'Articles', value: String(data.blogPosts.length) });
  }

  return stats.slice(0, 4);
}

function calculateYearsExperience(data: CollectedProfileData): number {
  return data.workExperiences.reduce((total, exp) => {
    const start = new Date(exp.startDate);
    const end = exp.isCurrent ? new Date() : exp.endDate ? new Date(exp.endDate) : new Date();
    const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return total + Math.max(0, years);
  }, 0);
}

// ============================================================================
// SECTION DETERMINATION (enhanced with AI insights)
// ============================================================================

/**
 * Determine which sections to enable, informed by AI enrichment.
 *
 * When enrichment is available, sections containing "weak items" are
 * still enabled but could be flagged for de-emphasis by templates.
 * Sections without data are disabled regardless of AI opinion.
 */
function determineSections(
  profile: import('@/lib/portfolio/templates/types').TemplateProfileData,
  defaults: TemplateSectionConfig[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _enrichment: TemplateAIEnrichment | null
): TemplateSectionConfig[] {
  return defaults.map((section) => {
    // Navigation and footer: always enabled
    if (section.type === 'navigation' || section.type === 'footer') {
      return { ...section, enabled: true };
    }

    // Hero, about, contact: always enabled (they use AI copy)
    if (section.type === 'hero' || section.type === 'about' || section.type === 'contact') {
      return { ...section, enabled: true };
    }

    // Data-dependent sections: enable only if data exists
    const hasData = sectionHasData(section.type, profile);
    return { ...section, enabled: hasData };
  });
}

function sectionHasData(
  type: string,
  profile: import('@/lib/portfolio/templates/types').TemplateProfileData
): boolean {
  switch (type) {
    case 'experience':
      return profile.workExperiences.filter((e) => e.isVisible).length > 0;
    case 'projects':
      return profile.projects.filter((p) => p.isVisible && p.showOnPortfolio).length > 0;
    case 'skills':
      return profile.skills.filter((s) => s.isVisible).length > 0 || profile.skillGroups.length > 0;
    case 'education':
      return profile.educations.filter((e) => e.isVisible).length > 0;
    case 'certifications':
      return profile.certifications.filter((c) => c.isVisible).length > 0;
    case 'awards':
      return profile.awards.filter((a) => a.isVisible).length > 0;
    case 'github':
      return profile.github !== null;
    case 'blog':
      return profile.blogPosts.filter((b) => b.isVisible).length > 0;
    default:
      return false;
  }
}

// ============================================================================
// DB HELPERS
// ============================================================================

async function loadProfileWithRelations(profileId: string): Promise<FullProfile | null> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    include: {
      contactInfo: true,
      links: { orderBy: { sortOrder: 'asc' } },
      workExperiences: { orderBy: { sortOrder: 'asc' } },
      educations: { orderBy: { sortOrder: 'asc' } },
      skills: { orderBy: { sortOrder: 'asc' } },
      skillGroups: {
        include: { skills: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
      projects: { orderBy: { sortOrder: 'asc' } },
      awards: { orderBy: { sortOrder: 'asc' } },
      certifications: { orderBy: { sortOrder: 'asc' } },
      blogPosts: { orderBy: { createdAt: 'desc' } },
      youtubeVideos: { orderBy: { createdAt: 'desc' } },
      photos: { orderBy: { sortOrder: 'asc' } },
      sections: { orderBy: { sortOrder: 'asc' } },
    },
  });

  return profile as FullProfile | null;
}

// ============================================================================
// TEMPLATE SWITCHING
// ============================================================================

export interface SwitchTemplateResult {
  portfolioId: string;
  templateId: string;
  /** The new published portfolio plan after switching templates */
  plan: TemplatePortfolio;
  /** True when the AI pipeline was run (only happens on the fallback path) */
  isAIGenerated: boolean;
  /** True when nothing changed because the portfolio was already on this template */
  unchanged: boolean;
}

/**
 * Switch an existing portfolio to a different template **without re-running the
 * AI pipeline**. The expensive part of generation is the AI copy + enrichment;
 * those are template-agnostic and fully reusable. Switching therefore only:
 *
 *   1. Re-derives the section list from the new template's defaults
 *      (data-aware), while preserving any sections the user intentionally hid.
 *   2. Reconciles style (accent colour / font) against what the new template
 *      supports, keeping the user's choice when it is still compatible.
 *   3. Saves a new active version pointing at the new template, carrying over
 *      the existing copy + enrichment verbatim.
 *
 * If there is no existing template-based portfolio with copy to reuse (e.g. the
 * user has only a legacy portfolio, or none at all), this falls back to a full
 * `generateEnhancedPortfolio` so the result is still complete.
 */
export async function switchPortfolioTemplate(
  profileId: string,
  templateId: string
): Promise<SwitchTemplateResult> {
  const templateMeta = getTemplateMeta(templateId);
  if (!templateMeta) {
    throw Errors.badRequest(`Template "${templateId}" does not exist`);
  }

  // Find the current active portfolio, if any.
  const existing = await db.generatedPortfolio.findFirst({
    where: { profileId, isActive: true, status: { in: ['PUBLISHED', 'DRAFT'] } },
    orderBy: { version: 'desc' },
    select: { id: true, plan: true, pipelineVersion: true, totalTokensUsed: true },
  });

  const existingPlan = existing?.plan as unknown as TemplatePortfolio | null;
  const isReusableTemplatePlan =
    !!existingPlan && typeof existingPlan.templateId === 'string' && !!existingPlan.copy;

  // No reusable copy → do a full generation with the requested template.
  if (!isReusableTemplatePlan) {
    enhancedLogger.info('No reusable portfolio copy; generating fresh for template switch', {
      profileId,
      templateId,
    });
    const result = await generateEnhancedPortfolio(profileId, { templateId });
    const generated = await db.generatedPortfolio.findUnique({
      where: { id: result.portfolioId },
      select: { plan: true },
    });
    const plan = generated?.plan as unknown as TemplatePortfolio;
    if (!plan || typeof plan.templateId !== 'string') {
      throw Errors.internal('Template switch completed but portfolio plan is missing');
    }
    return {
      portfolioId: result.portfolioId,
      templateId: result.templateId,
      plan,
      isAIGenerated: result.isAIGenerated,
      unchanged: false,
    };
  }

  // Already on the requested template — nothing to do.
  if (existingPlan.templateId === templateId) {
    return {
      portfolioId: existing!.id,
      templateId,
      plan: existingPlan,
      isAIGenerated: false,
      unchanged: true,
    };
  }

  // Load + normalize the profile so we can derive data-aware sections.
  const profile = await loadProfileWithRelations(profileId);
  if (!profile) {
    throw Errors.notFound('Profile not found');
  }

  let githubProfile = null;
  try {
    githubProfile = await db.gitHubProfile.findUnique({
      where: { profileId },
      select: {
        username: true,
        avatarUrl: true,
        bio: true,
        publicRepos: true,
        followers: true,
        totalStars: true,
        primaryLanguages: true,
      },
    });
  } catch {
    enhancedLogger.warn('Failed to fetch GitHub profile during template switch');
  }

  const serialized = JSON.parse(JSON.stringify(profile));
  const normalizedProfile = normalizeProfileForTemplate(serialized, {
    githubProfile: githubProfile ? JSON.parse(JSON.stringify(githubProfile)) : null,
  });

  // Derive sections from the new template, then preserve any sections the user
  // intentionally turned off (never force-enable something without data).
  const derivedSections = determineSections(
    normalizedProfile,
    templateMeta.defaultSections,
    existingPlan.enrichment
  );
  const sections = preserveUserHiddenSections(derivedSections, existingPlan.sections);

  // Reconcile style against the new template's bounded options.
  const style = reconcileStyle(existingPlan.style, templateMeta);

  const newPortfolio: TemplatePortfolio = {
    templateId,
    copy: existingPlan.copy,
    sections,
    style,
    enrichment: existingPlan.enrichment,
  };

  // Deactivate current active portfolios and save a new version.
  await db.generatedPortfolio.updateMany({
    where: { profileId, isActive: true },
    data: { isActive: false },
  });

  const latestVersion = await db.generatedPortfolio.findFirst({
    where: { profileId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  const saved = await db.generatedPortfolio.create({
    data: {
      profileId,
      version: nextVersion,
      status: 'PUBLISHED',
      plan: newPortfolio as unknown as Prisma.InputJsonValue,
      isActive: true,
      // Preserve provenance: the copy still came from whatever pipeline made it.
      pipelineVersion: existing!.pipelineVersion ?? 'template-v1',
      publishedAt: new Date(),
      totalTokensUsed: existing!.totalTokensUsed ?? undefined,
    },
  });

  enhancedLogger.info('Portfolio template switched', {
    profileId,
    fromTemplate: existingPlan.templateId,
    toTemplate: templateId,
    portfolioId: saved.id,
    version: nextVersion,
  });

  return {
    portfolioId: saved.id,
    templateId,
    plan: newPortfolio,
    isAIGenerated: false,
    unchanged: false,
  };
}

/**
 * Carry over intentionally-hidden sections from the previous config.
 *
 * When a user disables a section (e.g. they hid "Skills"), switching templates
 * should respect that. We only ever *downgrade* enabled→disabled for matching
 * section types; we never enable a section the new template's data-aware
 * defaults left off.
 */
export function preserveUserHiddenSections(
  derived: TemplateSectionConfig[],
  previous: TemplateSectionConfig[]
): TemplateSectionConfig[] {
  const hiddenTypes = new Set(previous.filter((s) => s.enabled === false).map((s) => s.type));

  // Structural sections must always remain visible regardless of prior state.
  const alwaysOn = new Set<TemplateSectionType>(['navigation', 'footer', 'hero']);

  return derived.map((section) =>
    hiddenTypes.has(section.type) && !alwaysOn.has(section.type)
      ? { ...section, enabled: false }
      : section
  );
}

/**
 * Reconcile a style config against a template's supported options. Keeps the
 * user's accent colour / font when the new template still supports it,
 * otherwise falls back to that template's first compatible option.
 */
export function reconcileStyle(
  style: TemplateStyleConfig | undefined,
  meta: TemplateKitMeta
): TemplateStyleConfig {
  const accentSupported = meta.compatibleAccentColors.some((c) => c.value === style?.accentColor);
  const fontSupported = meta.compatibleFonts.some((f) => f.id === style?.fontFamily);

  return {
    accentColor:
      accentSupported && style
        ? style.accentColor
        : (meta.compatibleAccentColors[0]?.value ?? '#3b82f6'),
    fontFamily:
      fontSupported && style ? style.fontFamily : (meta.compatibleFonts[0]?.id ?? 'inter'),
  };
}

// ============================================================================
// RE-GENERATION
// ============================================================================

/**
 * Regenerate only the AI copy for an existing enhanced portfolio.
 * Preserves template ID, sections, style, and enrichment metadata.
 */
export async function regenerateEnhancedCopy(
  portfolioId: string
): Promise<{ copy: TemplateCopy; isAIGenerated: boolean }> {
  const portfolio = await db.generatedPortfolio.findUnique({
    where: { id: portfolioId },
    select: { profileId: true, plan: true },
  });

  if (!portfolio) {
    throw Errors.notFound('Portfolio not found');
  }

  // Re-run the full pipeline for the best copy
  const result = await generateEnhancedPortfolio(portfolio.profileId, {
    skipAI: false,
  });

  // Read back the newly saved portfolio's copy
  const newPortfolio = await db.generatedPortfolio.findUnique({
    where: { id: result.portfolioId },
    select: { plan: true },
  });

  const plan = newPortfolio?.plan as unknown as TemplatePortfolio | null;
  if (!plan) {
    throw Errors.internal('Failed to read regenerated portfolio');
  }

  return { copy: plan.copy, isAIGenerated: result.isAIGenerated };
}
