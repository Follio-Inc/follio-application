/**
 * Phase 3A — the rewrite loop, orchestrated end to end.
 *
 * Four real agent definitions run on the real runtime, through the real
 * `agentAsTool`, with the real tools and the real deterministic guards. Only
 * the LLM turn and the database are replaced. No specialist is stubbed.
 *
 * That matters because the claims being tested here are exactly the ones a
 * chain of prompts can imitate: that rewriting happens only when it was asked
 * for, that verification really runs before anything is called verified, that
 * a revision carries the verifier's own words back to the rewriter, that the
 * loop stops on a counter rather than on the model's willingness to stop, and
 * that a verifier which fails cannot produce an approved proposal.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type OpenAI from 'openai';

// ── LLM seam ────────────────────────────────────────────────────────────────

interface ScriptedTurn {
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
}

const ORCHESTRATOR = 'orchestrator';
const EVALUATION = 'evaluation';
const MATCHING = 'matching';
const REWRITE = 'rewrite';
const VERIFICATION = 'verification';

const MARKERS: Array<[string, string]> = [
  [ORCHESTRATOR, 'You are the Follio Resume Orchestrator'],
  [EVALUATION, 'You are the Follio Resume Evaluation Agent'],
  [MATCHING, 'You are the Follio JD / Role Matching Agent'],
  [REWRITE, 'You are the Follio Resume Rewrite Agent'],
  [VERIFICATION, 'You are the Follio Resume Verification Agent'],
];

let scripts: Record<string, ScriptedTurn[]> = {};
let turnLog: Array<{ agent: string; messages: OpenAI.Chat.ChatCompletionMessageParam[] }> = [];
let onTurn: ((agent: string) => void) | undefined;

function agentOf(messages: OpenAI.Chat.ChatCompletionMessageParam[]): string {
  const system = String(messages[0]?.content ?? '');
  return MARKERS.find(([, marker]) => system.includes(marker))?.[0] ?? 'UNKNOWN';
}

const executeChatCompletionMock = vi.fn(
  async (options: { messages: OpenAI.Chat.ChatCompletionMessageParam[] }) => {
    const agent = agentOf(options.messages);
    turnLog.push({ agent, messages: structuredClone(options.messages) });
    onTurn?.(agent);

    const turn = scripts[agent]?.shift();
    if (!turn) throw new Error(`Scripted LLM ran out of turns for "${agent}"`);

    return {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: turn.toolCalls.length > 0 ? turn.toolCalls : undefined,
      } as OpenAI.Chat.ChatCompletionMessage,
      meta: {
        model: 'gpt-4o',
        tokensUsed: { input: 100, output: 40 },
        durationMs: 1,
        timestamp: new Date().toISOString(),
      },
    };
  }
);

vi.mock('@/lib/ai-client', () => ({
  executeChatCompletion: (options: never) => executeChatCompletionMock(options),
  isAIAvailable: () => true,
}));

// ── Database seam ───────────────────────────────────────────────────────────

const profileFindFirst = vi.fn();
const agentRunUpsert = vi.fn();

const writeSpies = {
  profileUpdate: vi.fn(),
  profileUpdateMany: vi.fn(),
  workExperienceUpdate: vi.fn(),
  workExperienceUpdateMany: vi.fn(),
  projectUpdate: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  db: {
    profile: {
      findFirst: (...args: unknown[]) => profileFindFirst(...args),
      update: (...args: unknown[]) => writeSpies.profileUpdate(...args),
      updateMany: (...args: unknown[]) => writeSpies.profileUpdateMany(...args),
    },
    workExperience: {
      update: (...args: unknown[]) => writeSpies.workExperienceUpdate(...args),
      updateMany: (...args: unknown[]) => writeSpies.workExperienceUpdateMany(...args),
    },
    project: { update: (...args: unknown[]) => writeSpies.projectUpdate(...args) },
    agentRun: { upsert: (...args: unknown[]) => agentRunUpsert(...args) },
  },
}));

import { runResumeOrchestrator } from '@/services/agents/resume/orchestrator.agent';

// ============================================================================
// FIXTURES
// ============================================================================

const RESUME_ID = 'resume_abc123';
const USER_ID = 'user_internal_1';

const WEAK_BULLET = 'Responsible for various backend services and worked on the platform';
const METRIC_BULLET = 'Migrated 12 services onto Kubernetes';
const WEAK_REF = 'experience:exp1:bullets:0';
const METRIC_REF = 'experience:exp1:bullets:1';
const WEAK_PROPOSAL_ID = 'prop_experience_exp1_bullets_0';
const METRIC_PROPOSAL_ID = 'prop_experience_exp1_bullets_1';

const BACKEND_JD = `Senior Backend Engineer
We need an engineer fluent in TypeScript who has run services on Kubernetes and
Docker in production. Terraform and GraphQL experience is required.`;

function dbProfile() {
  return {
    id: RESUME_ID,
    handle: 'ada-lovelace',
    resumeTitle: 'Backend Engineer',
    firstName: 'Ada',
    middleName: null,
    lastName: 'Lovelace',
    headline: 'Backend Engineer',
    summary: 'Builds APIs and data platforms.',
    location: 'San Francisco, CA',
    contactInfo: { email: 'ada@example.com', phone: null, website: null },
    workExperiences: [
      {
        id: 'exp1',
        company: 'Acme',
        role: 'Backend Engineer',
        location: 'Remote',
        startDate: new Date('2021-01-01'),
        endDate: null,
        isCurrent: true,
        bullets: [WEAK_BULLET, METRIC_BULLET],
        isVisible: true,
      },
    ],
    educations: [
      {
        id: 'edu1',
        institution: 'MIT',
        degree: 'BS',
        fieldOfStudy: 'Computer Science',
        startDate: new Date('2015-09-01'),
        endDate: new Date('2019-06-01'),
        isCurrent: false,
        isVisible: true,
      },
    ],
    skills: [
      { id: 's1', name: 'TypeScript', isVisible: true },
      { id: 's2', name: 'PostgreSQL', isVisible: true },
    ],
    skillGroups: [],
    projects: [
      {
        id: 'proj1',
        title: 'Ops Platform',
        description: 'Internal deploy tooling built with Docker.',
        url: null,
        techStack: ['TypeScript'],
        highlights: ['Cut deploy time in half'],
        isVisible: true,
      },
    ],
  };
}

let callCounter = 0;
function call(
  name: string,
  args: Record<string, unknown> = {}
): OpenAI.Chat.ChatCompletionMessageToolCall {
  callCounter += 1;
  return {
    id: `call_${callCounter}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  } as OpenAI.Chat.ChatCompletionMessageToolCall;
}

// ── Specialist scripts (factories: the mock drains them with shift()) ───────

function evaluationScript(): ScriptedTurn[] {
  return [
    { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
    { toolCalls: [call('assess_resume_quality', { resumeId: RESUME_ID })] },
    {
      toolCalls: [
        call('submit_evaluation', {
          assessment: 'Bullets lean on filler and rarely state numbers.',
          recommendations: ['Replace "responsible for" with an action verb.'],
        }),
      ],
    },
  ];
}

function jdMatchScript(): ScriptedTurn[] {
  return [
    { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
    { toolCalls: [call('score_against_jd', { resumeId: RESUME_ID })] },
    {
      toolCalls: [
        call('submit_match_findings', {
          assessment: 'Partial overlap with the posting.',
          recommendations: ['Name Kubernetes under skills.'],
        }),
      ],
    },
  ];
}

const GOOD_REWRITE = 'Built and maintained the backend services behind the platform';
/** Drops the "12" the original carried, so the guards ask for a revision. */
const LOSSY_REWRITE = 'Migrated production services onto Kubernetes';
const FIXED_REWRITE = 'Migrated 12 production services onto Kubernetes';

