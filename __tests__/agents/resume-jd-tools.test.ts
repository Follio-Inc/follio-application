import { beforeEach, describe, expect, it, vi } from 'vitest';

import { zodToOpenAIParameters } from '@/lib/agents/define-tool';
import { createAgentMemory } from '@/lib/agents/memory';
import { buildEditFacts, type EditSourceProfile } from '@/services/ai/resume-edit/facts';
import {
  analyzeJobDescriptionTool,
  MEMORY_JOB_DESCRIPTION,
  MEMORY_JOB_REQUIREMENTS,
  scoreResumeAgainstJdTool,
} from '@/services/agents/resume/jd-tools';

import type { ResumeEvaluation } from '@/services/ai/evaluate';
import type { JobRequirement } from '@/services/ai/job-requirements';
import type { AgentToolContext } from '@/types/agents';

const { executeAICall, requireOwnedResume, getEditableResume, mutations } = vi.hoisted(() => ({
  executeAICall: vi.fn(),
  requireOwnedResume: vi.fn(),
  getEditableResume: vi.fn(),
  mutations: {
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  },
}));

// The real readJobRequirements runs, so its cache and null-handling are
// exercised for real; only the model call underneath is faked.
vi.mock('@/lib/ai-client', () => ({ executeAICall, isAIAvailable: () => true }));

// Keep the real ResumeRefSchema, stub only the database-backed lookup.
vi.mock('@/lib/ai-connector/resume-target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai-connector/resume-target')>()),
  requireOwnedResume,
}));

vi.mock('@/services/resume-edit-session.service', () => ({ getEditableResume }));

vi.mock('@/lib/db', () => ({
  db: {
    profile: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), ...mutations },
    user: { findUnique: vi.fn(), findMany: vi.fn(), ...mutations },
    ...mutations,
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Each test that reaches the model uses its own posting text: readJobRequirements
 * caches per posting at module scope, and that cache outlives a single test.
 */
function posting(marker: string): string {
  return `Senior Backend Engineer at ${marker}

Requirements
Build backend services in Python. Work with PostgreSQL databases daily.
Kubernetes experience is required for this role.

Benefits
Medical, dental, vision. Flexible PTO and a wellness stipend.`;
}

function modelRequirements() {
  return {
    data: {
      requirements: [
        { term: 'Python', kind: 'tool', importance: 'required', aliases: [], broader: [] },
        {
          term: 'PostgreSQL',
          kind: 'tool',
          importance: 'required',
          aliases: ['Postgres'],
          broader: [],
        },
        {
          term: 'Kubernetes',
          kind: 'tool',
          importance: 'required',
          aliases: ['k8s'],
          broader: [],
        },
      ],
    },
  };
}

/** Resume shows Python and PostgreSQL. It never mentions Kubernetes. */
const resumeProfile: EditSourceProfile = {
  headline: 'Backend Engineer',
  summary: 'Engineer building payment systems in Python.',
  workExperiences: [
    {
      id: 'exp-acme',
      company: 'Acme',
      role: 'Backend Engineer',
      startDate: new Date('2020-01-01'),
      endDate: null,
      isCurrent: true,
      bullets: [
        'Built Python services that cut checkout latency 30%',
        'Tuned PostgreSQL queries to handle 2x traffic',
      ],
      bulletsHtml: null,
      isVisible: true,
    },
  ],
  skills: [{ name: 'Python' }, { name: 'PostgreSQL' }],
  educations: [{ institution: 'State University', degree: 'BS', fieldOfStudy: 'Computer Science' }],
  certifications: [],
  projects: [],
};

function facts() {
  return buildEditFacts(resumeProfile);
}

function toolContext(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    runId: 'run-1',
    memory: createAgentMemory(),
    userId: 'user-1',
    clerkId: 'clerk_1',
    ...overrides,
  };
}

function expectNoMutations() {
  for (const [name, spy] of Object.entries(mutations)) {
    expect(spy, `db.${name} must never be called by a read-only tool`).not.toHaveBeenCalled();
  }
}

/**
 * `AgentTool.execute` returns `unknown` by contract, since the runtime hands
 * tool results straight to the model. These helpers restore the concrete type
 * each tool documents, so the assertions below stay checked.
 */
async function analyze(jobDescription: string, ctx: AgentToolContext) {
  return (await analyzeJobDescriptionTool.execute({ jobDescription }, ctx)) as {
    requirements: JobRequirement[];
    requirementCount: number;
    note: string;
  };
}

async function score(
  input: { resumeId: string; jobDescription?: string },
  ctx: AgentToolContext
): Promise<ResumeEvaluation> {
  return (await scoreResumeAgainstJdTool.execute(input, ctx)) as ResumeEvaluation;
}

/** Put an analyzed posting into memory without asserting on the model call. */
async function withAnalyzedJd(marker: string, ctx: AgentToolContext) {
  executeAICall.mockResolvedValue(modelRequirements());
  await analyzeJobDescriptionTool.execute({ jobDescription: posting(marker) }, ctx);
  executeAICall.mockClear();
  return posting(marker);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwnedResume.mockResolvedValue({ resumeId: 'p1', title: 'Backend', handle: 'alex-be' });
  getEditableResume.mockResolvedValue(facts());
});

