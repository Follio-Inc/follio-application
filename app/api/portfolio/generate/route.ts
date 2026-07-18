import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolvePrimaryProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { assertPortfolioEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { generateEnhancedPortfolio } from '@/services/portfolio/enhanced-generation.service';
import { resolveWorkingPlan } from '@/services/portfolio/plan-helpers';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';

const portfolioLogger = logger.child({ source: 'api-portfolio-generate' });

/**
 * POST /api/portfolio/generate
 *
 * Generate (or regenerate) the portfolio for the authenticated user's primary
 * profile — the resume that backs the public portfolio surface. Uses the AI
 * pipeline to produce narrative copy and portfolio-owned structural content.
 *
 * Falls back to simple defaults if AI is unavailable.
 *
 * Request body (all optional):
 *   templateId?: string    — Override template (defaults to "developer-dark")
 *   accentColor?: string   — Override accent color
 *   fontFamily?: string    — Override font
 *   skipAI?: boolean       — Skip AI pipeline, use default copy only
 *   regenerate?: boolean   — Force regeneration even if one exists
 */
export async function POST(request: NextRequest) {
  try {
    assertPortfolioEnabled();

    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const context = await resolvePrimaryProfileContext(userId);

    // Parse optional body
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine — all params are optional
    }

    const templateId = typeof body.templateId === 'string' ? body.templateId : undefined;
    const accentColor = typeof body.accentColor === 'string' ? body.accentColor : undefined;
    const fontFamily = typeof body.fontFamily === 'string' ? body.fontFamily : undefined;
    const skipAI = body.skipAI === true;
    const regenerate = body.regenerate === true;

    // Check if a portfolio already exists (unless regenerating)
    if (!regenerate) {
      const existing = await db.generatedPortfolio.findFirst({
        where: {
          profileId: context.profileId,
          isActive: true,
          status: { in: ['PUBLISHED', 'DRAFT'] },
        },
        select: { id: true, plan: true, pipelineVersion: true },
      });

      if (existing) {
        const isEnhanced = existing.pipelineVersion === 'enhanced-v1';
        const isTemplateBased =
          existing.pipelineVersion === 'template-v1' ||
          (existing.plan as Record<string, unknown> | null)?.templateId;

        if (isEnhanced || isTemplateBased) {
          return NextResponse.json({
            success: true,
            portfolioId: existing.id,
            message: 'Portfolio already exists. Set regenerate: true to recreate.',
            alreadyExists: true,
          });
        }

        // Legacy portfolio — proceed to generate a replacement
        portfolioLogger.info('Upgrading legacy portfolio to enhanced', {
          userId,
          profileId: context.profileId,
          oldPortfolioId: existing.id,
        });
      }
    }

    portfolioLogger.info('Enhanced portfolio generation requested', {
      userId,
      profileId: context.profileId,
      templateId,
      skipAI,
      regenerate,
    });

    let preserveCustomizations: TemplatePortfolio | undefined;
    if (regenerate) {
      const existingForPreserve = await db.generatedPortfolio.findFirst({
        where: {
          profileId: context.profileId,
          isActive: true,
          status: { in: ['PUBLISHED', 'DRAFT'] },
        },
        orderBy: { version: 'desc' },
        select: { plan: true, userOverrides: true },
      });
      if (existingForPreserve) {
        preserveCustomizations =
          resolveWorkingPlan(
            existingForPreserve.plan as TemplatePortfolio | null,
            existingForPreserve.userOverrides
          ) ?? undefined;
      }
    }

    const result = await generateEnhancedPortfolio(context.profileId, {
      templateId,
      accentColor,
      fontFamily,
      skipAI,
      preserveCustomizations,
    });

    portfolioLogger.info('Enhanced portfolio generation completed', {
      userId,
      profileId: context.profileId,
      portfolioId: result.portfolioId,
      templateId: result.templateId,
      generationTimeMs: result.generationTimeMs,
      isAIGenerated: result.isAIGenerated,
      pipelineStagesRun: result.pipelineStagesRun,
    });

    return NextResponse.json({
      success: true,
      portfolioId: result.portfolioId,
      templateId: result.templateId,
      isAIGenerated: result.isAIGenerated,
      generationTimeMs: result.generationTimeMs,
      pipelineStagesRun: result.pipelineStagesRun,
    });
  } catch (error) {
    return handleApiError(error, { method: 'POST', path: '/api/portfolio/generate' });
  }
}

/**
 * GET /api/portfolio/generate
 *
 * Returns the active portfolio for the user's primary (portfolio) profile,
 * or null if none exists.
 */
export async function GET() {
  try {
    assertPortfolioEnabled();

    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const context = await resolvePrimaryProfileContext(userId);

    const portfolio = await db.generatedPortfolio.findFirst({
      where: {
        profileId: context.profileId,
        isActive: true,
        status: { in: ['PUBLISHED', 'DRAFT'] },
      },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        status: true,
        plan: true,
        userOverrides: true,
        generationTimeMs: true,
        pipelineVersion: true,
        createdAt: true,
        publishedAt: true,
      },
    });

    if (!portfolio) {
      return NextResponse.json({ success: true, portfolio: null });
    }

    return NextResponse.json({
      success: true,
      portfolio: {
        id: portfolio.id,
        version: portfolio.version,
        status: portfolio.status,
        plan: portfolio.plan,
        userOverrides: portfolio.userOverrides,
        pipelineVersion: portfolio.pipelineVersion,
        createdAt: portfolio.createdAt,
        publishedAt: portfolio.publishedAt,
      },
    });
  } catch (error) {
    return handleApiError(error, { method: 'GET', path: '/api/portfolio/generate' });
  }
}
