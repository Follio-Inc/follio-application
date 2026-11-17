/**
 * Live Resume Agent demo — real runtime, real model, local files.
 *
 * This runs the production `runAgent` tool-calling loop against a real OpenAI
 * model. The model chooses which tools to call and in what order; nothing in
 * this file scripts a sequence or writes a recommendation.
 *
 * Production, unmodified:
 *   - `runAgent` and its whole tool loop, budget and progress reporting
 *   - the agent instructions, taken straight off `resumeAgent` /
 *     `resumeProposeAgent`
 *   - `resumeAgentResultSchema` and `submit_resume_result`
 *   - `analyze_job_description` (it needs no database)
 *   - `pinnedToSelectedResume`
 *   - the scoring, the line view and the grounding, called inside the adapters
 *
 * Test-only:
 *   - four data adapters in `local-tools.ts` (file instead of Prisma)
 *   - the identifiers in the agent context
 *   - a recording wrapper around every tool, for the transcript
 *
 *   npx tsx local-tests/resume-agent/live-agent.ts --check          (no API call)
 *   npx tsx local-tests/resume-agent/live-agent.ts --live
 *   npx tsx local-tests/resume-agent/live-agent.ts --live --mode analyze
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAgent } from '@/lib/agents/runtime';
import { analyzeJobDescriptionTool } from '@/services/agents/resume/jd-tools';
import { pinnedToSelectedResume } from '@/services/agents/resume/pinning';
import {
  RESUME_AGENT_BUDGET,
  RESUME_PROPOSE_BUDGET,
  resumeAgent,
  resumeAgentResultSchema,
  resumeProposeAgent,
  SELECTED_RESUME_META_KEY,
  submitResumeResultTool,
  type ResumeAgentMode,
  type ResumeAgentOutput,
} from '@/services/agents/resume/resume.agent';

import { LOCAL_RESUME_ID, localResumeTools, type LocalStore } from './local-tools';

import type { EditSourceProfile } from '@/services/ai/resume-edit/facts';
import type {
  AgentContext,
  AgentProgressEvent,
  AgentTool,
  ToolAgentDefinition,
} from '@/types/agents';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Documented in lib/ai-client.ts: agentTurn → strategy → HEAVY_MODEL. */
const EXPECTED_MODEL = 'gpt-4o';

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

interface ToolCallRecord {
  order: number;
  tool: string;
  input: unknown;
  outcome: 'ok' | 'error';
  output?: unknown;
  error?: string;
  durationMs: number;
}

const transcript: ToolCallRecord[] = [];
const progress: AgentProgressEvent[] = [];

/** Test-only instrumentation. Delegates to the real tool and changes nothing. */
function record(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (input, ctx) => {
      const order = transcript.length + 1;
      const started = Date.now();
      try {
        const output = await tool.execute(input, ctx);
        transcript.push({
          order,
          tool: tool.name,
          input,
          outcome: 'ok',
          output,
          durationMs: Date.now() - started,
        });
        return output;
      } catch (error) {
        transcript.push({
          order,
          tool: tool.name,
          input,
          outcome: 'error',
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - started,
        });
        throw error;
      }
    },
  };
}

// ---------------------------------------------------------------------------

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function loadFixtures(): { profile: EditSourceProfile; jobDescription: string } {
  const raw = JSON.parse(
    readFileSync(resolve(HERE, 'sample-resume.json'), 'utf8')
  ) as EditSourceProfile;
  const jobDescription = readFileSync(resolve(HERE, 'sample-job-description.txt'), 'utf8').trim();
  if (!raw.workExperiences?.length) fail('sample-resume.json has no experience entries.');
  if (jobDescription.length < 80) fail('sample-job-description.txt is too short.');
  return { profile: raw, jobDescription };
}

/**
 * The agent the model actually drives.
 *
 * Instructions, result tool, output schema and user message all come off the
 * production definition, so the prompt under test is the shipped prompt. Only
 * the tool list differs, and only in where the data comes from.
 */
