/**
 * Phase 3A — the Rewrite Agent and the Verification Agent, end to end.
 *
 * Neither agent is mocked. Both real agent definitions run on the real
 * runtime, with the real tools and the real deterministic guards. Only the
 * LLM turn and the database are replaced.
 *
 * The claims under test are the ones a convincing demo can fake: that a
 * fabricated metric never becomes a proposal, that the verifier's verdict is
 * not simply whatever the model said, and that nothing in either run touches
 * the user's resume.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type OpenAI from 'openai';

// ── LLM seam ────────────────────────────────────────────────────────────────

interface ScriptedTurn {
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
}

const REWRITE = 'rewrite';
const VERIFICATION = 'verification';

const MARKERS: Array<[string, string]> = [
  [REWRITE, 'You are the Follio Resume Rewrite Agent'],
  [VERIFICATION, 'You are the Follio Resume Verification Agent'],
];

let scripts: Record<string, ScriptedTurn[]> = {};
let turnLog: Array<{ agent: string; messages: OpenAI.Chat.ChatCompletionMessageParam[] }> = [];

function agentOf(messages: OpenAI.Chat.ChatCompletionMessageParam[]): string {
  const system = String(messages[0]?.content ?? '');
  return MARKERS.find(([, marker]) => system.includes(marker))?.[0] ?? 'UNKNOWN';
}

const executeChatCompletionMock = vi.fn(
  async (options: { messages: OpenAI.Chat.ChatCompletionMessageParam[] }) => {
    const agent = agentOf(options.messages);
    turnLog.push({ agent, messages: structuredClone(options.messages) });

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

/** Every write path a rewrite could conceivably reach. None may be called. */
const writeSpies = {
  profileUpdate: vi.fn(),
  profileUpdateMany: vi.fn(),
  profileDelete: vi.fn(),
  workExperienceUpdate: vi.fn(),
  workExperienceUpdateMany: vi.fn(),
  projectUpdate: vi.fn(),
  projectUpdateMany: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  db: {
    profile: {
      findFirst: (...args: unknown[]) => profileFindFirst(...args),
      update: (...args: unknown[]) => writeSpies.profileUpdate(...args),
      updateMany: (...args: unknown[]) => writeSpies.profileUpdateMany(...args),
      delete: (...args: unknown[]) => writeSpies.profileDelete(...args),
    },
    workExperience: {
      update: (...args: unknown[]) => writeSpies.workExperienceUpdate(...args),
      updateMany: (...args: unknown[]) => writeSpies.workExperienceUpdateMany(...args),
    },
    project: {
      update: (...args: unknown[]) => writeSpies.projectUpdate(...args),
      updateMany: (...args: unknown[]) => writeSpies.projectUpdateMany(...args),
    },
    agentRun: { upsert: (...args: unknown[]) => agentRunUpsert(...args) },
  },
}));

import { runRewriteAgent } from '@/services/agents/resume/rewrite.agent';
import { runVerificationAgent } from '@/services/agents/resume/verification.agent';

// ============================================================================
// FIXTURES
// ============================================================================

const RESUME_ID = 'resume_abc123';
const OTHER_RESUME_ID = 'resume_other999';
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

