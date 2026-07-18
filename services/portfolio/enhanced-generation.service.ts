/**
 * Enhanced Portfolio Generation Service
 *
 * Product entry point for portfolio generation (onboarding, regenerate, set-primary).
 * When AI is available, runs the shared portfolio-generation agent
 * (`services/agents/portfolio`) which adapts to attached sources and section
 * policies. This service still owns template assembly + DB persistence so the
 * end-user experience stays seamless.
 *
 * Design principles:
 * - Template-agnostic: produces data any template can consume
 * - Backwards compatible: enrichment is optional, core copy always present
 * - Graceful degradation: falls back to default copy if AI fails
 * - Observable: agent run metadata stored on GeneratedPortfolio
 */

import { isAIAvailable } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getDraftPlan } from '@/lib/portfolio/templates/overrides';
import { getDefaultTemplateId, getTemplateMeta } from '@/lib/portfolio/templates/registry';
import { runPortfolioGenerationAgent } from '@/services/agents/portfolio';
import { Prisma } from '@prisma/client';

import { transformToPortfolioContent } from './content-transform.service';
import { determineSections, loadNormalizedProfile, resolveWorkingPlan } from './plan-helpers';

import type {
  TemplateAIEnrichment,
  TemplateCopy,
  TemplateKitMeta,
  TemplatePortfolio,
  TemplateProfileData,
  TemplateSectionConfig,
  TemplateSectionType,
  TemplateStyleConfig,
} from '@/lib/portfolio/templates/types';

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
  /**
   * When set, carry over the user's template choice, style, media overrides,
   * and intentionally hidden sections. Fresh AI copy + content are still generated.
   */
  preserveCustomizations?: TemplatePortfolio;
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
 * Otherwise we generate a portfolio from the resume, snapshotting portfolio-owned
 * content. Pass `skipAI: false` when the user explicitly assigns a resume so
 * content is AI-shaped; default `skipAI: true` keeps dashboard/fallback paths fast.
 */
export async function ensureActiveTemplatePortfolio(
  profileId: string,
  options: { templateId?: string; skipAI?: boolean } = {}
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
    skipAI: options.skipAI ?? true,
  });

  return { portfolioId: result.portfolioId, created: true };
}