// ---------------------------------------------------------------------------
// analyze_job_description
// ---------------------------------------------------------------------------

describe('analyze_job_description', () => {
  it('extracts the posting requirements', async () => {
    executeAICall.mockResolvedValue(modelRequirements());

    const result = await analyze(posting('extract-ok'), toolContext());

    expect(result.requirementCount).toBe(3);
    expect(result.requirements.map((r) => r.term)).toEqual(
      expect.arrayContaining(['Python', 'PostgreSQL', 'Kubernetes'])
    );
  });

  it('caches the posting and its requirements in agent memory', async () => {
    executeAICall.mockResolvedValue(modelRequirements());
    const ctx = toolContext();

    await analyzeJobDescriptionTool.execute({ jobDescription: posting('memory') }, ctx);

    expect(ctx.memory.get(MEMORY_JOB_DESCRIPTION)).toBe(
      posting('memory').replace(/\s+/g, ' ').trim()
    );
    expect(ctx.memory.get<unknown[]>(MEMORY_JOB_REQUIREMENTS)).toHaveLength(3);
  });

  it('treats a null extraction as a failure, not an empty requirement list', async () => {
    executeAICall.mockRejectedValue(new Error('model offline'));
    const ctx = toolContext();

    await expect(
      analyzeJobDescriptionTool.execute({ jobDescription: posting('null-case') }, ctx)
    ).rejects.toThrow(/Could not read this posting/i);

    expect(ctx.memory.get(MEMORY_JOB_REQUIREMENTS)).toBeUndefined();
  });

  it('preserves the existing per-posting extraction cache', async () => {
    executeAICall.mockResolvedValue(modelRequirements());
    const jd = posting('cache-shared');

    await analyzeJobDescriptionTool.execute({ jobDescription: jd }, toolContext());
    await analyzeJobDescriptionTool.execute({ jobDescription: jd }, toolContext());

    expect(executeAICall).toHaveBeenCalledTimes(1);
  });

  it('rejects a posting under the minimum length', () => {
    const parsed = analyzeJobDescriptionTool.inputSchema.safeParse({
      jobDescription: 'Backend engineer wanted.',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a posting over the maximum length', () => {
    const parsed = analyzeJobDescriptionTool.inputSchema.safeParse({
      jobDescription: 'x'.repeat(16_001),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing userId before invoking the model', async () => {
    await expect(
      analyzeJobDescriptionTool.execute(
        { jobDescription: posting('no-auth') },
        toolContext({ userId: undefined })
      )
    ).rejects.toThrow(/authenticated user/i);

    expect(executeAICall).not.toHaveBeenCalled();
    expectNoMutations();
  });
});

// ---------------------------------------------------------------------------
// score_resume_against_jd
// ---------------------------------------------------------------------------

describe('score_resume_against_jd', () => {
  it('evaluates an owned resume against the analyzed posting', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-ok', ctx);

    const evaluation = await score({ resumeId: 'p1' }, ctx);

    expect(evaluation.skills).not.toBeNull();
    expect(evaluation.job).not.toBeNull();
    expect(evaluation.skills?.matches).toHaveLength(3);
  });

  it('scores the EditFacts returned by getEditableResume', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-facts', ctx);

    const evaluation = await score({ resumeId: 'p1' }, ctx);

    expect(getEditableResume).toHaveBeenCalledWith('clerk_1', 'p1');
    // Both bullets from the fixture were graded.
    expect(evaluation.bulletCount).toBe(2);
  });

  it('reuses the posting held in memory when no override is given', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-memory', ctx);

    const evaluation = await score({ resumeId: 'p1' }, ctx);

    expect(evaluation.job?.coverage).not.toBeNull();
    expect(executeAICall).not.toHaveBeenCalled();
  });

  it('accepts an override that is the same posting', async () => {
    const ctx = toolContext();
    const jd = await withAnalyzedJd('score-override-same', ctx);

    const evaluation = await score({ resumeId: 'p1', jobDescription: jd }, ctx);

    expect(evaluation.skills).not.toBeNull();
  });

  it('refuses an override belonging to a different posting', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-override-a', ctx);

    await expect(
      scoreResumeAgainstJdTool.execute(
        { resumeId: 'p1', jobDescription: posting('a-totally-different-company') },
        ctx
      )
    ).rejects.toThrow(/not the one that was analyzed/i);

    expect(getEditableResume).not.toHaveBeenCalled();
  });

  it('fails clearly when no posting has been analyzed', async () => {
    await expect(
      scoreResumeAgainstJdTool.execute({ resumeId: 'p1' }, toolContext())
    ).rejects.toThrow(/analyze_job_description first/i);

    expect(getEditableResume).not.toHaveBeenCalled();
  });

  it('rejects a missing clerkId', async () => {
    const ctx = toolContext({ clerkId: undefined });
    await withAnalyzedJd('score-no-clerk', ctx);

    await expect(scoreResumeAgainstJdTool.execute({ resumeId: 'p1' }, ctx)).rejects.toThrow(
      /Clerk identity/i
    );

    expect(getEditableResume).not.toHaveBeenCalled();
  });

  it('rejects a missing userId', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-no-user', ctx);
    const unauthenticated = { ...ctx, userId: undefined };

    await expect(
      scoreResumeAgainstJdTool.execute({ resumeId: 'p1' }, unauthenticated)
    ).rejects.toThrow(/authenticated user/i);

    expect(requireOwnedResume).not.toHaveBeenCalled();
  });

  it('propagates an ownership failure for a resume the user does not own', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-not-owned', ctx);
    requireOwnedResume.mockRejectedValue(new Error('No resume matches p9.'));

    await expect(scoreResumeAgainstJdTool.execute({ resumeId: 'p9' }, ctx)).rejects.toThrow(
      /No resume matches/
    );

    expect(getEditableResume).not.toHaveBeenCalled();
  });

  it('marks a qualification the resume lacks as missing, with no invented evidence', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-missing', ctx);

    const evaluation = await score({ resumeId: 'p1' }, ctx);
    const kubernetes = evaluation.skills?.matches.find((m) => m.term === 'Kubernetes');

    expect(kubernetes?.match).toBe('missing');
    expect(kubernetes?.evidence).toBe('missing');
    expect(kubernetes?.where).toEqual([]);
    expect(kubernetes?.via).toBeNull();
    expect(kubernetes?.skills).toEqual([]);
  });

  it('keeps the match and evidence grades the resume actually supports', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-grades', ctx);

    const evaluation = await score({ resumeId: 'p1' }, ctx);
    const python = evaluation.skills?.matches.find((m) => m.term === 'Python');

    expect(python?.match).toBe('exact');
    expect(python?.evidence).toBe('shown');
    expect(python?.where.length).toBeGreaterThan(0);
  });

  it('makes no model call while scoring', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-no-ai', ctx);

    await scoreResumeAgainstJdTool.execute({ resumeId: 'p1' }, ctx);

    expect(executeAICall).not.toHaveBeenCalled();
  });

  it('never issues a database mutation', async () => {
    const ctx = toolContext();
    await withAnalyzedJd('score-no-writes', ctx);

    await scoreResumeAgainstJdTool.execute({ resumeId: 'p1' }, ctx);

    expectNoMutations();
  });
});

// ---------------------------------------------------------------------------
// Tool-calling schemas
// ---------------------------------------------------------------------------

describe('jd tool schemas', () => {
  it('exposes analyze_job_description to OpenAI tool calling', () => {
    const json = zodToOpenAIParameters(analyzeJobDescriptionTool.inputSchema);
    const properties = json.properties as Record<string, Record<string, unknown>>;

    expect(analyzeJobDescriptionTool.name).toBe('analyze_job_description');
    expect(json.type).toBe('object');
    expect(json.required).toEqual(['jobDescription']);
    expect(properties.jobDescription.type).toBe('string');
    expect(typeof properties.jobDescription.description).toBe('string');
  });

  it('exposes score_resume_against_jd with an optional override', () => {
    const json = zodToOpenAIParameters(scoreResumeAgainstJdTool.inputSchema);
    const properties = json.properties as Record<string, Record<string, unknown>>;

    expect(scoreResumeAgainstJdTool.name).toBe('score_resume_against_jd');
    expect(json.required).toEqual(['resumeId']);
    expect(properties.resumeId.type).toBe('string');
    expect(properties.jobDescription.type).toBe('string');
    expect(properties.resumeId.description).toContain('list_resumes');
  });
});
