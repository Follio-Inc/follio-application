import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { generateEnhancedPortfolio } from '@/services/portfolio/enhanced-generation.service';

const portfolioLogger = logger.child({ source: 'api-portfolio-generate' });

/**
 * POST /api/portfolio/generate
 *
 * Generate a portfolio for the authenticated user's active profile.
 * Uses the AI pipeline (understand → extract evidence → narrate → validate)
 * to produce deeply enriched portfolio data.
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
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const context = await resolveActiveProfileContext(userId);

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

    const result = await generateEnhancedPortfolio(context.profileId, {
      templateId,
      accentColor,
      fontFamily,
      skipAI,
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
 * Returns the active portfolio for the authenticated user,
 * or null if none exists.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const context = await resolveActiveProfileContext(userId);

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
