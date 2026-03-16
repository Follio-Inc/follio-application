import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { publishPortfolio } from '@/services/portfolio/orchestrator.service';

const portfolioLogger = logger.child({ source: 'api-portfolio-detail' });

interface RouteContext {
  params: Promise<{ portfolioId: string }>;
}

/**
 * GET /api/portfolio/[portfolioId]
 *
 * Returns a specific portfolio by ID. Owner only.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { portfolioId } = await context.params;
    const userContext = await resolveActiveProfileContext(userId);

    const portfolio = await db.generatedPortfolio.findUnique({
      where: { id: portfolioId },
    });

    if (!portfolio) {
      throw new AppError('Portfolio not found', ErrorCode.NOT_FOUND, 404);
    }

    if (portfolio.profileId !== userContext.profileId) {
      throw new AppError('Not authorized to view this portfolio', ErrorCode.FORBIDDEN, 403);
    }

    return NextResponse.json({
      success: true,
      portfolio: {
        id: portfolio.id,
        version: portfolio.version,
        status: portfolio.status,
        plan: portfolio.plan,
        userOverrides: portfolio.userOverrides,
        generationTimeMs: portfolio.generationTimeMs,
        totalTokensUsed: portfolio.totalTokensUsed,
        createdAt: portfolio.createdAt,
        publishedAt: portfolio.publishedAt,
      },
    });
  } catch (error) {
    return handleApiError(error, { method: 'GET', path: '/api/portfolio/[portfolioId]' });
  }
}

/**
 * PATCH /api/portfolio/[portfolioId]
 *
 * Updates portfolio user overrides or publishes/unpublishes.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { portfolioId } = await context.params;
    const userContext = await resolveActiveProfileContext(userId);

    const portfolio = await db.generatedPortfolio.findUnique({
      where: { id: portfolioId },
    });

    if (!portfolio) {
      throw new AppError('Portfolio not found', ErrorCode.NOT_FOUND, 404);
    }

    if (portfolio.profileId !== userContext.profileId) {
      throw new AppError('Not authorized to edit this portfolio', ErrorCode.FORBIDDEN, 403);
    }

    const body = await request.json();

    // Publish action
    if (body.action === 'publish') {
      const published = await publishPortfolio(portfolioId);
      portfolioLogger.info('Portfolio published', {
        userId,
        portfolioId,
        profileId: userContext.profileId,
      });
      return NextResponse.json({
        success: true,
        portfolio: {
          id: published.id,
          status: published.status,
          publishedAt: published.publishedAt,
        },
      });
    }

    // Unpublish action
    if (body.action === 'unpublish') {
      const unpublished = await db.generatedPortfolio.update({
        where: { id: portfolioId },
        data: { status: 'DRAFT', publishedAt: null },
      });
      portfolioLogger.info('Portfolio unpublished', {
        userId,
        portfolioId,
        profileId: userContext.profileId,
      });
      return NextResponse.json({
        success: true,
        portfolio: {
          id: unpublished.id,
          status: unpublished.status,
        },
      });
    }

    // User overrides update
    if (body.overrides) {
      const updated = await db.generatedPortfolio.update({
        where: { id: portfolioId },
        data: { userOverrides: body.overrides },
      });
      portfolioLogger.info('Portfolio overrides updated', {
        userId,
        portfolioId,
      });
      return NextResponse.json({
        success: true,
        portfolio: {
          id: updated.id,
          userOverrides: updated.userOverrides,
        },
      });
    }

    throw new AppError('No valid action or data provided', ErrorCode.BAD_REQUEST, 400);
  } catch (error) {
    return handleApiError(error, { method: 'PATCH', path: '/api/portfolio/[portfolioId]' });
  }
}
