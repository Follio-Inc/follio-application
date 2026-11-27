/**
 * Phase 2B — orchestrator and specialists, end to end.
 *
 * The specialists are NOT mocked. Three real agent definitions run on the real
 * runtime, through the real `agentAsTool`, with the real Phase 1 matching
 * tools and the real deterministic analysers. Only the LLM turn and the
 * database are replaced.
 *
 * That is deliberate, because the claim being tested is precisely the one that
 * prompt chaining can fake: these tests check which agents actually ran, which
 * tools each of them actually executed, which run rows were written and how
 * they correlate, and whether the numbers in the final report came from the
 * code that computed them or from the model that was asked to repeat them.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type OpenAI from 'openai';

// ── LLM seam ────────────────────────────────────────────────────────────────

interface ScriptedTurn {
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[];
}

/** Which agent a system prompt belongs to. Keyed on each agent's own words. */
const ORCHESTRATOR = 'orchestrator';
const EVALUATION = 'evaluation';
const MATCHING = 'matching';

const MARKERS: Array<[string, string]> = [
  [ORCHESTRATOR, 'You are the Follio Resume Orchestrator'],
  [EVALUATION, 'You are the Follio Resume Evaluation Agent'],
  [MATCHING, 'You are the Follio JD / Role Matching Agent'],
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

vi.mock('@/lib/db', () => ({
  db: {
    profile: { findFirst: (...args: unknown[]) => profileFindFirst(...args) },
    agentRun: { upsert: (...args: unknown[]) => agentRunUpsert(...args) },
  },
}));

import { runResumeOrchestrator } from '@/services/agents/resume/orchestrator.agent';
import { runEvaluationAgent } from '@/services/agents/resume/evaluation.agent';
import { runJdMatchAgent } from '@/services/agents/resume/jd-match.agent';

const RESUME_ID = 'resume_abc123';
const OTHER_RESUME_ID = 'resume_other999';
const USER_ID = 'user_internal_1';

const BACKEND_JD = `Senior Backend Engineer
We need an engineer fluent in TypeScript who has run services on Kubernetes and
Docker in production. Terraform and GraphQL experience is required. You will
design APIs and own reliability for a large distributed platform.`;

/**
 * A resume with deliberately weak bullets: one has filler and no number, one
 * is short. The deterministic analyser must find those, and the tests assert
 * on what it computes rather than on anything a model says.
 */
function dbProfile(overrides: { id?: string; firstName?: string } = {}) {
  return {
    id: overrides.id ?? RESUME_ID,
    handle: 'ada-lovelace',
    resumeTitle: 'Backend Engineer',
    firstName: overrides.firstName ?? 'Ada',
    middleName: null,
    lastName: 'Lovelace',
    headline: 'Senior Backend Engineer',
    summary: 'Builds APIs and data platforms.',
    location: 'San Francisco, CA',
    contactInfo: { email: 'ada@example.com', phone: null, website: null },
    workExperiences: [
      {
        id: 'exp1',
        company: 'Acme',
        role: 'Senior Backend Engineer',
        location: 'Remote',
        startDate: new Date('2021-01-01'),
        endDate: null,
        isCurrent: true,
        bullets: [
          // Filler, no number: the analyser must flag both.
          'Responsible for various backend services and worked on the platform',
          // Carries a number, so metric coverage comes out at 50%.
          'Migrated 12 services onto Kubernetes',
        ],
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

/**
 * A complete, well-behaved specialist script.
 *
 * A factory, not a constant: the mock consumes turns with `shift()`, so a
 * shared array would be drained by the first test that used it.
 */
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

function jdMatchScript(resumeId = RESUME_ID): ScriptedTurn[] {
  return [
    { toolCalls: [call('get_resume', { resumeId })] },
    { toolCalls: [call('score_against_jd', { resumeId })] },
    { toolCalls: [call('find_missing_keywords', { resumeId })] },
    {
      toolCalls: [
        call('submit_match_findings', {
          // The model claims a score it did not compute. It must not win.
          assessment: 'This resume scores 99 out of 100 against the posting.',
          recommendations: ['List Kubernetes under skills.'],
        }),
      ],
    },
  ];
}

function roleMatchScript(): ScriptedTurn[] {
  return [
    { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
    { toolCalls: [call('evaluate_against_role', { resumeId: RESUME_ID })] },
    {
      toolCalls: [
        call('submit_match_findings', {
          assessment: 'Coverage is partial for this role.',
          recommendations: ['Name the programs you ran.'],
        }),
      ],
    },
  ];
}

/** Tool names that really executed, per agent, from the persisted run rows. */
function executedToolsByAgent(): Record<string, string[]> {
  const byAgent: Record<string, string[]> = {};
  for (const args of agentRunUpsert.mock.calls) {
    const payload = args[0] as { create?: Record<string, unknown> };
    const create = payload.create;
    if (!create) continue;
    const agentId = String(create.agentId);
    const steps = (create.stepMetas as Array<{ kind: string; stepId: string }>) ?? [];
    byAgent[agentId] = steps
      .filter((step) => step.kind === 'tool')
      .map((step) => step.stepId.replace(/^tool:/, ''));
  }
  return byAgent;
}

/** Persisted run rows keyed by agent id. */
function runRows(): Record<string, Record<string, unknown>> {
  const rows: Record<string, Record<string, unknown>> = {};
  for (const args of agentRunUpsert.mock.calls) {
    const create = (args[0] as { create?: Record<string, unknown> }).create;
    if (create) rows[String(create.agentId)] = create;
  }
  return rows;
}

function agentsThatRan(): string[] {
  return [...new Set(turnLog.map((t) => t.agent))];
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

describe('general mode', () => {
  beforeEach(() => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', { focus: 'overall quality' })] },
        {
          toolCalls: [
            call('submit_orchestrated_report', {
              summary: 'The resume is readable but under-evidenced.',
              recommendations: ['Add figures where you have them.'],
            }),
          ],
        },
      ],
      [EVALUATION]: evaluationScript(),
    };
  });

  it('delegates to the Evaluation Agent and to nothing else', async () => {
    const { output, run } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general' },
      { userId: USER_ID }
    );

    expect(run.status).toBe('succeeded');
    expect(agentsThatRan().sort()).toEqual([EVALUATION, ORCHESTRATOR]);
    // Computed from the blackboard, not written by the model.
    expect(output.agentsUsed).toEqual(['resume-evaluation']);
    expect(output.matching).toBeUndefined();
  });

  it('runs the specialist’s own tools inside the specialist’s own run', async () => {
    await runResumeOrchestrator({ resumeId: RESUME_ID, mode: 'general' }, { userId: USER_ID });

    const tools = executedToolsByAgent();
    expect(tools['resume-evaluation']).toEqual([
      'get_resume',
      'assess_resume_quality',
      'submit_evaluation',
    ]);
    // The orchestrator ran delegation and its own result tool — no analysis.
    expect(tools['resume-orchestrator']).toEqual([
      'delegate_evaluation',
      'submit_orchestrated_report',
    ]);
  });

  it('returns the specialist’s validated, computed findings to the orchestrator', async () => {
    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general' },
      { userId: USER_ID }
    );

    const evaluation = output.evaluation!;
    expect(evaluation.counts).toMatchObject({
      experiences: 1,
      education: 1,
      skills: 2,
      projects: 1,
    });
    expect(evaluation.counts.totalBullets).toBe(2);

    // The deterministic analyser found the filler bullet and the missing metric.
    const codes = evaluation.findings.map((finding) => finding.code);
    expect(codes).toContain('weak-phrasing');
    expect(evaluation.findings.some((f) => f.evidence?.includes('Responsible for'))).toBe(true);

    // One of the two bullets carries a number, so coverage is computed, not guessed.
    expect(evaluation.metricCoveragePercent).toBe(50);
    expect(evaluation.basis).toMatch(/deterministic checks/i);
  });

  it('refuses to delegate matching when there is nothing to match against', async () => {
    scripts[ORCHESTRATOR] = [
      { toolCalls: [call('delegate_matching', {})] },
      { toolCalls: [call('delegate_evaluation', {})] },
      {
        toolCalls: [
          call('submit_orchestrated_report', { summary: 'Evaluated only.', recommendations: [] }),
        ],
      },
    ];

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general' },
      { userId: USER_ID }
    );

    // The matching specialist never started — refused before a child run.
    expect(agentsThatRan()).not.toContain(MATCHING);
    expect(output.agentsUsed).toEqual(['resume-evaluation']);
  });
});

describe('job-description mode', () => {
  beforeEach(() => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_matching', { focus: 'keyword gaps' })] },
        {
          toolCalls: [
            call('submit_orchestrated_report', {
              summary: 'Partial overlap with the posting.',
              recommendations: ['Add Terraform if you have used it.'],
            }),
          ],
        },
      ],
      [MATCHING]: jdMatchScript(),
    };
  });

  it('delegates to the Matching Agent and to nothing else', async () => {
    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    expect(agentsThatRan().sort()).toEqual([MATCHING, ORCHESTRATOR]);
    expect(output.agentsUsed).toEqual(['resume-jd-match']);
    expect(output.evaluation).toBeUndefined();
  });

  it('keeps the deterministic score and keyword split the model cannot forge', async () => {
    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    const matching = output.matching!;
    expect(matching.target).toBe('jd');

    // The specialist's model claimed 99. The computed score survived instead.
    expect(matching.jdMatch!.score).not.toBe(99);
    expect(matching.jdMatch!.score).toBeGreaterThan(0);
    expect(matching.jdMatch!.score).toBeLessThanOrEqual(100);
    expect(matching.jdMatch!.matchedSkills).toContain('TypeScript');

    // Phase 1's three-way keyword split survives into the orchestrated report.
    expect(matching.keywords!.matchedInSkills).toContain('typescript');
    expect(matching.keywords!.presentButNotListedAsSkill).toContain('kubernetes');
    expect(matching.keywords!.absentFromResume).toContain('terraform');
    expect(matching.keywords!.interpretation).toMatch(/not evidence the user lacks/i);
  });

  it('never puts the job description text into any model’s context', async () => {
    await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    const everything = JSON.stringify(turnLog);
    expect(everything).not.toContain('Terraform and GraphQL experience is required');
    // Both the orchestrator and the specialist are told it exists, not what it says.
    expect(everything).toMatch(/A job description was supplied for this run/);
  });

  it('can call in a second specialist after reading a weak result', async () => {
    scripts[ORCHESTRATOR] = [
      { toolCalls: [call('delegate_matching', {})] },
      // Having seen the match, the orchestrator decides the writing matters too.
      { toolCalls: [call('delegate_evaluation', { focus: 'why the match is thin' })] },
      {
        toolCalls: [
          call('submit_orchestrated_report', {
            summary: 'Thin match, and the bullets are under-evidenced.',
            recommendations: ['Name Kubernetes in skills.', 'Replace filler openings.'],
          }),
        ],
      },
    ];
    scripts[EVALUATION] = evaluationScript();

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    expect(output.agentsUsed).toEqual(['resume-evaluation', 'resume-jd-match']);
    expect(output.evaluation).toBeDefined();
    expect(output.matching).toBeDefined();
  });
});