function buildLocalAgent(
  mode: ResumeAgentMode,
  store: LocalStore
): ToolAgentDefinition<
  { resumeId: string; jobDescription: string; instruction?: string },
  ResumeAgentOutput
> {
  const production = mode === 'propose' ? resumeProposeAgent : resumeAgent;
  const [getResume, scoreResume, readLines, proposeEdits] = localResumeTools(store);

  const tools: AgentTool[] = [
    record(pinnedToSelectedResume(getResume)),
    record(analyzeJobDescriptionTool),
    record(pinnedToSelectedResume(scoreResume)),
  ];
  if (mode === 'propose') {
    tools.push(
      record(pinnedToSelectedResume(readLines)),
      record(pinnedToSelectedResume(proposeEdits))
    );
  }
  tools.push(record(submitResumeResultTool));

  return {
    kind: 'tool',
    id: 'resume-agent',
    version: `${production.version}-local`,
    taskType: production.taskType,
    instructions: production.instructions,
    buildUserMessage: production.buildUserMessage,
    tools,
    resultToolName: production.resultToolName,
    outputSchema: resumeAgentResultSchema,
  };
}

// ---------------------------------------------------------------------------

function preflight(mode: ResumeAgentMode, store: LocalStore): void {
  const agent = buildLocalAgent(mode, store);
  const names = agent.tools.map((tool) => tool.name);

  console.log('\nResume Agent — live demo preflight');
  console.log('='.repeat(64));
  console.log(`mode              : ${mode}`);
  console.log(`agent id/version  : ${agent.id} / ${agent.version}`);
  console.log(`model it will use : ${EXPECTED_MODEL} (agentTurn → strategy → HEAVY_MODEL)`);
  console.log(`result tool       : ${agent.resultToolName}`);
  console.log(`tools offered     : ${names.join(', ')}`);
  console.log(
    `budget            : ${JSON.stringify(mode === 'propose' ? RESUME_PROPOSE_BUDGET : RESUME_AGENT_BUDGET)}`
  );
  console.log(
    `instructions      : ${String(agent.instructions).length} chars, taken from ` +
      `${mode === 'propose' ? 'resumeProposeAgent' : 'resumeAgent'}`
  );

  if (!names.includes(agent.resultToolName)) fail('The result tool is not registered.');
  for (const forbidden of ['apply', 'revert', 'delete', 'publish']) {
    if (names.some((name) => name.includes(forbidden))) {
      fail(`A tool named like "${forbidden}" is registered. The demo must not be able to apply.`);
    }
  }

  // Proof the bootstrap's override survived dotenv, which runs when Prisma is
  // first constructed. If this ever shows a hosted host, stop.
  const dbHost = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '(unset)';
  console.log(`database target   : ${dbHost}  (telemetry only, expected to fail)`);

  const key = process.env.OPENAI_API_KEY;
  console.log(`\nOPENAI_API_KEY    : ${key ? `present (${key.length} chars)` : 'MISSING'}`);
  if (!key) {
    console.log('  A live run needs this set. No key, no run — there is no mock fallback.');
  } else if (key.length < 40) {
    console.log('  ! This looks too short for a real OpenAI key. A live run would fail at the');
    console.log('    first model call. That failure is reported, never swallowed.');
  }

  console.log('\nNo model call was made. Add --live to run for real.\n');
}

// ---------------------------------------------------------------------------