function rewriteScript(
  proposals: Array<Record<string, unknown>>,
  options: { readFeedback?: boolean } = {}
): ScriptedTurn[] {
  return [
    { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
    { toolCalls: [call('list_rewrite_targets', { resumeId: RESUME_ID })] },
    { toolCalls: [call('get_analysis_findings', { resumeId: RESUME_ID })] },
    ...(options.readFeedback ? [{ toolCalls: [call('get_verification_feedback', {})] }] : []),
    ...proposals.map((proposal) => ({
      toolCalls: [call('propose_rewrite', { resumeId: RESUME_ID, ...proposal })],
    })),
    {
      toolCalls: [call('submit_rewrite_proposals', { rationale: 'Targeted the weakest bullets.' })],
    },
  ];
}

const goodProposal = {
  targetRef: WEAK_REF,
  originalText: WEAK_BULLET,
  proposedText: GOOD_REWRITE,
  explanation: 'Replaces filler with a concrete action verb.',
};

const lossyProposal = {
  targetRef: METRIC_REF,
  originalText: METRIC_BULLET,
  proposedText: LOSSY_REWRITE,
  explanation: 'Tighter phrasing.',
};

const fixedProposal = {
  targetRef: METRIC_REF,
  originalText: METRIC_BULLET,
  proposedText: FIXED_REWRITE,
  explanation: 'Tighter phrasing, with the figure kept.',
};

function verificationScript(verdicts: Array<Record<string, unknown>>): ScriptedTurn[] {
  return [
    { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
    { toolCalls: [call('get_proposals_to_verify', {})] },
    { toolCalls: [call('run_deterministic_checks', { resumeId: RESUME_ID })] },
    {
      toolCalls: [call('submit_verification', { summary: 'Reviewed the batch.', verdicts })],
    },
  ];
}

/**
 * A verifier that did its job. The claim comparison is not decoration: a
 * verdict without one is treated as unexamined and cannot be an approval.
 */
const approve = (proposalId: string) => ({
  proposalId,
  status: 'approved',
  reason: 'Preserves every fact in the original and claims nothing new.',
  claimAnalysis: [
    {
      claim: 'Maintained backend services on the platform.',
      classification: 'faithful_paraphrase',
      evidence: WEAK_BULLET,
    },
  ],
  supportingEvidence: [WEAK_BULLET],
});

const reportTurn = () => ({
  toolCalls: [
    call('submit_orchestrated_report', {
      summary: 'Evaluated and proposed edits.',
      recommendations: ['Replace filler openings.'],
    }),
  ],
});

// ── Inspection helpers ──────────────────────────────────────────────────────

function executedToolsByAgent(): Record<string, string[]> {
  const byAgent: Record<string, string[]> = {};
  for (const args of agentRunUpsert.mock.calls) {
    const create = (args[0] as { create?: Record<string, unknown> }).create;
    if (!create) continue;
    const steps = (create.stepMetas as Array<{ kind: string; stepId: string }>) ?? [];
    byAgent[String(create.agentId)] = steps
      .filter((step) => step.kind === 'tool')
      .map((step) => step.stepId.replace(/^tool:/, ''));
  }
  return byAgent;
}

/** Every persisted run row, in the order they were written. */
function runRows(): Array<Record<string, unknown>> {
  return agentRunUpsert.mock.calls
    .map((args) => (args[0] as { create?: Record<string, unknown> }).create)
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function agentsThatRan(): string[] {
  return [...new Set(turnLog.map((turn) => turn.agent))];
}

/**
 * LLM turns taken by one agent across the whole execution, not runs. A run's
 * turn count is fixed by its script, so this counts runs exactly: asserting
 * on it catches a specialist that ran a different number of times *or* took a
 * different path through its own tools.
 */
function turnsOf(agent: string): number {
  return turnLog.filter((turn) => turn.agent === agent).length;
}

function toolResults(agent: string): string[] {
  const seen = new Set<string>();
  for (const turn of turnLog) {
    if (turn.agent !== agent) continue;
    for (const message of turn.messages) {
      if (message.role === 'tool' && typeof message.content === 'string') {
        seen.add(message.content);
      }
    }
  }
  return [...seen];
}

function expectNoResumeWrites(): void {
  for (const [name, spy] of Object.entries(writeSpies)) {
    expect(spy, `${name} must never be called`).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  scripts = {};
  turnLog = [];
  onTurn = undefined;
  callCounter = 0;
  profileFindFirst.mockResolvedValue(dbProfile());
});

// ============================================================================

describe('a rewrite request runs the whole loop', () => {
  beforeEach(() => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', { focus: 'bullet substance' })] },
        { toolCalls: [call('delegate_rewrite', { focus: 'the filler bullet' })] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal]),
      [VERIFICATION]: verificationScript([approve(WEAK_PROPOSAL_ID)]),
    };
  });

  it('delegates to all four specialists and verifies before reporting', async () => {
    const { output, run } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    expect(run.status).toBe('succeeded');
    expect(agentsThatRan().sort()).toEqual(
      [EVALUATION, ORCHESTRATOR, REWRITE, VERIFICATION].sort()
    );
    expect(output.agentsUsed).toEqual([
      'resume-evaluation',
      'resume-rewrite',
      'resume-verification',
    ]);
    expect(output.rewriteRequested).toBe(true);
    expectNoResumeWrites();
  });

  it('each child agent executes its own tools in its own run', async () => {
    await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    const tools = executedToolsByAgent();

    expect(tools['resume-orchestrator']).toEqual([
      'delegate_evaluation',
      'delegate_rewrite',
      'delegate_verification',
      'submit_orchestrated_report',
    ]);
    expect(tools['resume-rewrite']).toEqual([
      'get_resume',
      'list_rewrite_targets',
      'get_analysis_findings',
      'propose_rewrite',
      'submit_rewrite_proposals',
    ]);
    expect(tools['resume-verification']).toEqual([
      'get_resume',
      'get_proposals_to_verify',
      'run_deterministic_checks',
      'submit_verification',
    ]);
    // The orchestrator analysed nothing itself.
    expect(tools['resume-orchestrator']).not.toContain('propose_rewrite');
  });

  it('returns the proposal with its verdict attached, copied from the verifier', async () => {
    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    const rewrite = output.rewrite!;
    expect(rewrite.status).toBe('complete');
    expect(rewrite.proposals).toHaveLength(1);

    const [proposal] = rewrite.proposals;
    expect(proposal.targetRef).toBe(WEAK_REF);
    expect(proposal.originalText).toBe(WEAK_BULLET);
    expect(proposal.proposedText).toBe(GOOD_REWRITE);
    expect(proposal.verified).toBe(true);
    expect(proposal.verification!.status).toBe('approved');
    expect(rewrite.verifiedCount).toBe(1);
    expect(rewrite.revisionAttempts).toBe(0);
  });

  it('correlates every specialist run to the orchestrator run', async () => {
    const { run } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    const rows = runRows();
    const byAgent = Object.fromEntries(rows.map((row) => [String(row.agentId), row]));

    expect(byAgent['resume-orchestrator'].parentRunId).toBeNull();
    expect(byAgent['resume-orchestrator'].rootRunId).toBe(run.id);

    for (const child of ['resume-evaluation', 'resume-rewrite', 'resume-verification']) {
      expect(byAgent[child].parentRunId).toBe(run.id);
      expect(byAgent[child].rootRunId).toBe(run.id);
      expect(byAgent[child].userId).toBe(USER_ID);
    }
  });

  it('keeps every resume read scoped to the authenticated user', async () => {
    await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    expect(profileFindFirst).toHaveBeenCalled();
    for (const args of profileFindFirst.mock.calls) {
      const query = args[0] as { where: Record<string, unknown> };
      expect(query.where).toMatchObject({ id: RESUME_ID, userId: USER_ID, isArchived: false });
    }
  });
});

