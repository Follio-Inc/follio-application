import { spawn } from 'node:child_process';
import path from 'node:path';

import { getTestSuite } from './suites-catalog';
import type { TestRunResult } from './types';

export { TEST_SUITES, getTestSuite } from './suites-catalog';

const MAX_OUTPUT_CHARS = 24_000;

function trimOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n…(truncated)`;
}

/**
 * Runs a named Vitest suite in a child process.
 * Intended for local `next dev` only. Server-only module.
 */
export function runTestSuite(suiteId: string): Promise<TestRunResult> {
  const suite = getTestSuite(suiteId);
  if (!suite) {
    return Promise.resolve({
      suiteId,
      ok: false,
      exitCode: 1,
      durationMs: 0,
      stdout: '',
      stderr: `Unknown suite: ${suiteId}`,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
  }

  const startedAt = new Date();
  const startedMs = Date.now();
  const cwd = process.cwd();
  const vitestBin = path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs');

  const args = suite.id === 'all' ? ['run'] : ['run', ...suite.patterns];

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [vitestBin, ...args], {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        CI: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    const finish = (exitCode: number | null) => {
      const finishedAt = new Date();
      resolve({
        suiteId: suite.id,
        ok: exitCode === 0,
        exitCode,
        durationMs: Date.now() - startedMs,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      });
    };

    child.on('error', (error) => {
      stderr += `\n${error.message}`;
      finish(1);
    });

    child.on('close', (code) => {
      finish(code);
    });
  });
}
