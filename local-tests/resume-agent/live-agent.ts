/**
 * Entry point for the live Resume Agent demo.
 *
 * This file exists to run *before* anything constructs a Prisma client.
 *
 * The agent runtime imports `persist-run`, which imports `@/lib/db`, which
 * reads `DATABASE_URL` when the client is first used. `runAgent` writes one
 * `AgentRun` telemetry row at the end of every run. If `DATABASE_URL` points
 * at a hosted database — as it currently does in this repo's `.env` — that
 * write would land there, which this demo must not do.
 *
 * So the URL is pointed at a dead local address before the implementation is
 * imported. `persistAgentRun` catches its own failures and never fails the
 * run, so the only effect is a logged Prisma error and no telemetry row.
 * Everything the demo actually shows runs in memory and over OpenAI.
 *
 *   npx tsx local-tests/resume-agent/live-agent.ts --check
 *   npx tsx local-tests/resume-agent/live-agent.ts --live
 *   npx tsx local-tests/resume-agent/live-agent.ts --live --mode analyze
 */

import { readFileSync } from 'node:fs';

/** Unroutable by design: port 1 on loopback refuses immediately. */
const DEAD_LOCAL_DB = 'postgresql://unused:unused@127.0.0.1:1/unused?connect_timeout=1';

/**
 * Read `.env` directly rather than `process.env`: nothing has loaded it yet at
 * this point — Prisma's dotenv runs when the client is first constructed, and
 * that is exactly what this file is racing to get ahead of.
 */
function configuredDatabaseIsRemote(): boolean {
  try {
    const url = (readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.*)$/m)?.[1] ?? '')
      .trim()
      .replace(/^['"]|['"]$/g, '');
    return url.length > 0 && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  } catch {
    return false;
  }
}

const wasRemote = configuredDatabaseIsRemote();

// dotenv does not overwrite variables that are already set, so claiming these
// first is what keeps the hosted URL out of this process.
process.env.DATABASE_URL = DEAD_LOCAL_DB;
process.env.DIRECT_URL = DEAD_LOCAL_DB;

if (wasRemote) {
  console.log(
    '\n! DATABASE_URL in .env points at a hosted database. This demo has redirected\n' +
      '  it to a dead local address for this process only, so no telemetry row is\n' +
      '  written there. .env is untouched.'
  );
}

// Dynamic, so the env override above is already in place before the runtime —
// and therefore Prisma — is loaded. Not awaited at the top level: tsx compiles
// this project to CJS, where top-level await is unavailable.
export {};

void import('./live-agent-impl').catch((error: unknown) => {
  console.error(
    '\n✖ Could not start the demo:',
    error instanceof Error ? error.message : error,
    '\n'
  );
  process.exit(1);
});