// ============================================================================

describe('an unsupported outcome never reaches the report as verified', () => {
  it('refuses the outcome clause and reports the factual rewrite instead', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([
        // The live failure: a true sentence with a benefit stapled on.
        { ...goodProposal, proposedText: `${GOOD_REWRITE}, enhancing data retrieval speed` },
        // Refused, so the agent proposes what the resume supports.
        goodProposal,
      ]),
      [VERIFICATION]: verificationScript([approve(WEAK_PROPOSAL_ID)]),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    const rewrite = output.rewrite!;
    expect(rewrite.proposals).toHaveLength(1);
    expect(rewrite.proposals[0].proposedText).toBe(GOOD_REWRITE);
    expect(JSON.stringify(rewrite)).not.toMatch(/retrieval speed/i);
    expect(rewrite.verifiedCount).toBe(1);

    expect(toolResults(REWRITE).join(' ')).toMatch(/unsupported-outcome/);
    expectNoResumeWrites();
  });

  it('keeps an outcome claim unverified when one reaches the verifier anyway', async () => {
    // Defence in depth: a proposal that arrived by some other route than
    // `propose_rewrite` still cannot be approved, whatever the model says.
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal]),
      [VERIFICATION]: verificationScript([
        {
          proposalId: WEAK_PROPOSAL_ID,
          status: 'approved',
          reason: 'It is plausible that this made things faster.',
          claimAnalysis: [
            {
              claim: 'The platform got faster.',
              classification: 'reasonable_inference',
            },
          ],
        },
      ]),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    const rewrite = output.rewrite!;
    expect(rewrite.verifiedCount).toBe(0);
    expect(rewrite.revisionRequiredCount).toBe(1);
    expect(rewrite.proposals[0].verified).toBe(false);
    expect(rewrite.status).toBe('incomplete');
  });
});