describe('target-role mode', () => {
  beforeEach(() => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_matching', {})] },
        {
          toolCalls: [
            call('submit_orchestrated_report', {
              summary: 'Partial coverage for this role.',
              recommendations: ['Describe the programs you coordinated.'],
            }),
          ],
        },
      ],
      [MATCHING]: roleMatchScript(),
    };
  });

  it('invokes the role tool and reports coverage without inventing a score', async () => {
    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'role', targetRole: 'Technical Program Manager' },
      { userId: USER_ID }
    );

    expect(executedToolsByAgent()['resume-jd-match']).toEqual([
      'get_resume',
      'evaluate_against_role',
      'submit_match_findings',
    ]);

    const matching = output.matching!;
    expect(matching.target).toBe('role');
    expect(matching.roleCoverage!.roleLabel).toBe('Technical Program Manager');
    expect(['broad', 'partial', 'limited']).toContain(matching.roleCoverage!.band);

    // A general role is not a posting: no score anywhere in the role result.
    expect(matching.roleCoverage).not.toHaveProperty('score');
    expect(matching.jdMatch).toBeUndefined();
    // Provenance survives all the way to the orchestrated report.
    expect(matching.roleCoverage!.provenance).toMatch(/application-defined/i);
    expect(matching.roleCoverage!.basis).toMatch(/not an ATS score/i);
  });

  it('rejects an unsupported role before any model call', async () => {
    await expect(
      runResumeOrchestrator(
        { resumeId: RESUME_ID, mode: 'role', targetRole: 'Chief Vibes Officer' },
        { userId: USER_ID }
      )
    ).rejects.toThrow(/supported target role/i);

    expect(executeChatCompletionMock).not.toHaveBeenCalled();
  });
});

