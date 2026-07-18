/**
 * PATCH /api/portfolio/update
 *
 * Save the portfolio editor's working draft. The full TemplatePortfolio draft
 * is stored in `GeneratedPortfolio.userOverrides.draftPlan` so the public `plan`
 * (and therefore the live site) only changes when the user publishes.
 *
 * Request body:
 *   draft: TemplatePortfolio  — the complete working draft to persist
 *
 * The draft is keyed to the user's PRIMARY profile, which is the profile that
 * backs the public portfolio (decoupled from the active resume in the builder).
 */

import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { resolvePrimaryProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { assertPortfolioEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { parseTemplatePortfolio } from '@/lib/portfolio/templates/validation';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import type { PortfolioUserState } from '@/lib/portfolio/templates/overrides';
import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';

const updateLogger = logger.child({ source: 'api-portfolio-update' });

export async function PATCH(request: NextRequest) {
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
      select: { id: true, plan: true, userOverrides: true },
    });

    if (!portfolio) {
      throw new AppError('No active portfolio found', ErrorCode.NOT_FOUND, 404);
    }

    const plan = portfolio.plan as unknown as TemplatePortfolio;
    if (!plan || typeof plan.templateId !== 'string') {
      throw new AppError(
        'Portfolio is not template-based and cannot be edited',
        ErrorCode.BAD_REQUEST,
        400
      );
    }

    const body = await request.json();
    if (!body?.draft || typeof body.draft !== 'object') {
      throw new AppError('Missing draft payload', ErrorCode.VALIDATION_ERROR, 400);
    }

    let draft: TemplatePortfolio;
    try {
      draft = parseTemplatePortfolio(body.draft);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError('Invalid portfolio draft', ErrorCode.VALIDATION_ERROR, 400);
      }
      throw error;
    }

    // The template itself is switched via /api/portfolio/switch-template, never
    // through the editor. Pin the draft's templateId to the published one.
    draft.templateId = plan.templateId;

    const existingState = (portfolio.userOverrides ?? {}) as PortfolioUserState;
    const nextState: PortfolioUserState = { ...existingState, draftPlan: draft };

    await db.generatedPortfolio.update({
      where: { id: portfolio.id },
      data: { userOverrides: nextState as unknown as Prisma.InputJsonValue },
    });

    updateLogger.info('Portfolio draft saved', {
      portfolioId: portfolio.id,
      profileId: context.profileId,
    });

    return NextResponse.json({ success: true, draft });
  } catch (error) {
    return handleApiError(error, { method: 'PATCH', path: '/api/portfolio/update' });
  }
}