describe('an evaluation request is not permission to rewrite', () => {
  it('refuses rewriting on a run that did not ask for it', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        // The model tries anyway.
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general' },
      { userId: USER_ID }
    );

    // Neither specialist started: refused before a child run.
    expect(agentsThatRan()).not.toContain(REWRITE);
    expect(agentsThatRan()).not.toContain(VERIFICATION);
    expect(output.agentsUsed).toEqual(['resume-evaluation']);
    expect(output.rewriteRequested).toBe(false);
    expect(output.rewrite).toBeUndefined();

    expect(toolResults(ORCHESTRATOR).join(' ')).toMatch(/not authorised to rewrite/i);
  });

  it('refuses rewriting before any analysis has produced findings', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        // Straight to rewriting, with nothing to ground it in.
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal]),
      [VERIFICATION]: verificationScript([approve(WEAK_PROPOSAL_ID)]),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    expect(toolResults(ORCHESTRATOR).join(' ')).toMatch(/nothing to ground itself in/i);
    // The refused attempt did not spend one of the three rewrite slots.
    expect(output.rewrite!.proposals).toHaveLength(1);
    expect(output.rewrite!.revisionAttempts).toBe(0);
  });

  it('refuses verification when no proposals exist', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    expect(agentsThatRan()).not.toContain(VERIFICATION);
    expect(toolResults(ORCHESTRATOR).join(' ')).toMatch(/no edit proposals to verify/i);
    expect(output.rewrite!.status).toBe('failed');
  });
});