describe('different modes take genuinely different agent paths', () => {
  it('runs one specialist for general and a different one for jd', async () => {
    // ── General ──
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        {
          toolCalls: [
            call('submit_orchestrated_report', { summary: 'General.', recommendations: [] }),
          ],
        },
      ],
      [EVALUATION]: evaluationScript(),
    };
    const general = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general' },
      { userId: USER_ID }
    );
    const generalAgents = agentsThatRan().sort();
    const generalTools = executedToolsByAgent();
    const generalRows = Object.keys(runRows()).sort();

    // ── JD, same resume, same code ──
    vi.clearAllMocks();
    turnLog = [];
    callCounter = 0;
    profileFindFirst.mockResolvedValue(dbProfile());
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_matching', {})] },
        {
          toolCalls: [call('submit_orchestrated_report', { summary: 'JD.', recommendations: [] })],
        },
      ],
      [MATCHING]: jdMatchScript(),
    };
    const jd = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );
    const jdAgents = agentsThatRan().sort();
    const jdTools = executedToolsByAgent();
    const jdRows = Object.keys(runRows()).sort();

    // Different specialists ran.
    expect(generalAgents).toEqual([EVALUATION, ORCHESTRATOR]);
    expect(jdAgents).toEqual([MATCHING, ORCHESTRATOR]);
    expect(generalAgents).not.toEqual(jdAgents);

    // Different run rows were written — the execution trees differ.
    expect(generalRows).toEqual(['resume-evaluation', 'resume-orchestrator']);
    expect(jdRows).toEqual(['resume-jd-match', 'resume-orchestrator']);

    // Different tools actually executed inside the specialists.
    expect(generalTools['resume-evaluation']).toContain('assess_resume_quality');
    expect(jdTools['resume-jd-match']).toContain('score_against_jd');
    expect(jdTools['resume-jd-match']).not.toContain('assess_resume_quality');

    // And different findings came back.
    expect(general.output.evaluation).toBeDefined();
    expect(general.output.matching).toBeUndefined();
    expect(jd.output.matching).toBeDefined();
    expect(jd.output.evaluation).toBeUndefined();
  });
});