function dbProfile(overrides: { id?: string } = {}) {
  return {
    id: overrides.id ?? RESUME_ID,
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

/** The reads a rewrite run makes before it proposes anything. */
function rewritePreamble(resumeId = RESUME_ID): ScriptedTurn[] {
  return [
    { toolCalls: [call('get_resume', { resumeId })] },
    { toolCalls: [call('list_rewrite_targets', { resumeId })] },
    { toolCalls: [call('get_analysis_findings', { resumeId })] },
  ];
}

const GOOD_REWRITE = 'Built and maintained the backend services behind the platform';

/** A proposal that keeps every fact the original carried. */
function goodProposalArgs(resumeId = RESUME_ID) {
  return {
    resumeId,
    targetRef: WEAK_REF,
    originalText: WEAK_BULLET,
    proposedText: GOOD_REWRITE,
    explanation: 'Replaces filler with a concrete action verb; no new facts.',
    sourceEvidence: [WEAK_BULLET],
  };
}

/** Tool names that really executed, per agent, from the persisted run rows. */
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

/** Every tool-result payload an agent was handed, as raw JSON strings. */
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

/** Assert the user's resume was never written to by anything in the run. */
function expectNoResumeWrites(): void {
  for (const [name, spy] of Object.entries(writeSpies)) {
    expect(spy, `${name} must never be called`).not.toHaveBeenCalled();
  }
}

/** A proposal object as the verifier receives one. */
function proposalUnderReview(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: WEAK_PROPOSAL_ID,
    target: { section: 'experience', recordId: 'exp1', field: 'bullets', index: 0 },
    targetRef: WEAK_REF,
    label: 'Backend Engineer @ Acme — bullet 1',
    originalText: WEAK_BULLET,
    proposedText: 'Built and maintained the backend services behind the platform',
    explanation: 'Removes filler.',
    keywordsAddressed: [],
    sourceEvidence: [],
    uncertainties: [],
    revisionRound: 0,
    ...overrides,
  };
}

/** The verifier's reads, before it submits. */
function verificationPreamble(resumeId = RESUME_ID): ScriptedTurn[] {
  return [
    { toolCalls: [call('get_resume', { resumeId })] },
    { toolCalls: [call('get_proposals_to_verify', {})] },
    { toolCalls: [call('run_deterministic_checks', { resumeId })] },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  scripts = {};
  turnLog = [];
  callCounter = 0;
  profileFindFirst.mockResolvedValue(dbProfile());
});

// ============================================================================
// REWRITE AGENT
// ============================================================================

describe('the Rewrite Agent proposes grounded edits', () => {
  it('rewrites a weak bullet and addresses it by record and field', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      { toolCalls: [call('propose_rewrite', goodProposalArgs())] },
      {
        toolCalls: [
          call('submit_rewrite_proposals', {
            rationale: 'The first bullet is filler and states nothing concrete.',
          }),
        ],
      },
    ];

    const { output, run } = await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
      { userId: USER_ID }
    );

    expect(run.status).toBe('succeeded');
    expect(output.proposals).toHaveLength(1);

    const [proposal] = output.proposals;
    // Addressed by stable record id and field path, not by searching text.
    expect(proposal.target).toEqual({
      section: 'experience',
      recordId: 'exp1',
      field: 'bullets',
      index: 0,
    });
    expect(proposal.targetRef).toBe(WEAK_REF);
    expect(proposal.proposalId).toBe(WEAK_PROPOSAL_ID);
    // The original is the resume's own string, not the model's transcription.
    expect(proposal.originalText).toBe(WEAK_BULLET);
    expect(proposal.proposedText).toMatch(/Built and maintained/);

    expectNoResumeWrites();
  });

  it('runs its own tools inside its own run', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      { toolCalls: [call('propose_rewrite', goodProposalArgs())] },
      { toolCalls: [call('submit_rewrite_proposals', { rationale: 'x' })] },
    ];

    await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
      { userId: USER_ID }
    );

    expect(executedToolsByAgent()['resume-rewrite']).toEqual([
      'get_resume',
      'list_rewrite_targets',
      'get_analysis_findings',
      'propose_rewrite',
      'submit_rewrite_proposals',
    ]);
  });

  it('strengthens the language without changing what the bullet asserts', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      {
        toolCalls: [
          call('propose_rewrite', {
            ...goodProposalArgs(),
            targetRef: METRIC_REF,
            originalText: METRIC_BULLET,
            proposedText: 'Migrated 12 production services onto Kubernetes',
          }),
        ],
      },
      { toolCalls: [call('submit_rewrite_proposals', { rationale: 'Sharper, same facts.' })] },
    ];

    const { output } = await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
      { userId: USER_ID }
    );

    const [proposal] = output.proposals;
    // Every fact the original carried survives.
    expect(proposal.proposedText).toContain('12');
    expect(proposal.proposedText).toContain('Kubernetes');
    expect(proposal.deterministicIssues.filter((issue) => issue.severity !== 'info')).toEqual([]);
  });

  it('refuses a proposal that invents a performance metric', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      {
        toolCalls: [
          call('propose_rewrite', {
            ...goodProposalArgs(),
            proposedText: 'Rebuilt backend services, cutting platform latency by 40%',
          }),
        ],
      },
      // Having been refused, the model proposes something supportable.
      { toolCalls: [call('propose_rewrite', goodProposalArgs())] },
      { toolCalls: [call('submit_rewrite_proposals', { rationale: 'x' })] },
    ];

    const { output } = await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
      { userId: USER_ID }
    );

    // The invented figure never became a proposal at all.
    expect(output.proposals).toHaveLength(1);
    expect(JSON.stringify(output.proposals)).not.toContain('40%');

    // And the model was told why, in terms it could act on.
    const refusal = toolResults(REWRITE).find((result) => result.includes('unsupported-number'));
    expect(refusal).toBeDefined();
    expect(JSON.parse(refusal!)).toMatchObject({ accepted: false });
  });

  it('refuses an appended outcome, then accepts the factual version of the same bullet', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      // The shape the first live run produced: a true sentence with a benefit
      // stapled onto the end of it.
      {
        toolCalls: [
          call('propose_rewrite', {
            ...goodProposalArgs(),
            proposedText: `${GOOD_REWRITE}, enhancing data retrieval speed`,
          }),
        ],
      },
      // Refused, so it proposes what it can actually support.
      { toolCalls: [call('propose_rewrite', goodProposalArgs())] },
      {
        toolCalls: [
          call('submit_rewrite_proposals', {
            rationale: 'Tightened the wording; the resume states no retrieval speed.',
            openQuestions: ['Did the API speed anything up, and do you know by how much?'],
          }),
        ],
      },
    ];

    const { output } = await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
      { userId: USER_ID }
    );

    // The outcome claim never became a proposal.
    expect(output.proposals).toHaveLength(1);
    expect(JSON.stringify(output.proposals)).not.toMatch(/retrieval speed/i);
    expect(output.proposals[0].proposedText).toBe(GOOD_REWRITE);

    // The agent was told exactly what was wrong and what to do instead.
    const refusal = toolResults(REWRITE).find((result) => result.includes('unsupported-outcome'));
    expect(refusal).toBeDefined();
    expect(JSON.parse(refusal!)).toMatchObject({ accepted: false });
    expect(refusal).toMatch(/without the benefit clause/i);

    // And the missing outcome became a question for the user, not a guess.
    expect(output.openQuestions.join(' ')).toMatch(/speed anything up/i);
    expectNoResumeWrites();
  });

  it('refuses invented employers, credentials and team sizes alike', async () => {
    const attempts = [
      'Rebuilt the backend services platform at Globex',
      'Applied Certified Scrum practices to backend services',
      'Led a team of 5 engineers building backend services',
    ];

    scripts[REWRITE] = [
      ...rewritePreamble(),
      ...attempts.map((proposedText) => ({
        toolCalls: [call('propose_rewrite', { ...goodProposalArgs(), proposedText })],
      })),
      {
        toolCalls: [
          call('submit_rewrite_proposals', {
            rationale: 'Nothing supportable was left once the claims were removed.',
            nothingToPropose: true,
          }),
        ],
      },
    ];

    const { output } = await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
      { userId: USER_ID }
    );

    expect(output.proposals).toEqual([]);

    const transcript = JSON.stringify(turnLog);
    expect(transcript).toMatch(/unsupported-employer/);
    expect(transcript).toMatch(/unsupported-certification/);
    expect(transcript).toMatch(/unsupported-leadership/);
    expectNoResumeWrites();
  });

  it('rejects an invalid resume target instead of guessing one', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      {
        toolCalls: [
          call('propose_rewrite', { ...goodProposalArgs(), targetRef: 'experience:exp1:company' }),
        ],
      },
      {
        toolCalls: [
          call('propose_rewrite', {
            ...goodProposalArgs(),
            targetRef: 'experience:exp1:bullets:9',
          }),
        ],
      },
      { toolCalls: [call('propose_rewrite', goodProposalArgs())] },
      { toolCalls: [call('submit_rewrite_proposals', { rationale: 'x' })] },
    ];

    const { output } = await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
      { userId: USER_ID }
    );

    expect(output.proposals).toHaveLength(1);
    expect(output.proposals[0].targetRef).toBe(WEAK_REF);
    expect(JSON.stringify(turnLog)).toMatch(/not a valid targetRef|No rewritable resume element/);
  });

  it('keeps a proposal that asks the user for a figure rather than inventing one', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      {
        toolCalls: [
          call('propose_rewrite', {
            ...goodProposalArgs(),
            uncertainties: ['How many backend services were there? The resume does not say.'],
          }),
        ],
      },
      {
        toolCalls: [
          call('submit_rewrite_proposals', {
            rationale: 'Stronger wording; the count would help and is not on the resume.',
            openQuestions: ['How many backend services did you run?'],
          }),
        ],
      },
    ];

    const { output } = await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
      { userId: USER_ID }
    );

    expect(output.proposals).toHaveLength(1);
    expect(output.openQuestions).toContain('How many backend services did you run?');
    expect(output.proposals[0].deterministicIssues.map((issue) => issue.code)).toContain(
      'author-flagged-uncertainty'
    );
  });

  it('refuses a job-description keyword the resume does not evidence', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      {
        toolCalls: [
          call('propose_rewrite', {
            ...goodProposalArgs(),
            proposedText: 'Built backend services on the platform using terraform',
            keywordsAddressed: ['Terraform'],
          }),
        ],
      },
      // Then surfaces one the resume does support.
      {
        toolCalls: [
          call('propose_rewrite', {
            ...goodProposalArgs(),
            targetRef: METRIC_REF,
            originalText: METRIC_BULLET,
            proposedText: 'Migrated 12 production services onto Kubernetes',
            keywordsAddressed: ['Kubernetes'],
          }),
        ],
      },
      { toolCalls: [call('submit_rewrite_proposals', { rationale: 'x' })] },
    ];

    const { output } = await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'jd', revisionRound: 0, jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    expect(output.proposals).toHaveLength(1);
    expect(output.proposals[0].keywordsAddressed).toEqual(['Kubernetes']);
    expect(JSON.stringify(turnLog)).toMatch(/unsupported-skill|unsupported-keyword/);
  });

  it('never places the job description text in the model’s context', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      { toolCalls: [call('propose_rewrite', goodProposalArgs())] },
      { toolCalls: [call('submit_rewrite_proposals', { rationale: 'x' })] },
    ];

    await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'jd', revisionRound: 0, jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    expect(JSON.stringify(turnLog)).not.toContain('Terraform and GraphQL experience is required');
  });

  it('tailors to a target role without a job description', async () => {
    scripts[REWRITE] = [
      ...rewritePreamble(),
      { toolCalls: [call('propose_rewrite', goodProposalArgs())] },
      { toolCalls: [call('submit_rewrite_proposals', { rationale: 'x' })] },
    ];

    const { output } = await runRewriteAgent(
      {
        resumeId: RESUME_ID,
        context: 'role',
        targetRole: 'Technical Program Manager',
        revisionRound: 0,
      },
      { userId: USER_ID }
    );

    expect(output.context).toBe('role');
    expect(output.proposals).toHaveLength(1);
    // No posting, so the keyword guard had nothing to check — and says so.
    expect(output.limitations.join(' ')).toMatch(/No job description/i);
  });

  it('keeps the resume pinned to the one the caller selected', async () => {
    scripts[REWRITE] = [
      { toolCalls: [call('get_resume', { resumeId: OTHER_RESUME_ID })] },
      ...rewritePreamble(),
      { toolCalls: [call('propose_rewrite', goodProposalArgs())] },
      { toolCalls: [call('submit_rewrite_proposals', { rationale: 'x' })] },
    ];

    await runRewriteAgent(
      { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
      { userId: USER_ID }
    );

    expect(profileFindFirst).toHaveBeenCalledTimes(1);
    const query = profileFindFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(query.where).toMatchObject({ id: RESUME_ID, userId: USER_ID, isArchived: false });
  });

  it('refuses to run without an authenticated user', async () => {
    await expect(
      runRewriteAgent(
        { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
        { userId: '  ' }
      )
    ).rejects.toThrow(/authenticated user/i);

    expect(executeChatCompletionMock).not.toHaveBeenCalled();
  });

  it('fails rather than returning proposals it never made', async () => {
    scripts[REWRITE] = Array.from({ length: 16 }, () => ({
      toolCalls: [call('submit_rewrite_proposals', { rationale: 'here you go' })],
    }));

    await expect(
      runRewriteAgent(
        { resumeId: RESUME_ID, context: 'general', revisionRound: 0 },
        { userId: USER_ID }
      )
    ).rejects.toThrow(/maxSteps/i);

    expectNoResumeWrites();
  });
});

