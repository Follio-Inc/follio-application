/**
 * Propose AI resume edits.
 *
 * Plans once (playbooks, and the job's requirements when tailoring; raw
 * keywords if they cannot be read), splits the resume into small batches
 * (summary, then each job entry), asks the model for rewrites in parallel,
 * and keeps only what groundEdits trusts. A batch that fails is reported by
 * name; the others still come back.
 */

import { executeAICall, isAIAvailable } from '@/lib/ai-client';
import { AppError, ErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { explainBrief, type ResumeEditBrief, type ResumeEditChange } from '@/lib/resume-edit/types';
import { readJobRequirements } from '@/services/ai/job-requirements/extract';
import type { StoredSkillProfile } from '@/services/ai/skills/types';

import { buildEditFacts, planBatches, type EditSourceProfile } from './facts';
import { groundEdits } from './ground';
import { planWriting } from './plan';
import { buildResumeEditUserPrompt, RESUME_EDIT_SYSTEM_PROMPT } from './prompt';

const log = logger.child({ source: 'resume-edit' });

export interface ResumeEditProposal {
  changes: ResumeEditChange[];
  droppedCount: number;
  failedSections: string[];
}

export async function proposeResumeEdits(
  profile: EditSourceProfile,
  brief: ResumeEditBrief,
  storedSkills: StoredSkillProfile | null = null
): Promise<ResumeEditProposal> {
  const problem = explainBrief(brief);
  if (problem) throw new AppError(problem, ErrorCode.VALIDATION_ERROR, 400);

  if (!isAIAvailable()) {
    throw new AppError('AI editing is unavailable right now.', ErrorCode.SERVICE_UNAVAILABLE, 503);
  }

  const facts = buildEditFacts(profile);
  const batches = planBatches(facts, brief.scope);
  if (batches.length === 0) {
    throw new AppError(
      'There is nothing to edit here yet. Add a summary or experience bullets first.',
      ErrorCode.VALIDATION_ERROR,
      400
    );
  }
  const requirements = brief.jobDescription
    ? await readJobRequirements(brief.jobDescription)
    : null;
  const plan = planWriting(facts, brief, requirements, storedSkills);

  const settled = await Promise.allSettled(
    batches.map(async (batch) => {
      const result = await executeAICall<unknown>({
        stage: 'resumeEdit',
        taskType: 'strategy',
        temperature: 0.3,
        systemPrompt: RESUME_EDIT_SYSTEM_PROMPT,
        userPrompt: buildResumeEditUserPrompt(facts, batch, brief, plan),
        jsonMode: true,
      });
      return groundEdits(result.data, {
        facts,
        editableRefs: batch.refs,
        jobDescription: brief.jobDescription,
        instructions: brief.instructions,
      });
    })
  );

  const changes: ResumeEditChange[] = [];
  const failedSections: string[] = [];
  let droppedCount = 0;
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      changes.push(...outcome.value.changes);
      droppedCount += outcome.value.dropped;
    } else {
      failedSections.push(batches[index]?.section ?? 'A section');
      log.error('Resume edit batch failed', outcome.reason);
    }
  });

  if (failedSections.length === batches.length) {
    throw new AppError(
      'Suggestions failed. Try again in a moment.',
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      502
    );
  }

  log.info('Resume edits grounded', {
    batches: batches.length,
    changes: changes.length,
    dropped: droppedCount,
    failed: failedSections.length,
  });
  return { changes, droppedCount, failedSections };
}
