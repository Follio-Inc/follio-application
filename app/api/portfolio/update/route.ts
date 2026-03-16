/**
 * PATCH /api/portfolio/update
 *
 * Update the active template portfolio's configuration.
 * Handles: section toggling, reordering, copy edits, style changes.
 *
 * Request body:
 *   sections?: TemplateSectionConfig[]   — Updated section configurations
 *   copy?: Partial<TemplateCopy>         — Updated copy fields
 *   style?: Partial<TemplateStyleConfig> — Updated style fields
 */

import { Prisma } from '@prisma/client';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import type {
  TemplateCopy,
  TemplatePortfolio,
  TemplateSectionConfig,
  TemplateStyleConfig,
} from '@/lib/portfolio/templates/types';

const updateLogger = logger.child({ source: 'api-portfolio-update' });

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const context = await resolveActiveProfileContext(userId);

    // Find the active portfolio
    const portfolio = await db.generatedPortfolio.findFirst({
      where: {
        profileId: context.profileId,
        isActive: true,
        status: { in: ['PUBLISHED', 'DRAFT'] },
      },
      orderBy: { version: 'desc' },
      select: { id: true, plan: true },
    });

    if (!portfolio) {
      throw new AppError('No active portfolio found', ErrorCode.NOT_FOUND, 404);
    }

    const plan = portfolio.plan as unknown as TemplatePortfolio;

    // Validate this is a template-based portfolio
    if (!plan || typeof plan.templateId !== 'string') {
      throw new AppError(
        'Portfolio is not template-based and cannot be updated via this endpoint',
        ErrorCode.BAD_REQUEST,
        400
      );
    }

    // Parse update body
    const body = await request.json();
    let updated = false;

    // Update sections
    if (Array.isArray(body.sections)) {
      const sections = body.sections as TemplateSectionConfig[];
      // Validate section structure
      for (const section of sections) {
        if (
          !section.id ||
          !section.type ||
          typeof section.enabled !== 'boolean' ||
          typeof section.order !== 'number'
        ) {
          throw new AppError('Invalid section configuration', ErrorCode.VALIDATION_ERROR, 400);
        }
      }
      plan.sections = sections;
      updated = true;
    }

    // Update copy (partial merge)
    if (body.copy && typeof body.copy === 'object') {
      const copyUpdates = body.copy as Partial<TemplateCopy>;

      // Core string fields — always string type
      const coreFields = [
        'heroHeadline',
        'heroSubtext',
        'aboutTitle',
        'aboutText',
        'contactTitle',
        'contactSubtext',
        'primaryCtaLabel',
        'seoTitle',
        'seoDescription',
      ] as const;

      for (const field of coreFields) {
        if (field in copyUpdates && typeof copyUpdates[field] === 'string') {
          plan.copy[field] = copyUpdates[field];
        }
      }

      // Extended nullable string fields from AI pipeline
      const extendedFields = [
        'experienceNarrative',
        'githubNarrative',
        'writingNarrative',
        'pullQuote',
      ] as const;

      for (const field of extendedFields) {
        if (field in copyUpdates && typeof copyUpdates[field] === 'string') {
          plan.copy[field] = copyUpdates[field];
        }
      }
      updated = true;
    }

    // Update style (partial merge)
    if (body.style && typeof body.style === 'object') {
      const styleUpdates = body.style as Partial<TemplateStyleConfig>;
      if (typeof styleUpdates.accentColor === 'string') {
        plan.style.accentColor = styleUpdates.accentColor;
      }
      if (typeof styleUpdates.fontFamily === 'string') {
        plan.style.fontFamily = styleUpdates.fontFamily;
      }
      updated = true;
    }

    if (!updated) {
      return NextResponse.json({ success: true, message: 'No changes to apply' });
    }

    // Save to database
    await db.generatedPortfolio.update({
      where: { id: portfolio.id },
      data: { plan: plan as unknown as Prisma.InputJsonValue },
    });

    updateLogger.info('Portfolio updated', {
      portfolioId: portfolio.id,
      profileId: context.profileId,
      updatedFields: Object.keys(body).filter((k) => body[k] !== undefined),
    });

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch (error) {
    return handleApiError(error, { method: 'PATCH', path: '/api/portfolio/update' });
  }
}
