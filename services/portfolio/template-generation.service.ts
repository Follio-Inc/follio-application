/**
 * Template Portfolio Generation Service
 *
 * @deprecated Use `generateEnhancedPortfolio` from `enhanced-generation.service.ts`.
 * This simpler path remains for scripts and backwards compatibility only.
 *
 * Orchestrates the creation of a template-based portfolio:
 * 1. Load profile data from DB
 * 2. Normalize it for the template system
 * 3. Generate AI copy
 * 4. Assemble the TemplatePortfolio object
 * 5. Save to GeneratedPortfolio
 */

import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

import type {
  TemplateCopy,
  TemplatePortfolio,
  TemplateStyleConfig,
} from '@/lib/portfolio/templates/types';

import { isAIAvailable } from '@/lib/ai-client';
import { getDefaultTemplateId, getTemplateMeta } from '@/lib/portfolio/templates/registry';
import { transformToPortfolioContent } from './content-transform.service';
import { determineSections, loadNormalizedProfile } from './plan-helpers';
import { generateTemplateCopy, getDefaultCopy } from './template-copy.service';

const genLogger = logger.child({ source: 'template-generation' });

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

interface GenerateTemplateOptions {
  /** Override the template ID (defaults to the default template) */
  templateId?: string;
  /** Override accent color */
  accentColor?: string;
  /** Override font family */
  fontFamily?: string;
  /** Skip AI copy generation and use defaults */
  skipAI?: boolean;
}

interface GenerateTemplateResult {
  portfolioId: string;
  templateId: string;
  isAIGenerated: boolean;
  generationTimeMs: number;
}

/**
 * Generate a template-based portfolio for a profile.
 *
 * This is the main entry point for portfolio generation.
 * Call this after onboarding completion or when the user
 * requests a portfolio regeneration.
 */
export async function generateTemplatePortfolio(
  profileId: string,
  options: GenerateTemplateOptions = {}
): Promise<GenerateTemplateResult> {
  const startTime = Date.now();

  genLogger.info('Starting template portfolio generation', { profileId });

  // ── Step 1: Load profile data ────────────────────────────────────────
  const normalizedProfile = await loadNormalizedProfile(profileId);
  if (!normalizedProfile) {
    throw Errors.notFound('Profile not found');
  }

  // ── Step 2: Determine template ───────────────────────────────────────
  const templateId = options.templateId || getDefaultTemplateId();
  const meta = getTemplateMeta(templateId);
  if (!meta) {
    throw Errors.badRequest(`Template "${templateId}" does not exist`);
  }

  genLogger.info('Using template', { templateId, templateName: meta.name });

  // ── Step 3: Generate AI copy ─────────────────────────────────────────
  let copy: TemplateCopy;
  let isAIGenerated = false;
  const useAI = !options.skipAI && isAIAvailable();

  if (!useAI) {
    genLogger.info('Skipping AI copy generation, using defaults');
    copy = getDefaultCopy(normalizedProfile);
  } else {
    const result = await generateTemplateCopy(normalizedProfile);
    copy = result.copy;
    isAIGenerated = result.isAIGenerated;
  }

  // ── Step 4: Portfolio-owned content ──────────────────────────────────
  const content = await transformToPortfolioContent(normalizedProfile, {
    projectNarratives: copy.projectNarratives,
    skipAI: !useAI,
  });

  // ── Step 5: Determine section configuration ──────────────────────────
  const sections = determineSections(content, meta.defaultSections);

  // ── Step 6: Determine style ──────────────────────────────────────────
  const style: TemplateStyleConfig = {
    accentColor: options.accentColor || meta.compatibleAccentColors[0]?.value || '#3b82f6',
    fontFamily: options.fontFamily || meta.compatibleFonts[0]?.id || 'inter',
    appearance: meta.defaultAppearance ?? 'system',
  };

  // ── Step 7: Assemble the TemplatePortfolio ───────────────────────────
  const templatePortfolio: TemplatePortfolio = {
    templateId,
    copy,
    content,
    sections,
    style,
    enrichment: null,
  };

  // ── Step 8: Save to database ─────────────────────────────────────────
  const generationTimeMs = Date.now() - startTime;

  // Deactivate any existing active portfolio
  await db.generatedPortfolio.updateMany({
    where: { profileId, isActive: true },
    data: { isActive: false },
  });

  // Determine next version number
  const latestVersion = await db.generatedPortfolio.findFirst({
    where: { profileId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  // Create the new portfolio
  const saved = await db.generatedPortfolio.create({
    data: {
      profileId,
      version: nextVersion,
      status: 'PUBLISHED',
      plan: templatePortfolio as unknown as Prisma.InputJsonValue,
      userOverrides: { draftPlan: templatePortfolio } as unknown as Prisma.InputJsonValue,
      isActive: true,
      generationTimeMs,
      pipelineVersion: 'template-v1',
      publishedAt: new Date(),
    },
  });

  genLogger.info('Template portfolio generated and saved', {
    portfolioId: saved.id,
    templateId,
    version: nextVersion,
    generationTimeMs,
    isAIGenerated,
  });

  return {
    portfolioId: saved.id,
    templateId,
    isAIGenerated,
    generationTimeMs,
  };
}

// ============================================================================
// RE-GENERATION (for portfolio builder)
// ============================================================================

/**
 * @deprecated Use `regenerateEnhancedCopy` from `enhanced-generation.service.ts`.
 */
export async function regenerateTemplateCopy(
  portfolioId: string
): Promise<{ copy: TemplateCopy; isAIGenerated: boolean }> {
  const { regenerateEnhancedCopy } = await import('./enhanced-generation.service');
  return regenerateEnhancedCopy(portfolioId);
}