// ============================================================================

describe('the revision loop', () => {
  it('carries the verifier’s own objections back to the rewriter and re-verifies', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        // Having read a revision_required verdict, it goes back for a revision.
        { toolCalls: [call('delegate_rewrite', { focus: 'keep the figure' })] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: [
        ...rewriteScript([lossyProposal]),
        ...rewriteScript([fixedProposal], { readFeedback: true }),
      ],
      [VERIFICATION]: [
        ...verificationScript([
          {
            proposalId: METRIC_PROPOSAL_ID,
            status: 'approved',
            reason: 'Reads better.',
            claimAnalysis: [
              {
                claim: 'Migrated services onto Kubernetes.',
                classification: 'faithful_paraphrase',
                evidence: METRIC_BULLET,
              },
            ],
          },
        ]),
        ...verificationScript([approve(METRIC_PROPOSAL_ID)]),
      ],
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    // Two rewrite runs and two verification runs really happened.
    expect(turnsOf(REWRITE)).toBe(5 + 6); // a 5-turn run, then a 6-turn revision
    expect(turnsOf(VERIFICATION)).toBe(4 + 4); // two 4-turn verification runs

    // The revision request carried the verifier's concrete objection.
    const feedback = toolResults(REWRITE).find(
      (result) =>
        result.includes('get_verification_feedback') || result.includes('requiredRevisions')
    );
    expect(feedback).toBeDefined();
    expect(feedback).toMatch(/revision_required/);
    expect(feedback).toMatch(/12/);

    // And the revised proposal was verified again before being reported.
    const rewrite = output.rewrite!;
    expect(rewrite.revisionAttempts).toBe(1);
    expect(rewrite.status).toBe('complete');
    expect(rewrite.proposals).toHaveLength(1);
    expect(rewrite.proposals[0].proposedText).toBe(FIXED_REWRITE);
    expect(rewrite.proposals[0].verified).toBe(true);
    expectNoResumeWrites();
  });

  it('refuses a second rewrite that is not answering a verifier', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        // No verification in between.
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal]),
      [VERIFICATION]: verificationScript([approve(WEAK_PROPOSAL_ID)]),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    expect(toolResults(ORCHESTRATOR).join(' ')).toMatch(/have not been verified yet/i);
    expect(output.rewrite!.revisionAttempts).toBe(0);
    expect(output.rewrite!.verifiedCount).toBe(1);
  });

  it('refuses a revision the verifier did not ask for', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        // Everything was approved, but the model wants another go.
        { toolCalls: [call('delegate_rewrite', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal]),
      [VERIFICATION]: verificationScript([approve(WEAK_PROPOSAL_ID)]),
    };

    await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    expect(toolResults(ORCHESTRATOR).join(' ')).toMatch(/asked for no revisions/i);
    expect(turnsOf(REWRITE)).toBe(5); // a single 5-turn rewrite run
  });

  it('stops at the revision limit rather than rewriting forever', async () => {
    const unhappy = (round: number) =>
      verificationScript([
        {
          proposalId: METRIC_PROPOSAL_ID,
          status: 'revision_required',
          reason: `Still not right after round ${round}.`,
          claimAnalysis: [
            {
              claim: 'Migrated services onto Kubernetes.',
              classification: 'faithful_paraphrase',
              evidence: METRIC_BULLET,
            },
          ],
          requiredRevisions: ['Keep the figure 12 that the original stated.'],
        },
      ]);

    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        // A fourth attempt: one past the limit.
        { toolCalls: [call('delegate_rewrite', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: [
        ...rewriteScript([lossyProposal]),
        ...rewriteScript([lossyProposal], { readFeedback: true }),
        ...rewriteScript([lossyProposal], { readFeedback: true }),
      ],
      [VERIFICATION]: [...unhappy(0), ...unhappy(1), ...unhappy(2)],
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    // Three rewrite runs: the first attempt plus the two permitted revisions.
    expect(turnsOf(REWRITE)).toBe(5 + 6 + 6); // first attempt plus two revisions
    expect(toolResults(ORCHESTRATOR).join(' ')).toMatch(
      /Delegation refused[\s\S]*delegate_rewrite/i
    );

    const rewrite = output.rewrite!;
    expect(rewrite.revisionAttempts).toBe(2);
    expect(rewrite.revisionLimit).toBe(2);
    // The honest outcome: still outstanding, and nothing is called verified.
    expect(rewrite.status).toBe('incomplete');
    expect(rewrite.verifiedCount).toBe(0);
    expect(rewrite.revisionRequiredCount).toBe(1);
    expect(rewrite.proposals.every((proposal) => proposal.verified === false)).toBe(true);
    expect(output.executionStatus).toBe('partial');
    expect(output.limitations.join(' ')).toMatch(/still wanted revisions/i);
  });
});

// ============================================================================

describe('nothing unverified is ever reported as verified', () => {
  it('marks proposals unverified when the orchestrator reports without verifying', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        // Straight to the report, skipping verification entirely.
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal]),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    const rewrite = output.rewrite!;
    expect(rewrite.status).toBe('unverified');
    expect(rewrite.verifiedCount).toBe(0);
    expect(rewrite.unverifiedCount).toBe(1);
    expect(rewrite.proposals[0].verified).toBe(false);
    expect(rewrite.proposals[0].verification).toBeUndefined();
    expect(output.limitations.join(' ')).toMatch(/none of them is verified/i);
    expect(output.executionStatus).toBe('partial');
  });

  it('does not approve a proposal a failed verifier never ruled on', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal]),
      // The verifier burns its whole budget without ever submitting.
      [VERIFICATION]: Array.from({ length: 10 }, () => ({
        toolCalls: [call('get_proposals_to_verify', {})],
      })),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    // The child failed; the orchestrator was told, and reported honestly.
    expect(toolResults(ORCHESTRATOR).join(' ')).toMatch(/maxSteps|error/i);
    const rewrite = output.rewrite!;
    expect(rewrite.status).toBe('unverified');
    expect(rewrite.verifiedCount).toBe(0);
    expect(rewrite.proposals[0].verified).toBe(false);
  });

  it('keeps a deterministically rejected proposal out of the verified count', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal, lossyProposal]),
      // The verifier's model approves both. One of them loses a figure.
      [VERIFICATION]: verificationScript([approve(WEAK_PROPOSAL_ID), approve(METRIC_PROPOSAL_ID)]),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    const rewrite = output.rewrite!;
    expect(rewrite.verifiedCount).toBe(1);
    expect(rewrite.revisionRequiredCount).toBe(1);

    const lossy = rewrite.proposals.find((p) => p.proposalId === METRIC_PROPOSAL_ID)!;
    expect(lossy.verified).toBe(false);
    expect(lossy.verification!.status).toBe('revision_required');
    expect(lossy.verification!.decidedBy).toBe('deterministic');
  });
});

