/**
 * Recording a run's timings against the local baseline
 * (PLATFORM_TODO item 27).
 *
 * Server-only. One place where the lab routes fold their observations in, so
 * the store path, the commit probe and the "writing is off under test"
 * decision live once rather than in each caller.
 */

import { readCommit } from '../tests/history';
import {
  applyObservations,
  localPerfBaselineFile,
  readPerfBaseline,
  writePerfBaseline,
  type PerfObservation,
} from './baseline';
import type { PerfFlag } from './types';

export type RecordOptions = {
  /** Store path. Defaults to the gitignored local one. */
  file?: string;
  /** Commit for the samples. Defaults to the repository's HEAD. */
  commit?: string | null;
  /**
   * Whether to persist. Defaults to off under `NODE_ENV=test`, the same
   * decision item 16 made: the repository's own suite must not write into an
   * operator's real baseline while asserting things about it.
   */
  write?: boolean;
  now?: () => string;
};

/**
 * HEAD, or null.
 *
 * Item 16's probe, reused rather than shelling out again. A run with no
 * commit records none, which is what item 16 already does.
 */
function readHeadCommit(): string | null {
  try {
    return readCommit().sha;
  } catch {
    return null;
  }
}

/**
 * Classifies observations and, unless writing is off, persists the window.
 *
 * Never throws: a baseline that cannot be read or written must not take a lab
 * run down with it. A failure here costs the flags, not the run, and the
 * caller gets an empty list rather than an exception.
 */
export function recordObservations(
  observations: PerfObservation[],
  options: RecordOptions = {}
): PerfFlag[] {
  const write = options.write ?? process.env.NODE_ENV !== 'test';
  const file = options.file ?? localPerfBaselineFile();
  const now = (options.now ?? (() => new Date().toISOString()))();

  try {
    const prior = readPerfBaseline(file);
    const commit = options.commit ?? readHeadCommit();
    const { flags, baseline } = applyObservations(prior, observations, now, commit);

    if (write) writePerfBaseline(file, baseline);

    return flags;
  } catch {
    return [];
  }
}