describe('run tracing', () => {
  it('correlates specialists to the orchestrator run', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_matching', {})] },
        { toolCalls: [call('delegate_evaluation', {})] },
        {
          toolCalls: [
            call('submit_orchestrated_report', { summary: 'Both.', recommendations: [] }),
          ],
        },
      ],
      [MATCHING]: jdMatchScript(),
      [EVALUATION]: evaluationScript(),
    };

    const { run } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    const rows = runRows();

    // The orchestrator is the root of its own tree.
    expect(rows['resume-orchestrator'].parentRunId).toBeNull();
    expect(rows['resume-orchestrator'].rootRunId).toBe(run.id);

    // Both specialists point at it and share its root.
    for (const specialist of ['resume-evaluation', 'resume-jd-match']) {
      expect(rows[specialist].parentRunId).toBe(run.id);
      expect(rows[specialist].rootRunId).toBe(run.id);
      expect(rows[specialist].userId).toBe(USER_ID);
    }
  });
});

describe('security across the execution tree', () => {
  beforeEach(() => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('submit_orchestrated_report', { summary: 'x', recommendations: [] })] },
      ],
      [EVALUATION]: evaluationScript(),
    };
  });

  it('scopes every resume read to the authenticated user', async () => {
    await runResumeOrchestrator({ resumeId: RESUME_ID, mode: 'general' }, { userId: USER_ID });

    expect(profileFindFirst).toHaveBeenCalled();
    for (const args of profileFindFirst.mock.calls) {
      const query = args[0] as { where: Record<string, unknown> };
      expect(query.where).toMatchObject({ id: RESUME_ID, userId: USER_ID, isArchived: false });
    }
  });

  it('keeps the resume pinned inside the specialist', async () => {
    // The specialist's model tries to read a different resume.
    scripts[EVALUATION] = [
      { toolCalls: [call('get_resume', { resumeId: OTHER_RESUME_ID })] },
      { toolCalls: [call('get_resume', { resumeId: RESUME_ID })] },
      { toolCalls: [call('assess_resume_quality', { resumeId: RESUME_ID })] },
      {
        toolCalls: [call('submit_evaluation', { assessment: 'ok', recommendations: [] })],
      },
    ];

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general' },
      { userId: USER_ID }
    );

    // The rejected call never reached the database.
    expect(profileFindFirst).toHaveBeenCalledTimes(1);
    const query = profileFindFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(query.where).toMatchObject({ id: RESUME_ID });
    expect(output.evaluation).toBeDefined();
  });

  it('refuses to run without an authenticated user', async () => {
    await expect(
      runResumeOrchestrator({ resumeId: RESUME_ID, mode: 'general' }, { userId: '  ' })
    ).rejects.toThrow(/authenticated user/i);

    expect(executeChatCompletionMock).not.toHaveBeenCalled();
  });

  it('does not carry findings between runs for different resumes', async () => {
    const first = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general' },
      { userId: USER_ID }
    );

    // A second, unrelated resume with different content.
    turnLog = [];
    callCounter = 0;
    profileFindFirst.mockResolvedValue({
      ...dbProfile({ id: OTHER_RESUME_ID, firstName: 'Grace' }),
      workExperiences: [],
      projects: [],
    });
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('submit_orchestrated_report', { summary: 'y', recommendations: [] })] },
      ],
      [EVALUATION]: [
        { toolCalls: [call('get_resume', { resumeId: OTHER_RESUME_ID })] },
        { toolCalls: [call('assess_resume_quality', { resumeId: OTHER_RESUME_ID })] },
        { toolCalls: [call('submit_evaluation', { assessment: 'sparse', recommendations: [] })] },
      ],
    };

    const second = await runResumeOrchestrator(
      { resumeId: OTHER_RESUME_ID, mode: 'general' },
      { userId: USER_ID }
    );

    expect(first.output.resumeId).toBe(RESUME_ID);
    expect(second.output.resumeId).toBe(OTHER_RESUME_ID);

    // Each report describes its own resume: the second has no experience.
    expect(first.output.evaluation!.counts.experiences).toBe(1);
    expect(second.output.evaluation!.counts.experiences).toBe(0);
    expect(second.output.evaluation!.missingSections).toContain('work experience');
  });
});