/**
 * Generate a fully AI-enriched template portfolio.
 *
 * Primary entry point for onboarding, regenerate, and set-primary flows.
 * When AI is available this runs the shared portfolio-generation agent
 * (source-aware, policy-driven). Persistence and template assembly stay here
 * so the product UX remains unchanged.
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
    const preserved = options.preserveCustomizations;
    const templateId = preserved?.templateId ?? options.templateId ?? getDefaultTemplateId();
    const templateMeta = getTemplateMeta(templateId);
    if (!templateMeta) {
      throw Errors.badRequest(`Template "${templateId}" does not exist`);
    }

    // ── Load profile for template normalizer ──────────────────────────
    const normalizedProfile = await loadNormalizedProfile(profileId);
    if (!normalizedProfile) {
      throw Errors.notFound('Profile not found');
    }

    // ── Decide: agent or simple fallback ──────────────────────────────
    const useAI = !options.skipAI && isAIAvailable();

    let copy: TemplateCopy;
    let enrichment: TemplateAIEnrichment | null = null;
    let content: TemplateProfileData | undefined;

    if (useAI) {
      report('agent', 0, 4, 'Analyzing your profile and attached sources...');
      const { output, run } = await runPortfolioGenerationAgent(
        { profileId },
        {
          profileId,
          onProgress: (event) => {
            report(
              event.stepId,
              Math.max(0, event.stepsCompleted),
              event.totalSteps > 0 ? event.totalSteps : 6,
              event.message
            );
          },
        }
      );
      copy = output.copy;
      enrichment = output.enrichment;
      content = output.content;
      stagesRun.push(...output.stagesRun, `agent:${run.version}`);
      enhancedLogger.info('Portfolio agent completed', {
        profileId,
        runId: run.id,
        stages: output.stagesRun,
        tokens: output.tokensUsed,
      });
    } else {
      enhancedLogger.info('AI unavailable or skipped, using default copy');
      copy = getDefaultCopy(normalizedProfile);
    }

    // ── Portfolio-owned content (snapshot + portfolio-style transform) ─
    // Agent already shaped content when AI ran; otherwise transform here.
    report('content', useAI ? 3 : 1, useAI ? 4 : 3, 'Shaping portfolio content...');
    if (!content) {
      content = await transformToPortfolioContent(normalizedProfile, {
        projectNarratives: copy.projectNarratives,
        skipAI: !useAI,
      });
      if (useAI) stagesRun.push('contentTransform');
    }

    // ── Determine sections ────────────────────────────────────────────
    report('sections', useAI ? 3 : 2, useAI ? 4 : 3, 'Configuring sections...');
    const derivedSections = determineSections(content, templateMeta.defaultSections, enrichment);
    const sections = preserved
      ? preserveUserHiddenSections(derivedSections, preserved.sections)
      : derivedSections;

    // ── Style ─────────────────────────────────────────────────────────
    const style: TemplateStyleConfig = preserved?.style
      ? reconcileStyle(
          {
            accentColor: options.accentColor ?? preserved.style.accentColor,
            fontFamily: options.fontFamily ?? preserved.style.fontFamily,
            appearance: preserved.style.appearance,
          },
          templateMeta
        )
      : {
          accentColor:
            options.accentColor || templateMeta.compatibleAccentColors[0]?.value || '#3b82f6',
          fontFamily: options.fontFamily || templateMeta.compatibleFonts[0]?.id || 'inter',
          appearance: templateMeta.defaultAppearance ?? 'system',
        };

    // ── Assemble TemplatePortfolio ────────────────────────────────────
    const templatePortfolio: TemplatePortfolio = {
      templateId,
      copy,
      content,
      sections,
      style,
      enrichment,
      overrides: preserved?.overrides,
    };

    // ── Save to DB ────────────────────────────────────────────────────
    report('saving', useAI ? 4 : 3, useAI ? 4 : 3, 'Saving your portfolio...');
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
        userOverrides: { draftPlan: templatePortfolio } as unknown as Prisma.InputJsonValue,
        isActive: true,
        generationTimeMs,
        pipelineVersion: useAI ? 'agent-v2' : 'template-v1',
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
// SECTION DETERMINATION (enhanced with AI insights)
// ============================================================================

export interface SwitchTemplateOptions {
  /** Current editor draft from the client (may include unsaved changes). */
  sourcePlan?: TemplatePortfolio;
}

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
  templateId: string,
  options: SwitchTemplateOptions = {}
): Promise<SwitchTemplateResult> {
  const templateMeta = getTemplateMeta(templateId);
  if (!templateMeta) {
    throw Errors.badRequest(`Template "${templateId}" does not exist`);
  }

  // Find the current active portfolio, if any.
  const existing = await db.generatedPortfolio.findFirst({
    where: { profileId, isActive: true, status: { in: ['PUBLISHED', 'DRAFT'] } },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      plan: true,
      pipelineVersion: true,
      totalTokensUsed: true,
      userOverrides: true,
    },
  });

  const publishedPlan = existing?.plan as unknown as TemplatePortfolio | null;
  const sourcePlan = resolveWorkingPlan(publishedPlan, existing?.userOverrides, options.sourcePlan);
  const isReusableTemplatePlan =
    !!sourcePlan && typeof sourcePlan.templateId === 'string' && !!sourcePlan.copy;

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

  // Already on the requested template — return the working plan as-is.
  if (sourcePlan.templateId === templateId) {
    return {
      portfolioId: existing!.id,
      templateId,
      plan: sourcePlan,
      isAIGenerated: false,
      unchanged: true,
    };
  }

  const normalizedProfile = await loadNormalizedProfile(profileId);
  if (!normalizedProfile) {
    throw Errors.notFound('Profile not found');
  }

  // Prefer owned content; seed from the live profile for legacy plans so a
  // template switch never re-links the portfolio to the resume.
  const content =
    sourcePlan.content ??
    (await transformToPortfolioContent(normalizedProfile, {
      projectNarratives: sourcePlan.copy.projectNarratives,
      skipAI: true,
    }));

  // Derive sections from the new template, then preserve any sections the user
  // intentionally turned off (never force-enable something without data).
  const derivedSections = determineSections(
    content,
    templateMeta.defaultSections,
    sourcePlan.enrichment
  );
  const sections = preserveUserHiddenSections(derivedSections, sourcePlan.sections);

  // Reconcile style against the new template's bounded options.
  const style = reconcileStyle(sourcePlan.style, templateMeta);

  const newPortfolio: TemplatePortfolio = {
    templateId,
    copy: sourcePlan.copy,
    content,
    sections,
    style,
    enrichment: sourcePlan.enrichment,
    overrides: sourcePlan.overrides,
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
      userOverrides: { draftPlan: newPortfolio } as unknown as Prisma.InputJsonValue,
      isActive: true,
      pipelineVersion: existing!.pipelineVersion ?? 'template-v1',
      publishedAt: new Date(),
      totalTokensUsed: existing!.totalTokensUsed ?? undefined,
    },
  });

  enhancedLogger.info('Portfolio template switched', {
    profileId,
    fromTemplate: sourcePlan.templateId,
    toTemplate: templateId,
    portfolioId: saved.id,
    version: nextVersion,
    usedDraft: Boolean(getDraftPlan(existing?.userOverrides) || options.sourcePlan),
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
  const validAppearances = new Set(['light', 'dark', 'system']);
  const appearanceSupported =
    style?.appearance !== undefined && validAppearances.has(style.appearance);

  return {
    accentColor:
      accentSupported && style
        ? style.accentColor
        : (meta.compatibleAccentColors[0]?.value ?? '#3b82f6'),
    fontFamily:
      fontSupported && style ? style.fontFamily : (meta.compatibleFonts[0]?.id ?? 'inter'),
    appearance: appearanceSupported ? style!.appearance : (meta.defaultAppearance ?? 'system'),
  };
}

// ============================================================================
// RE-GENERATION
// ============================================================================

/**
 * Regenerate AI copy and portfolio content for an existing portfolio.
 * Preserves the user's template choice, style, media overrides, and hidden sections.
 */
export async function regenerateEnhancedCopy(
  portfolioId: string
): Promise<{ copy: TemplateCopy; isAIGenerated: boolean }> {
  const portfolio = await db.generatedPortfolio.findUnique({
    where: { id: portfolioId },
    select: { profileId: true, plan: true, userOverrides: true },
  });

  if (!portfolio) {
    throw Errors.notFound('Portfolio not found');
  }

  const existingPlan = resolveWorkingPlan(
    portfolio.plan as unknown as TemplatePortfolio,
    portfolio.userOverrides
  );
  if (!existingPlan) {
    throw Errors.badRequest('Portfolio is not template-based and cannot be regenerated');
  }

  const result = await generateEnhancedPortfolio(portfolio.profileId, {
    templateId: existingPlan.templateId,
    skipAI: false,
    preserveCustomizations: existingPlan,
  });

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