// ============================================================================

describe('different requests take different agent paths', () => {
  it('runs matching and the rewrite loop for a job-description rewrite', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_matching', {})] },
        { toolCalls: [call('delegate_rewrite', { focus: 'surface supported keywords' })] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [MATCHING]: jdMatchScript(),
      [REWRITE]: rewriteScript([goodProposal]),
      [VERIFICATION]: verificationScript([approve(WEAK_PROPOSAL_ID)]),
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD, rewrite: true },
      { userId: USER_ID }
    );

    expect(agentsThatRan()).not.toContain(EVALUATION);
    expect(output.agentsUsed).toEqual(['resume-jd-match', 'resume-rewrite', 'resume-verification']);
    expect(output.matching).toBeDefined();
    expect(output.rewrite!.verifiedCount).toBe(1);

    // The posting's text never reached any model in the tree.
    expect(JSON.stringify(turnLog)).not.toContain('Terraform and GraphQL experience is required');
  });

  it('produces a different execution tree for analysis than for rewriting', async () => {
    scripts = {
      [ORCHESTRATOR]: [{ toolCalls: [call('delegate_evaluation', {})] }, reportTurn()],
      [EVALUATION]: evaluationScript(),
    };

    await runResumeOrchestrator({ resumeId: RESUME_ID, mode: 'general' }, { userId: USER_ID });
    const analysisRows = runRows()
      .map((row) => String(row.agentId))
      .sort();

    vi.clearAllMocks();
    turnLog = [];
    callCounter = 0;
    profileFindFirst.mockResolvedValue(dbProfile());
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        { toolCalls: [call('delegate_verification', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal]),
      [VERIFICATION]: verificationScript([approve(WEAK_PROPOSAL_ID)]),
    };

    await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );
    const rewriteRows = runRows()
      .map((row) => String(row.agentId))
      .sort();

    expect(analysisRows).toEqual(['resume-evaluation', 'resume-orchestrator']);
    expect(rewriteRows).toEqual([
      'resume-evaluation',
      'resume-orchestrator',
      'resume-rewrite',
      'resume-verification',
    ]);
    expect(analysisRows).not.toEqual(rewriteRows);
  });
});