async function live(
  mode: ResumeAgentMode,
  store: LocalStore,
  jobDescription: string
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    fail(
      'OPENAI_API_KEY is not set. This demo has no mocked model fallback — ' +
        'set a real key or run with --check instead.'
    );
  }

  const agent = buildLocalAgent(mode, store);
  const ctx: AgentContext = {
    // Test-only identifiers. The local tools never query by them; they exist
    // because the production analyze tool refuses an unauthenticated run.
    userId: 'local-demo-user',
    clerkId: 'local-demo-clerk',
    requestId: `local-${Date.now()}`,
    meta: { [SELECTED_RESUME_META_KEY]: LOCAL_RESUME_ID },
    budget: mode === 'propose' ? RESUME_PROPOSE_BUDGET : RESUME_AGENT_BUDGET,
    onProgress: (event) => {
      progress.push(event);
      if (event.status === 'running' && event.stepId.startsWith('turn-')) {
        process.stdout.write(`\n  ${event.message}`);
      } else if (event.status === 'complete') {
        process.stdout.write(` → ${event.stepId}`);
      }
    },
  };

  console.log(`\nRunning the real agent loop (${mode}) against ${EXPECTED_MODEL}…`);

  const started = Date.now();
  const { output, run } = await runAgent(
    agent,
    {
      resumeId: LOCAL_RESUME_ID,
      jobDescription,
      instruction:
        mode === 'propose'
          ? 'Tailor my resume to this posting.'
          : 'How does my resume fit this posting?',
    },
    ctx
  );
  const elapsed = Date.now() - started;

  console.log(`\n\nFinished in ${(elapsed / 1000).toFixed(1)}s · status ${run.status}`);
  writeOutputs(mode, output, run, store, elapsed);
}

