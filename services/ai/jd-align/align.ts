/**
 * Align a resume to a job description.
 *
 * The model proposes requirements and the phrases that support them.
 * groundAlignment is what the screen trusts: a mark exists only when the
 * quoted words are actually in the text, and a green mark exists only when
 * those words support the requirement. Keyword coverage (evaluate) and the
 * recruiter read (judge) come from the shared modules the AI edit panel uses.
 */

import { executeAICall, isAIAvailable } from '@/lib/ai-client';
import { AppError, ErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { matchKeywords } from '@/services/ai/evaluate/keywords';
import { judgeJobFit } from '@/services/ai/judge';

import { groundAlignment } from './ground';
import { explainAlignInput } from './limits';
import { buildJdAlignUserPrompt, JD_ALIGN_SYSTEM_PROMPT } from './prompt';
import type { JdAlignResult } from './types';

const log = logger.child({ source: 'jd-align' });

export async function alignResumeToJob(input: {
  resumeText: string;
  jobDescription: string;
}): Promise<JdAlignResult> {
  const problem = explainAlignInput(input.resumeText, input.jobDescription);
  if (problem) {
    throw new AppError(problem, ErrorCode.VALIDATION_ERROR, 400);
  }

  if (!isAIAvailable()) {
    throw new AppError('Matching is unavailable right now.', ErrorCode.SERVICE_UNAVAILABLE, 503);
  }

  const expertPromise = judgeJobFit(input.resumeText, input.jobDescription);

  let model: unknown;
  try {
    const result = await executeAICall<unknown>({
      stage: 'jdAlign',
      taskType: 'strategy',
      temperature: 0.15,
      systemPrompt: JD_ALIGN_SYSTEM_PROMPT,
      userPrompt: buildJdAlignUserPrompt(input.resumeText, input.jobDescription),
      jsonMode: true,
    });
    model = result.data;
  } catch (error) {
    log.error('Resume to job alignment failed', error);
    throw new AppError(
      'Matching failed. Try again in a moment.',
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      502
    );
  }

  const grounded = groundAlignment(model, input.resumeText, input.jobDescription);
  const keywords = matchKeywords(input.resumeText, input.jobDescription);
  const expert = await expertPromise;
  log.info('Resume to job alignment grounded', {
    aspects: grounded.aspects.length,
    matched: grounded.matchedCount,
    missing: grounded.missingCount,
    jobCoverage: keywords.jobCoverage,
    expert: expert?.score ?? null,
  });
  return { ...grounded, keywords, expert };
}