// ============================================================================
// VERIFICATION AGENT
// ============================================================================

describe('the Verification Agent checks proposals independently', () => {
  function verifyWith(
    modelVerdicts: Array<Record<string, unknown>>,
    proposals: Array<Record<string, unknown>>
  ) {
    scripts[VERIFICATION] = [
      ...verificationPreamble(),
      {
        toolCalls: [
          call('submit_verification', {
            summary: 'Reviewed the batch.',
            verdicts: modelVerdicts,
          }),
        ],
      },
    ];

    return runVerificationAgent(
      {
        resumeId: RESUME_ID,
        proposals: proposals as never,
        revisionRound: 0,
      },
      { userId: USER_ID }
    );
  }

  /**
   * A verifier that did its job: a verdict plus the claim comparison behind
   * it. Without `claimAnalysis` a verdict is treated as unexamined and can
   * never be an approval, which is asserted separately below.
   */
  const approvingModel = (proposalId = WEAK_PROPOSAL_ID) => [
    {
      proposalId,
      status: 'approved',
      reason: 'Reads well and asserts nothing the original did not.',
      claimAnalysis: [
        {
          claim: 'Maintained backend services on the platform.',
          classification: 'faithful_paraphrase',
          evidence: WEAK_BULLET,
        },
      ],
      supportingEvidence: [WEAK_BULLET],
    },
  ];

  it('approves a rewrite that preserves every fact', async () => {
    const { output } = await verifyWith(approvingModel(), [proposalUnderReview()]);

    expect(output.verdicts).toHaveLength(1);
    expect(output.verdicts[0].status).toBe('approved');
    expect(output.verdicts[0].decidedBy).toBe('deterministic+model');
    expect(output.approvedCount).toBe(1);
    expectNoResumeWrites();
  });

  it('rejects a proposal whose original text is not what the resume says', async () => {
    const { output } = await verifyWith(approvingModel(), [
      proposalUnderReview({ originalText: 'Built a payments platform from scratch' }),
    ]);

    expect(output.verdicts[0].status).toBe('rejected');
    expect(output.verdicts[0].deterministicIssues.map((issue) => issue.code)).toContain(
      'original-text-mismatch'
    );
  });

  it('rejects an invented performance metric however the model voted', async () => {
    const { output } = await verifyWith(approvingModel(), [
      proposalUnderReview({
        proposedText: 'Rebuilt backend services, cutting platform latency by 40%',
      }),
    ]);

    expect(output.verdicts[0].status).toBe('rejected');
    expect(output.verdicts[0].decidedBy).toBe('deterministic');
    expect(output.verdicts[0].deterministicIssues.map((issue) => issue.code)).toContain(
      'unsupported-number'
    );
  });

  it('rejects an invented employer', async () => {
    const { output } = await verifyWith(approvingModel(), [
      proposalUnderReview({ proposedText: 'Rebuilt the backend services platform at Globex' }),
    ]);

    expect(output.verdicts[0].status).toBe('rejected');
    expect(output.verdicts[0].deterministicIssues.map((issue) => issue.code)).toContain(
      'unsupported-employer'
    );
  });

  it('rejects a technical skill the resume does not evidence', async () => {
    const { output } = await verifyWith(approvingModel(METRIC_PROPOSAL_ID), [
      proposalUnderReview({
        proposalId: METRIC_PROPOSAL_ID,
        target: { section: 'experience', recordId: 'exp1', field: 'bullets', index: 1 },
        targetRef: METRIC_REF,
        originalText: METRIC_BULLET,
        proposedText: 'Migrated 12 services onto Kubernetes using Terraform',
      }),
    ]);

    expect(output.verdicts[0].status).toBe('rejected');
    expect(output.verdicts[0].deterministicIssues.map((issue) => issue.code)).toContain(
      'unsupported-proper-noun'
    );
  });

  it('rejects exaggerated leadership responsibility', async () => {
    const { output } = await verifyWith(approvingModel(), [
      proposalUnderReview({
        proposedText: 'Led a team of 5 engineers delivering backend services',
      }),
    ]);

    expect(output.verdicts[0].status).toBe('rejected');
    expect(output.verdicts[0].deterministicIssues.map((issue) => issue.code)).toContain(
      'unsupported-leadership'
    );
  });

  it('rejects an unsupported certification', async () => {
    const { output } = await verifyWith(approvingModel(), [
      proposalUnderReview({
        proposedText: 'Applied Certified Scrum practices across backend services',
      }),
    ]);

    expect(output.verdicts[0].status).toBe('rejected');
    expect(output.verdicts[0].deterministicIssues.map((issue) => issue.code)).toContain(
      'unsupported-certification'
    );
  });

  it('asks for a revision when the rewrite drops a fact', async () => {
    const { output } = await verifyWith(approvingModel(METRIC_PROPOSAL_ID), [
      proposalUnderReview({
        proposalId: METRIC_PROPOSAL_ID,
        target: { section: 'experience', recordId: 'exp1', field: 'bullets', index: 1 },
        targetRef: METRIC_REF,
        originalText: METRIC_BULLET,
        proposedText: 'Migrated production services onto Kubernetes',
      }),
    ]);

    expect(output.verdicts[0].status).toBe('revision_required');
    // The revision request is concrete enough for a rewrite to act on.
    expect(output.verdicts[0].requiredRevisions.join(' ')).toMatch(/12/);
  });

  it('sends an ambiguous claim to the user rather than approving it', async () => {
    const { output } = await verifyWith(approvingModel(), [
      proposalUnderReview({
        uncertainties: ['The resume does not say how many services there were.'],
      }),
    ]);

    expect(output.verdicts[0].status).toBe('needs_user_input');
    expect(output.needsUserInputCount).toBe(1);
  });

  it('flags duplicate proposals for the same resume element', async () => {
    const duplicate = proposalUnderReview({
      proposalId: 'prop_duplicate',
      proposedText: 'Built the backend services the platform depends on',
    });

    const { output } = await verifyWith(
      [
        ...approvingModel(),
        {
          proposalId: 'prop_duplicate',
          status: 'approved',
          reason: 'Fine too.',
          claimAnalysis: [
            {
              claim: 'Maintained backend services.',
              classification: 'faithful_paraphrase',
              evidence: WEAK_BULLET,
            },
          ],
        },
      ],
      [proposalUnderReview(), duplicate]
    );

    expect(output.verdicts.map((verdict) => verdict.status)).toEqual(['rejected', 'rejected']);
    expect(output.verdicts[0].deterministicIssues.map((issue) => issue.code)).toContain(
      'duplicate-target'
    );
  });

  it('cannot be talked out of a deterministic rejection', async () => {
    const { output } = await verifyWith(
      [
        {
          proposalId: WEAK_PROPOSAL_ID,
          status: 'approved',
          reason: 'I checked this carefully and the 40% figure is clearly implied.',
          supportingEvidence: ['Implied by the migration work.'],
        },
      ],
      [
        proposalUnderReview({
          proposedText: 'Rebuilt backend services, cutting platform latency by 40%',
        }),
      ]
    );

    expect(output.verdicts[0].status).toBe('rejected');
    expect(output.approvedCount).toBe(0);
    // The model's reasoning is recorded, not acted on.
    expect(output.verdicts[0].reason).toMatch(/overrides the reviewer/i);
  });

  it('does not approve a proposal the verifier failed to examine', async () => {
    const { output } = await verifyWith(
      // A verdict for a proposal that is not in the batch, and none for one
      // that is.
      [{ proposalId: 'prop_not_in_batch', status: 'approved', reason: 'Looks fine.' }],
      [proposalUnderReview()]
    );

    expect(output.verdicts).toHaveLength(1);
    expect(output.verdicts[0].status).toBe('needs_user_input');
    expect(output.verdicts[0].decidedBy).toBe('deterministic');
    expect(output.verdicts[0].reason).toMatch(/no verdict/i);
    expect(output.limitations.join(' ')).toMatch(/not in this batch/i);
  });

  it('takes the model’s stricter verdict when the checks found nothing', async () => {
    const { output } = await verifyWith(
      [
        {
          proposalId: WEAK_PROPOSAL_ID,
          status: 'rejected',
          reason: '"Built and maintained" overstates what "responsible for" described.',
          questionableClaims: ['Built'],
        },
      ],
      [proposalUnderReview()]
    );

    expect(output.verdicts[0].status).toBe('rejected');
    expect(output.verdicts[0].decidedBy).toBe('model');
  });

  it('refuses to submit a verdict before the deterministic checks have run', async () => {
    scripts[VERIFICATION] = [
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('get_proposals_to_verify', {})] },
      // Straight to a verdict, skipping the checks.
      {
        toolCalls: [
          call('submit_verification', { summary: 'All good.', verdicts: approvingModel() }),
        ],
      },
      // Having been refused, it runs them.
      { toolCalls: [call('run_deterministic_checks', { resumeId: RESUME_ID })] },
      {
        toolCalls: [
          call('submit_verification', { summary: 'All good.', verdicts: approvingModel() }),
        ],
      },
    ];

    const { output } = await runVerificationAgent(
      { resumeId: RESUME_ID, proposals: [proposalUnderReview()] as never, revisionRound: 0 },
      { userId: USER_ID }
    );

    expect(JSON.stringify(turnLog)).toMatch(/run_deterministic_checks has not run/);
    expect(output.verdicts[0].status).toBe('approved');
  });

  it('fails outright rather than approving when it never runs the checks', async () => {
    scripts[VERIFICATION] = Array.from({ length: 10 }, () => ({
      toolCalls: [
        call('submit_verification', { summary: 'Approved.', verdicts: approvingModel() }),
      ],
    }));

    await expect(
      runVerificationAgent(
        { resumeId: RESUME_ID, proposals: [proposalUnderReview()] as never, revisionRound: 0 },
        { userId: USER_ID }
      )
    ).rejects.toThrow(/maxSteps/i);
  });

  it('refuses a run with nothing to verify', async () => {
    await expect(
      runVerificationAgent(
        { resumeId: RESUME_ID, proposals: [], revisionRound: 0 },
        { userId: USER_ID }
      )
    ).rejects.toThrow(/no edit proposals/i);

    expect(executeChatCompletionMock).not.toHaveBeenCalled();
  });

  it('refuses to approve an appended outcome the resume never establishes', async () => {
    const { output } = await verifyWith(approvingModel(), [
      proposalUnderReview({
        proposedText: `${GOOD_REWRITE}, enhancing data retrieval speed`,
      }),
    ]);

    // The exact failure from the first live run, caught at the verifier even
    // though the model approved it.
    expect(output.verdicts[0].status).toBe('revision_required');
    expect(output.approvedCount).toBe(0);
    expect(output.verdicts[0].deterministicIssues.map((issue) => issue.code)).toContain(
      'unsupported-outcome'
    );
    expect(output.verdicts[0].requiredRevisions.join(' ')).toMatch(/outcome the original/i);
  });

  it('will not approve a claim its own analysis called a reasonable inference', async () => {
    const { output } = await verifyWith(
      [
        {
          proposalId: WEAK_PROPOSAL_ID,
          status: 'approved',
          reason: 'Plausible given the work described, so I am comfortable with it.',
          claimAnalysis: [
            {
              claim: 'The services became more reliable.',
              classification: 'reasonable_inference',
            },
          ],
        },
      ],
      [proposalUnderReview()]
    );

    // The deterministic guards found nothing here. The verifier's own
    // classification is what stops the approval — enforced in code.
    expect(output.verdicts[0].deterministicIssues.filter((i) => i.severity !== 'info')).toEqual([]);
    expect(output.verdicts[0].status).toBe('revision_required');
    expect(output.verdicts[0].reason).toMatch(/cannot be asserted as fact/i);
    expect(output.verdicts[0].requiredRevisions.join(' ')).toMatch(/more reliable/i);
  });

  it('will not approve a verdict that compared no claims at all', async () => {
    const { output } = await verifyWith(
      [
        {
          proposalId: WEAK_PROPOSAL_ID,
          status: 'approved',
          reason: 'Reads well and seems consistent with the rest of the resume.',
        },
      ],
      [proposalUnderReview()]
    );

    expect(output.verdicts[0].status).toBe('needs_user_input');
    expect(output.verdicts[0].reason).toMatch(/compared no claims/i);
    expect(output.approvedCount).toBe(0);
  });

  it('will not accept evidence that is not on the resume', async () => {
    const { output } = await verifyWith(
      [
        {
          proposalId: WEAK_PROPOSAL_ID,
          status: 'approved',
          reason: 'Supported by the resume.',
          claimAnalysis: [
            {
              claim: 'Maintained the backend services.',
              classification: 'supported_fact',
              // A quote that is nowhere in the user's resume.
              evidence: 'Reduced p99 latency by 60% across the fleet',
            },
          ],
        },
      ],
      [proposalUnderReview()]
    );

    expect(output.verdicts[0].status).toBe('needs_user_input');
    expect(output.verdicts[0].reason).toMatch(/does not appear on the resume/i);
  });

  it('records the claim comparison alongside the verdict', async () => {
    const { output } = await verifyWith(approvingModel(), [proposalUnderReview()]);

    expect(output.verdicts[0].claimAnalysis).toHaveLength(1);
    expect(output.verdicts[0].claimAnalysis[0].classification).toBe('faithful_paraphrase');
  });

  it('runs its own tools inside its own run', async () => {
    await verifyWith(approvingModel(), [proposalUnderReview()]);

    expect(executedToolsByAgent()['resume-verification']).toEqual([
      'get_resume',
      'get_proposals_to_verify',
      'run_deterministic_checks',
      'submit_verification',
    ]);
  });
});