function writeOutputs(
  mode: ResumeAgentMode,
  output: ResumeAgentOutput,
  run: {
    id: string;
    version: string;
    status: string;
    stepMetas: unknown[];
    totalTokensUsed: { input: number; output: number };
  },
  store: LocalStore,
  elapsedMs: number
): void {
  const outDir = resolve(HERE, 'output');
  mkdirSync(outDir, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFileSync(resolve(outDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');

  const modelTurns = transcript.length;

  write('live-agent-transcript.json', {
    model: EXPECTED_MODEL,
    mode,
    runId: run.id,
    version: run.version,
    status: run.status,
    elapsedMs,
    tokensUsed: run.totalTokensUsed,
    toolCallOrder: transcript.map((call) => call.tool),
    toolCalls: transcript,
    progress,
    stepMetas: run.stepMetas,
  });

  write('live-agent-analysis.json', {
    model: EXPECTED_MODEL,
    mode,
    schemaValidated: resumeAgentResultSchema.safeParse(output).success,
    analysis: output,
  });

  write('live-agent-proposals.json', {
    mode,
    proposedSessionId: output.proposedSessionId,
    proposalMessage: output.proposalMessage,
    proposedChanges: output.proposedChanges,
    groundingDecisions: transcript
      .filter((call) => call.tool === 'propose_resume_edits')
      .map((call) => ({
        submittedByModel: call.input,
        outcome: call.outcome,
        error: call.error ?? null,
        result: call.output ?? null,
      })),
    sessionsHeldInMemory: store.sessions.map((session) => ({
      id: session.id,
      changes: session.changes.length,
      droppedCount: session.droppedCount,
    })),
  });

  const lines = [
    '# Resume Agent — live run',
    '',
    `- **Model**: \`${EXPECTED_MODEL}\` (temperature 0.4, chosen by \`resolveModel('strategy')\`)`,
    `- **Mode**: ${mode}`,
    `- **Run**: \`${run.id}\` · version \`${run.version}\` · status **${run.status}**`,
    `- **Time**: ${(elapsedMs / 1000).toFixed(1)}s · tokens in ${run.totalTokensUsed.input}, out ${run.totalTokensUsed.output}`,
    `- **Tool calls**: ${modelTurns}`,
    '',
    '## What is production and what is not',
    '',
    '| Piece | Source |',
    '| --- | --- |',
    '| Tool-calling loop, budget, progress | production `runAgent` |',
    '| Instructions | production `' +
      (mode === 'propose' ? 'resumeProposeAgent' : 'resumeAgent') +
      '.instructions` |',
    '| Result contract | production `resumeAgentResultSchema` + `submit_resume_result` |',
    '| `analyze_job_description` | production tool, unmodified |',
    '| Resume pinning | production `pinnedToSelectedResume` |',
    '| Scoring / line view / grounding | production functions, called by the adapters |',
    '| `get_resume`, `score_resume_against_jd`, `read_resume_lines`, `propose_resume_edits` | **test-only adapters** reading `sample-resume.json` |',
    '| Edit session storage | **test-only**, held in memory |',
    '',
    '## Tools the model chose to call, in order',
    '',
    ...transcript.map(
      (call) =>
        `${call.order}. \`${call.tool}\` — ${call.outcome}${call.error ? `: ${call.error}` : ''} (${call.durationMs}ms)`
    ),
    '',
    '## Final analysis',
    '',
    `**Summary.** ${output.summary}`,
    '',
    `**Scores.** requirement match ${output.scores.requirementMatch ?? '—'} · keyword coverage ${output.scores.keywordCoverage ?? '—'} · writing ${output.scores.writing ?? '—'}`,
    '',
    '**Supported by the resume:**',
    ...(output.strengths.length
      ? output.strengths.map((s) => `- ${s.term} (${s.importance}) — ${s.match}/${s.evidence}`)
      : ['- none']),
    '',
    '**Missing:**',
    ...(output.missingRequirements.length
      ? output.missingRequirements.map((g) => `- ${g.term} (${g.importance})`)
      : ['- none']),
    '',
    '**Recommendations:**',
    ...(output.recommendations.length
      ? output.recommendations.map((r) => `- **${r.requirement}** — ${r.suggestion}`)
      : ['- none']),
    '',
    '**Limitations reported by the agent:**',
    ...(output.limitations.length ? output.limitations.map((l) => `- ${l}`) : ['- none']),
    '',
    '## Proposals and grounding',
    '',
    output.proposedSessionId
      ? `Session \`${output.proposedSessionId}\` holds ${output.proposedChanges.length} change(s), pending approval. ${output.proposalMessage ?? ''}`
      : mode === 'propose'
        ? `No suggestion set was saved. ${output.proposalMessage ?? ''}`
        : 'Analyze mode cannot propose. No session exists.',
    '',
    ...output.proposedChanges.flatMap((change) => [
      `### ${change.where} (\`${change.id}\`) — ${change.status}`,
      '',
      `- **before**: ${change.before}`,
      `- **after**: ${change.after}`,
      `- **why**: ${change.reason}`,
      ...(change.needsInput ? [`- **needs input**: ${change.needsInput}`] : []),
      '',
    ]),
    '## Limitations',
    '',
    '- Four data adapters stand in for Prisma-backed tools. The logic inside them is production; the storage is not.',
    '- No ownership check is exercised: there is one fixture resume and no second user to isolate from.',
    '- No API route, Clerk session, or rate limiting is involved. Those are covered by `__tests__/agents/`.',
    '- The edit session is in memory, so apply/revert cannot be demonstrated here — by design, the agent has no apply tool in either mode.',
    '- `persistAgentRun` still tries to write an `AgentRun` row and fails without a database. It catches its own error, so the run is unaffected; a Prisma error in the log is expected.',
    '',
  ];

  writeFileSync(resolve(outDir, 'live-agent-report.md'), `${lines.join('\n')}\n`, 'utf8');

  console.log(`\nWrote 4 files to ${outDir}:`);
  console.log('  live-agent-transcript.json');
  console.log('  live-agent-analysis.json');
  console.log('  live-agent-proposals.json');
  console.log('  live-agent-report.md\n');
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const modeIndex = argv.indexOf('--mode');
  const mode: ResumeAgentMode =
    modeIndex > -1 && argv[modeIndex + 1] === 'analyze' ? 'analyze' : 'propose';

  const { profile, jobDescription } = loadFixtures();
  const store: LocalStore = { profile, sessions: [] };

  if (!args.has('--live')) {
    preflight(mode, store);
    return;
  }
  await live(mode, store, jobDescription);
}

main().catch((error: unknown) => {
  console.error('\n✖ Run failed:', error instanceof Error ? error.message : error);
  console.error('  No mocked result was substituted.\n');
  process.exit(1);
});
