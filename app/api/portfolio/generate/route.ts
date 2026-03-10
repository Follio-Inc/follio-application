import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { generateTemplatePortfolio } from '@/services/portfolio/template-generation.service';

const portfolioLogger = logger.child({ source: 'api-portfolio-generate' });

/**
 * POST /api/portfolio/generate
 *
 * Generate a template-based portfolio for the authenticated user's active profile.
 * Called automatically after onboarding and manually from the portfolio builder.
 *
 * Request body (all optional):
 *   templateId?: string    — Override template (defaults to "developer-dark")
 *   accentColor?: string   — Override accent color
 *   fontFamily?: string    — Override font
 *   skipAI?: boolean       — Skip AI copy generation, use defaults
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

    // Check if a template-based portfolio already exists (unless regenerating).
    // Old-style (non-template) portfolios are NOT counted — they'll be replaced.
    if (!regenerate) {
      const existing = await db.generatedPortfolio.findFirst({
        where: {
          profileId: context.profileId,
          isActive: true,
          status: { in: ['PUBLISHED', 'DRAFT'] },
        },
        select: { id: true, plan: true },
      });

      if (existing) {
        const existingPlan = existing.plan as Record<string, unknown> | null;
        const isTemplateBased = existingPlan && typeof existingPlan.templateId === 'string';

        if (isTemplateBased) {
          return NextResponse.json({
            success: true,
            portfolioId: existing.id,
            message: 'Portfolio already exists. Set regenerate: true to recreate.',
            alreadyExists: true,
          });
        }
        // Old-style portfolio detected — proceed to generate a template replacement
        portfolioLogger.info('Upgrading legacy portfolio to template-based', {
          userId,
          profileId: context.profileId,
          oldPortfolioId: existing.id,
        });
      }
    }

    portfolioLogger.info('Portfolio generation requested', {
      userId,
      profileId: context.profileId,
      templateId,
      regenerate,
    });

    const result = await generateTemplatePortfolio(context.profileId, {
      templateId,
      accentColor,
      fontFamily,
      skipAI,
    });

    portfolioLogger.info('Portfolio generation completed', {
      userId,
      profileId: context.profileId,
      portfolioId: result.portfolioId,
      templateId: result.templateId,
      generationTimeMs: result.generationTimeMs,
      isAIGenerated: result.isAIGenerated,
    });

    return NextResponse.json({
      success: true,
      portfolioId: result.portfolioId,
      templateId: result.templateId,
      isAIGenerated: result.isAIGenerated,
      generationTimeMs: result.generationTimeMs,
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