// ============================================================================

describe('limits and cancellation still hold across the larger tree', () => {
  it('propagates cancellation into the rewrite specialists', async () => {
    const controller = new AbortController();

    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_rewrite', {})] },
        reportTurn(),
      ],
      [EVALUATION]: evaluationScript(),
      [REWRITE]: rewriteScript([goodProposal]),
    };

    onTurn = (agent) => {
      if (agent === ORCHESTRATOR) controller.abort();
    };

    await expect(
      runResumeOrchestrator(
        { resumeId: RESUME_ID, mode: 'general', rewrite: true },
        { userId: USER_ID },
        { signal: controller.signal }
      )
    ).rejects.toThrow(/cancelled/i);

    expect(turnLog.filter((turn) => turn.agent === REWRITE)).toHaveLength(0);
    expectNoResumeWrites();
  });

  it('keeps the analysis specialists on their own narrower allowance', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_evaluation', {})] },
        // A third call, which the per-tool cap refuses even though the
        // rewrite-mode tree-wide limit would allow three.
        { toolCalls: [call('delegate_evaluation', {})] },
        reportTurn(),
      ],
      [EVALUATION]: [...evaluationScript(), ...evaluationScript()],
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general', rewrite: true },
      { userId: USER_ID }
    );

    expect(turnsOf(EVALUATION)).toBe(3 + 3); // two complete three-turn runs
    expect(toolResults(ORCHESTRATOR).join(' ')).toMatch(
      /delegate_evaluation[\s\S]*already been called 2 times/i
    );
    expect(output.agentsUsed).toEqual(['resume-evaluation']);
  });

  it('refuses to run without an authenticated user', async () => {
    await expect(
      runResumeOrchestrator(
        { resumeId: RESUME_ID, mode: 'general', rewrite: true },
        { userId: '   ' }
      )
    ).rejects.toThrow(/authenticated user/i);

    expect(executeChatCompletionMock).not.toHaveBeenCalled();
  });
});