describe('delegation limits and cancellation', () => {
  it('caps repeated delegation to the same specialist', async () => {
    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('submit_orchestrated_report', { summary: 'x', recommendations: [] })] },
      ],
      [EVALUATION]: [...evaluationScript(), ...evaluationScript()],
    };

    const { output } = await runResumeOrchestrator(
      { resumeId: RESUME_ID, mode: 'general' },
      { userId: USER_ID }
    );

    // ORCHESTRATOR_DELEGATION_LIMITS.maxCallsPerTool is 2.
    const evaluationTurns = turnLog.filter((t) => t.agent === EVALUATION);
    expect(evaluationTurns).toHaveLength(6); // two complete three-turn runs
    expect(output.agentsUsed).toEqual(['resume-evaluation']);

    const refusals = JSON.stringify(
      turnLog.filter((t) => t.agent === ORCHESTRATOR).flatMap((t) => t.messages)
    );
    expect(refusals).toMatch(/already been called 2 times/i);
  });

  it('propagates cancellation from the orchestrator into the specialist', async () => {
    const controller = new AbortController();

    scripts = {
      [ORCHESTRATOR]: [
        { toolCalls: [call('delegate_evaluation', {})] },
        { toolCalls: [call('submit_orchestrated_report', { summary: 'x', recommendations: [] })] },
      ],
      [EVALUATION]: evaluationScript(),
    };

    onTurn = (agent) => {
      if (agent === ORCHESTRATOR) controller.abort();
    };

    await expect(
      runResumeOrchestrator(
        { resumeId: RESUME_ID, mode: 'general' },
        { userId: USER_ID },
        {
          signal: controller.signal,
        }
      )
    ).rejects.toThrow(/cancelled/i);

    // The specialist inherited the signal and never started.
    expect(turnLog.filter((t) => t.agent === EVALUATION)).toHaveLength(0);
  });

  it('fails rather than reporting when no specialist produced findings', async () => {
    // The orchestrator tries to finish without delegating anything.
    scripts[ORCHESTRATOR] = Array.from({ length: 12 }, () => ({
      toolCalls: [call('submit_orchestrated_report', { summary: 'made up', recommendations: [] })],
    }));

    await expect(
      runResumeOrchestrator({ resumeId: RESUME_ID, mode: 'general' }, { userId: USER_ID })
    ).rejects.toThrow(/maxSteps/i);
  });
});

describe('specialists are independently runnable', () => {
  it('runs the Evaluation Agent on its own, with no orchestrator', async () => {
    scripts[EVALUATION] = evaluationScript();

    const { output, run } = await runEvaluationAgent({ resumeId: RESUME_ID }, { userId: USER_ID });

    expect(run.status).toBe('succeeded');
    expect(agentsThatRan()).toEqual([EVALUATION]);
    expect(output.counts.totalBullets).toBe(2);
    expect(output.metricCoveragePercent).toBe(50);
  });

  it('runs the Matching Agent on its own, with no orchestrator', async () => {
    scripts[MATCHING] = jdMatchScript();

    const { output, run } = await runJdMatchAgent(
      { resumeId: RESUME_ID, target: 'jd', jobDescription: BACKEND_JD },
      { userId: USER_ID }
    );

    expect(run.status).toBe('succeeded');
    expect(agentsThatRan()).toEqual([MATCHING]);
    expect(output.jdMatch!.score).not.toBe(99);
    expect(output.keywords!.absentFromResume).toContain('terraform');
  });
});
