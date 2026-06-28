/**
 * POST /api/portfolio/publish
 *
 * Promote the editor's working draft to the live portfolio. Copies
 * `userOverrides.draftPlan` into `plan` (what the public page renders) and
 * clears the draft so there are no longer unpublished changes.
 *
 * Optional body:
 *   draft?: TemplatePortfolio — if provided, this draft is validated and used
 *     (saves a round-trip when publishing immediately after editing). When
 *     omitted, the previously-saved draft is published.
 */

import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { resolvePrimaryProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getDraftPlan } from '@/lib/portfolio/templates/overrides';
import { parseTemplatePortfolio } from '@/lib/portfolio/templates/validation';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import type { PortfolioUserState } from '@/lib/portfolio/templates/overrides';
import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';

const publishLogger = logger.child({ source: 'api-portfolio-publish' });

export async function POST(request: NextRequest) {
  try {
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
        'Portfolio is not template-based and cannot be published',
        ErrorCode.BAD_REQUEST,
        400
      );
    }

    // Prefer an inline draft from the request; otherwise use the saved draft.
    let draft: TemplatePortfolio | null = null;
    const body = await request.json().catch(() => null);
    if (body?.draft && typeof body.draft === 'object') {
      try {
        draft = parseTemplatePortfolio(body.draft);
      } catch (error) {
        if (error instanceof ZodError) {
          throw new AppError('Invalid portfolio draft', ErrorCode.VALIDATION_ERROR, 400);
        }
        throw error;
      }
    } else {
      draft = getDraftPlan(portfolio.userOverrides);
    }

    if (!draft) {
      throw new AppError('No draft to publish', ErrorCode.BAD_REQUEST, 400);
    }

    // The template is never switched here.
    draft.templateId = plan.templateId;

    // Promote draft -> live plan, and reset the draft to match (no pending changes).
    const nextState: PortfolioUserState = {
      ...((portfolio.userOverrides ?? {}) as PortfolioUserState),
      draftPlan: draft,
    };

    await db.generatedPortfolio.update({
      where: { id: portfolio.id },
      data: {
        plan: draft as unknown as Prisma.InputJsonValue,
        userOverrides: nextState as unknown as Prisma.InputJsonValue,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    publishLogger.info('Portfolio published', {
      portfolioId: portfolio.id,
      profileId: context.profileId,
    });

    return NextResponse.json({ success: true, plan: draft });
  } catch (error) {
    return handleApiError(error, { method: 'POST', path: '/api/portfolio/publish' });
  }
}
