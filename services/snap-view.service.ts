/**
 * Snap View Generation Service
 *
 * Public entry point for recruiter Snap View generation.
 * Runs the shared snap-view agent (AI when available, algorithmic fallback).
 * API routes and UI keep calling this function — UX is unchanged.
 */

import { logger } from '@/lib/logger';
import { runSnapViewAgent } from '@/services/agents/snap-view';

import type { PublicProfile } from '@/types';
import type { SnapViewData } from '@/types/snap-view';

const snapLogger = logger.child({ source: 'snap-view-service' });

/**
 * Generate snap view data from a public profile.
 * Attempts AI generation via the snap-view agent; falls back to algorithmic.
 */
export async function generateSnapViewData(profile: PublicProfile): Promise<SnapViewData> {
  snapLogger.info('Generating snap view via agent', { handle: profile.handle });

  const { output, run } = await runSnapViewAgent(profile, {
    profileId: profile.id,
    meta: { handle: profile.handle },
  });

  snapLogger.info('Snap view agent completed', {
    handle: profile.handle,
    runId: run.id,
    version: run.version,
    isAIGenerated: output.isAIGenerated,
    status: run.status,
  });

  return output;
}
