import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolvePrimaryProfileContext } from '@/lib/active-profile';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { assertPortfolioEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { getTemplateMeta } from '@/lib/portfolio/templates/registry';
import { parseTemplatePortfolio } from '@/lib/portfolio/templates/validation';
import { switchPortfolioTemplate } from '@/services/portfolio/enhanced-generation.service';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';

const switchLogger = logger.child({ source: 'api-portfolio-switch-template' });

/**
 * POST /api/portfolio/switch-template
 *
 * Switch the authenticated user's portfolio to a different template, reusing
 * existing AI copy/enrichment (no AI re-run). Operates on the user's primary
 * (portfolio-facing) profile — the same profile the dashboard portfolio shows.
 *
 * Request body:
 *   templateId: string — the template to switch to (required)
 *   draft?: TemplatePortfolio — optional current editor draft (includes unsaved edits)
 */
export async function POST(request: NextRequest) {
  try {
    assertPortfolioEnabled();

    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const body = (await request.json().catch(() => ({}))) as {
      templateId?: unknown;
      draft?: unknown;
    };
    const templateId = typeof body.templateId === 'string' ? body.templateId : '';

    if (!templateId) {
      throw new AppError('templateId is required', ErrorCode.BAD_REQUEST, 400);
    }

    if (!getTemplateMeta(templateId)) {
      throw new AppError(`Template "${templateId}" does not exist`, ErrorCode.BAD_REQUEST, 400);
    }

    let sourcePlan: TemplatePortfolio | undefined;
    if (body.draft && typeof body.draft === 'object') {
      try {
        sourcePlan = parseTemplatePortfolio(body.draft);
      } catch {
        throw new AppError('Invalid portfolio draft', ErrorCode.VALIDATION_ERROR, 400);
      }
    }

    const context = await resolvePrimaryProfileContext(userId);

    switchLogger.info('Template switch requested', {
      userId,
      profileId: context.profileId,
      templateId,
      hasClientDraft: Boolean(sourcePlan),
    });

    const result = await switchPortfolioTemplate(context.profileId, templateId, {
      sourcePlan,
    });

    switchLogger.info('Template switch completed', {
      userId,
      profileId: context.profileId,
      portfolioId: result.portfolioId,
      templateId: result.templateId,
      unchanged: result.unchanged,
      isAIGenerated: result.isAIGenerated,
    });

    return NextResponse.json({
      success: true,
      portfolioId: result.portfolioId,
      templateId: result.templateId,
      plan: result.plan,
      unchanged: result.unchanged,
      isAIGenerated: result.isAIGenerated,
    });
  } catch (error) {
    return handleApiError(error, { method: 'POST', path: '/api/portfolio/switch-template' });
  }
}
