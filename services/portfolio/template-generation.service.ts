/**
 * Template Portfolio Generation Service
 *
 * Orchestrates the creation of a template-based portfolio:
 * 1. Load profile data from DB
 * 2. Normalize it for the template system
 * 3. Generate AI copy
 * 4. Assemble the TemplatePortfolio object
 * 5. Save to GeneratedPortfolio
 *
 * This replaces the old 6-stage orchestrator for template-based portfolios.
 */

import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

import type {
  TemplateCopy,
  TemplatePortfolio,
  TemplateSectionConfig,
  TemplateStyleConfig,
} from '@/lib/portfolio/templates/types';
import type { FullProfile } from '@/types';

import { isAIAvailable } from '@/lib/ai-client';
import { normalizeProfileForTemplate } from '@/lib/portfolio/templates/normalizer';
import { getDefaultTemplateId, getTemplateMeta } from '@/lib/portfolio/templates/registry';
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
  const profile = await loadProfileWithRelations(profileId);
  if (!profile) {
    throw Errors.notFound('Profile not found');
  }

  // ── Step 2: Determine template ───────────────────────────────────────
  const templateId = options.templateId || getDefaultTemplateId();
  const meta = getTemplateMeta(templateId);
  if (!meta) {
    throw Errors.badRequest(`Template "${templateId}" does not exist`);
  }

  genLogger.info('Using template', { templateId, templateName: meta.name });

  // ── Step 3: Normalize profile data ───────────────────────────────────
  // Load GitHub profile separately (not included in the standard query)
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
    genLogger.warn('Failed to fetch GitHub profile, continuing without it');
  }

  // Convert to serialized form (same as what the client receives)
  const serialized = JSON.parse(JSON.stringify(profile));
  const normalizedProfile = normalizeProfileForTemplate(serialized, {
    githubProfile: githubProfile ? JSON.parse(JSON.stringify(githubProfile)) : null,
  });

  // ── Step 4: Generate AI copy ─────────────────────────────────────────
  let copy: TemplateCopy;
  let isAIGenerated = false;

  if (options.skipAI || !isAIAvailable()) {
    genLogger.info('Skipping AI copy generation, using defaults');
    copy = getDefaultCopy(normalizedProfile);
  } else {
    const result = await generateTemplateCopy(normalizedProfile);
    copy = result.copy;
    isAIGenerated = result.isAIGenerated;
  }

  // ── Step 5: Determine section configuration ──────────────────────────
  const sections = determineSections(normalizedProfile, meta.defaultSections);

  // ── Step 6: Determine style ──────────────────────────────────────────
  const style: TemplateStyleConfig = {
    accentColor: options.accentColor || meta.compatibleAccentColors[0]?.value || '#3b82f6',
    fontFamily: options.fontFamily || meta.compatibleFonts[0]?.id || 'inter',
  };

  // ── Step 7: Assemble the TemplatePortfolio ───────────────────────────
  const templatePortfolio: TemplatePortfolio = {
    templateId,
    copy,
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
// SECTION DETERMINATION
// ============================================================================

/**
 * Determine which sections to enable based on available profile data.
 * Sections without data are disabled by default.
 */
function determineSections(
  profile: import('@/lib/portfolio/templates/types').TemplateProfileData,
  defaults: TemplateSectionConfig[]
): TemplateSectionConfig[] {
  return defaults.map((section) => {
    // Always keep navigation and footer enabled
    if (section.type === 'navigation' || section.type === 'footer') {
      return { ...section, enabled: true };
    }

    // Hero and about are always enabled (they use AI copy)
    if (section.type === 'hero' || section.type === 'about') {
      return { ...section, enabled: true };
    }

    // Contact is always enabled
    if (section.type === 'contact') {
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
// RE-GENERATION (for portfolio builder)
// ============================================================================

/**
 * Regenerate only the AI copy for an existing template portfolio.
 * Preserves all user customizations (sections, style, overrides).
 */
export async function regenerateTemplateCopy(
  portfolioId: string
): Promise<{ copy: TemplateCopy; isAIGenerated: boolean }> {
  const portfolio = await db.generatedPortfolio.findUnique({
    where: { id: portfolioId },
    select: { profileId: true, plan: true },
  });

  if (!portfolio) {
    throw Errors.notFound('Portfolio not found');
  }

  const profile = await loadProfileWithRelations(portfolio.profileId);
  if (!profile) {
    throw Errors.notFound('Profile not found');
  }

  const serialized = JSON.parse(JSON.stringify(profile));
  const normalizedProfile = normalizeProfileForTemplate(serialized);

  const result = await generateTemplateCopy(normalizedProfile);

  // Update the copy in the plan
  const plan = portfolio.plan as unknown as TemplatePortfolio;
  plan.copy = result.copy;

  await db.generatedPortfolio.update({
    where: { id: portfolioId },
    data: { plan: plan as unknown as Prisma.InputJsonValue },
  });

  return result;
}
