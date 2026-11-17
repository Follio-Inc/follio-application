import { beforeEach, describe, expect, it, vi } from 'vitest';

import { zodToOpenAIParameters } from '@/lib/agents/define-tool';
import { createAgentMemory } from '@/lib/agents/memory';
import { buildEditFacts, type EditSourceProfile } from '@/services/ai/resume-edit/facts';
import {
  AGENT_VIA,
  MEMORY_RESUME_LINES,
  MEMORY_RESUME_LINES_ID,
  proposeResumeEditsTool,
  readResumeLinesTool,
  type ProposeResumeEditsResult,
  type ResumeLinesView,
} from '@/services/agents/resume/edit-tools';
import { MEMORY_JOB_DESCRIPTION, MEMORY_SCORED_RESUME_ID } from '@/services/agents/resume/jd-tools';
import { pinnedToSelectedResume, SELECTED_RESUME_META_KEY } from '@/services/agents/resume/pinning';

import type { AgentToolContext } from '@/types/agents';

const {
  requireOwnedResume,
  getEditableResume,
  executeAICall,
  executeChatCompletion,
  profileFindUnique,
  profileFindFirst,
  userFindUnique,
  sessionFindMany,
  sessionCreate,
  mutations,
} = vi.hoisted(() => ({
  requireOwnedResume: vi.fn(),
  getEditableResume: vi.fn(),
  executeAICall: vi.fn(),
  executeChatCompletion: vi.fn(),
  profileFindUnique: vi.fn(),
  profileFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionCreate: vi.fn(),
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

vi.mock('@/lib/ai-client', () => ({
  executeAICall,
  executeChatCompletion,
  isAIAvailable: () => true,
}));

// Keep the real ResumeRefSchema; stub only the database-backed lookup.
vi.mock('@/lib/ai-connector/resume-target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai-connector/resume-target')>()),
  requireOwnedResume,
}));

// Only `getEditableResume` is stubbed. `createAssistantResumeEditSession` stays
// real, so the proposal tests exercise the actual grounding — the whole point
// of the safety checks is that they are not mocked away.
vi.mock('@/services/resume-edit-session.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/resume-edit-session.service')>()),
  getEditableResume,
}));

vi.mock('@/lib/db', () => ({
  db: {
    profile: {
      ...mutations,
      findUnique: profileFindUnique,
      findMany: vi.fn(),
      findFirst: profileFindFirst,
    },
    user: { ...mutations, findUnique: userFindUnique, findMany: vi.fn() },
    // `create` is its own spy: writing a pending session row is the one write
    // a proposal is allowed to cause, so it must not trip the mutation guard.
    resumeEditSession: {
      ...mutations,
      findFirst: vi.fn(),
      findMany: sessionFindMany,
      create: sessionCreate,
    },
    ...mutations,
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESUME_ID = 'p1';

/**
 * Role 1 is a plain bullet list, so it is editable. Role 2 stores paragraphs
 * in `bulletsHtml` with no list items, which `readBullets` reports as
 * read-only — the distinction this tool has to preserve.
 */
const resumeProfile: EditSourceProfile = {
  headline: 'Backend Engineer',
  summary: 'Engineer building payment systems in Python.',
  workExperiences: [
    {
      id: 'exp-acme',
      company: 'Acme',
      role: 'Backend Engineer',
      startDate: new Date('2022-01-01'),
      endDate: null,
      isCurrent: true,
      bullets: [
        'Built Python services that cut checkout latency 30%',
        'Tuned PostgreSQL queries to handle 2x traffic',
      ],
      bulletsHtml: null,
      isVisible: true,
    },
    {
      id: 'exp-globex',
      company: 'Globex',
      role: 'Engineer',
      startDate: new Date('2019-01-01'),
      endDate: new Date('2021-12-01'),
      isCurrent: false,
      bullets: [],
      bulletsHtml: '<p>Led the platform team.</p><p>Owned the deploy pipeline.</p>',
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
    meta: { [SELECTED_RESUME_META_KEY]: RESUME_ID },
    ...overrides,
  };
}

/** `AgentTool.execute` returns `unknown` by contract. */
async function readLines(
  input: { resumeId: string },
  ctx: AgentToolContext
): Promise<ResumeLinesView> {
  return (await readResumeLinesTool.execute(input, ctx)) as ResumeLinesView;
}

type Role = ResumeLinesView['roles'][number];

/** Narrow on the discriminant rather than optional-chaining past it. */
function asEditableRole(role: Role) {
  if (!('bullets' in role)) {
    throw new Error(`Expected role ${role.ref} to be editable, got a read-only one`);
  }
  return role;
}

function asReadOnlyRole(role: Role) {
  if (!('note' in role)) {
    throw new Error(`Expected role ${role.ref} to be read-only, got an editable one`);
  }
  return role;
}

function expectNoMutations() {
  for (const [name, spy] of Object.entries(mutations)) {
    expect(spy, `db.${name} must never be called by a read-only tool`).not.toHaveBeenCalled();
  }
}

function expectNoModelCalls() {
  expect(executeAICall).not.toHaveBeenCalled();
  expect(executeChatCompletion).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwnedResume.mockResolvedValue({
    resumeId: RESUME_ID,
    title: 'Backend',
    handle: 'alex-be',
  });
  getEditableResume.mockResolvedValue(facts());

  // These serve the real createAssistantResumeEditSession.
  userFindUnique.mockResolvedValue({ id: 'user-1', profile: { id: RESUME_ID } });
  profileFindFirst.mockResolvedValue({ id: RESUME_ID });
  profileFindUnique.mockResolvedValue(resumeProfile);
  sessionFindMany.mockResolvedValue([]);
  sessionCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'session-1',
      profileId: data.profileId,
      brief: data.brief,
      changes: data.changes,
      droppedCount: data.droppedCount,
      failedSections: data.failedSections,
      createdAt: new Date('2026-11-16T00:00:00.000Z'),
    })
  );
});

const JOB_DESCRIPTION =
  'Senior Backend Engineer. Requirements: Python, PostgreSQL, Kubernetes. Build payment services.';

/** A context that has analyzed the posting, scored the resume, and read its lines. */
function readyContext(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  const ctx = toolContext(overrides);
  ctx.memory.set(MEMORY_RESUME_LINES_ID, RESUME_ID);
  ctx.memory.set(MEMORY_JOB_DESCRIPTION, JOB_DESCRIPTION);
  ctx.memory.set(MEMORY_SCORED_RESUME_ID, RESUME_ID);
  return ctx;
}

async function propose(
  input: {
    resumeId: string;
    request: string;
    changes: Array<{ ref: string; text: string; reason?: string }>;
  },
  ctx: AgentToolContext
): Promise<ProposeResumeEditsResult> {
  return (await proposeResumeEditsTool.execute(input, ctx)) as ProposeResumeEditsResult;
}

// ---------------------------------------------------------------------------

describe('read_resume_lines — definition', () => {
  it('is registered under the name the agent prompt uses', () => {
    expect(readResumeLinesTool.name).toBe('read_resume_lines');
    expect(readResumeLinesTool.description).toContain('Read-only');
  });

  it('converts cleanly for OpenAI tool calling', () => {
    const json = zodToOpenAIParameters(readResumeLinesTool.inputSchema);
    const properties = json.properties as Record<string, Record<string, unknown>>;

    expect(json.type).toBe('object');
    expect(json.required).toEqual(['resumeId']);
    expect(json.additionalProperties).toBe(false);
    expect(properties.resumeId.type).toBe('string');
    expect(properties.resumeId.description).toContain('list_resumes');
  });

  it('rejects a missing or blank resumeId at the schema', () => {
    expect(readResumeLinesTool.inputSchema.safeParse({}).success).toBe(false);
    expect(readResumeLinesTool.inputSchema.safeParse({ resumeId: '   ' }).success).toBe(false);
  });
});

describe('read_resume_lines — line references', () => {
  it('returns the headline and summary refs', async () => {
    const lines = await readLines({ resumeId: RESUME_ID }, toolContext());

    expect(lines.headline).toEqual({ ref: 'H', text: 'Backend Engineer' });
    expect(lines.summary.ref).toBe('S');
    expect(lines.summary.text).toContain('payment systems');
  });

  it('preserves bullet refs for an editable role', async () => {
    const lines = await readLines({ resumeId: RESUME_ID }, toolContext());
    const acme = asEditableRole(lines.roles[0]);

    expect(acme.ref).toBe('E1');
    expect(acme.bullets.map((bullet) => bullet.ref)).toEqual(['E1.1', 'E1.2']);
    expect(acme.bullets[0].text).toContain('Built Python services');
  });

  it('marks a role stored as paragraphs read-only and gives it no bullet refs', async () => {
    const lines = await readLines({ resumeId: RESUME_ID }, toolContext());
    const globex = asReadOnlyRole(lines.roles[1]);

    expect(globex.ref).toBe('E2');
    expect(globex).not.toHaveProperty('bullets');
    expect(globex.note).toMatch(/read-only/i);
    expect(globex.text).toEqual(['Led the platform team.', 'Owned the deploy pipeline.']);
  });

  it('returns the writing checks and playbooks the proposal step needs', async () => {
    const lines = await readLines({ resumeId: RESUME_ID }, toolContext());

    expect(lines.scores.checks.length).toBeGreaterThan(0);
    expect(lines.writingGuide.playbooks.length).toBeGreaterThan(0);
    expect(lines.skills).toEqual(expect.arrayContaining(['Python', 'PostgreSQL']));
  });

  it('caches the view in agent memory for the proposal step', async () => {
    const ctx = toolContext();
    const lines = await readLines({ resumeId: RESUME_ID }, ctx);

    expect(ctx.memory.get(MEMORY_RESUME_LINES)).toEqual(lines);
  });

  it('reads the facts for the owned resume through the existing services', async () => {
    await readLines({ resumeId: RESUME_ID }, toolContext());

    expect(requireOwnedResume).toHaveBeenCalledWith('user-1', RESUME_ID);
    expect(getEditableResume).toHaveBeenCalledWith('clerk_1', RESUME_ID);
  });
});

describe('read_resume_lines — authentication and ownership', () => {
  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('rejects a %s userId before touching the database', async (_label, userId) => {
    await expect(readLines({ resumeId: RESUME_ID }, toolContext({ userId }))).rejects.toThrow(
      /authenticated user/i
    );

    expect(requireOwnedResume).not.toHaveBeenCalled();
    expect(getEditableResume).not.toHaveBeenCalled();
  });

  it.each([
    ['undefined', undefined],
    ['whitespace-only', '  '],
  ])('rejects a %s clerkId before touching the database', async (_label, clerkId) => {
    await expect(readLines({ resumeId: RESUME_ID }, toolContext({ clerkId }))).rejects.toThrow(
      /Clerk identity/i
    );

    expect(requireOwnedResume).not.toHaveBeenCalled();
    expect(getEditableResume).not.toHaveBeenCalled();
  });

  it('propagates an ownership failure and never loads the facts', async () => {
    requireOwnedResume.mockRejectedValue(new Error('No resume matches p9.'));

    await expect(readLines({ resumeId: 'p9' }, toolContext())).rejects.toThrow(/No resume matches/);

    expect(getEditableResume).not.toHaveBeenCalled();
  });

  it('leaves nothing in memory when the read fails', async () => {
    requireOwnedResume.mockRejectedValue(new Error('No resume matches p9.'));
    const ctx = toolContext();

    await expect(readLines({ resumeId: 'p9' }, ctx)).rejects.toThrow();

    expect(ctx.memory.get(MEMORY_RESUME_LINES)).toBeUndefined();
  });
});

describe('read_resume_lines — resume pinning', () => {
  // Part 5C registers this tool wrapped, exactly as below.
  const pinned = pinnedToSelectedResume(readResumeLinesTool);

  it('refuses a resumeId other than the selected one', async () => {
    await expect(
      pinned.execute({ resumeId: 'someone-elses-resume' }, toolContext())
    ).rejects.toThrow(/only the resume the user selected/i);

    expect(requireOwnedResume).not.toHaveBeenCalled();
    expect(getEditableResume).not.toHaveBeenCalled();
  });

  it('allows the selected resume through', async () => {
    const lines = (await pinned.execute({ resumeId: RESUME_ID }, toolContext())) as ResumeLinesView;

    expect(lines.headline.ref).toBe('H');
  });

  it('refuses when no resume was pinned for the run', async () => {
    await expect(
      pinned.execute({ resumeId: RESUME_ID }, toolContext({ meta: {} }))
    ).rejects.toThrow(/No resume was selected/i);
  });
});

describe('read_resume_lines — read-only guarantees', () => {
  it('never issues a database mutation', async () => {
    await readLines({ resumeId: RESUME_ID }, toolContext());
    expectNoMutations();
  });

  it('never creates a resume edit session', async () => {
    await readLines({ resumeId: RESUME_ID }, toolContext());

    // The create spy is shared with db.resumeEditSession in the mock above.
    expect(mutations.create).not.toHaveBeenCalled();
    expect(mutations.upsert).not.toHaveBeenCalled();
  });

  it('makes no model call', async () => {
    await readLines({ resumeId: RESUME_ID }, toolContext());
    expectNoModelCalls();
  });
});

// ---------------------------------------------------------------------------
// propose_resume_edits
// ---------------------------------------------------------------------------

describe('propose_resume_edits — definition', () => {
  it('is registered and says it cannot apply anything', () => {
    expect(proposeResumeEditsTool.name).toBe('propose_resume_edits');
    expect(proposeResumeEditsTool.description).toMatch(/NOT changed/);
    expect(proposeResumeEditsTool.description).toMatch(/cannot apply/i);
  });

  it('converts cleanly for OpenAI tool calling', () => {
    const json = zodToOpenAIParameters(proposeResumeEditsTool.inputSchema);
    const properties = json.properties as Record<string, Record<string, unknown>>;

    expect(json.type).toBe('object');
    expect(json.required).toEqual(['resumeId', 'request', 'changes']);
    expect(properties.changes.type).toBe('array');

    const item = properties.changes.items as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(item.properties)).toEqual(['ref', 'text', 'reason']);
    expect(item.required).toEqual(['ref', 'text']);
  });

  it('accepts only summary and existing-bullet refs', () => {
    const accepts = (ref: string) =>
      proposeResumeEditsTool.inputSchema.safeParse({
        resumeId: RESUME_ID,
        request: 'Tailor it',
        changes: [{ ref, text: 'Some rewritten line.' }],
      }).success;

    expect(accepts('S')).toBe(true);
    expect(accepts('E1.2')).toBe(true);
    // Headline, inserts, and anything else are out of scope for this version.
    expect(accepts('H')).toBe(false);
    expect(accepts('E1.2+')).toBe(false);
    expect(accepts('E1.0')).toBe(false);
    expect(accepts('P1')).toBe(false);
  });

  it('has no way to delete a line or supply userFacts', () => {
    const parsed = proposeResumeEditsTool.inputSchema.safeParse({
      resumeId: RESUME_ID,
      request: 'Trim it',
      changes: [{ ref: 'E1.1', remove: true }],
      userFacts: 'I led a team of 40',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('propose_resume_edits — grounded proposals', () => {
  it('saves a summary rewrite as a pending session', async () => {
    const result = await propose(
      {
        resumeId: RESUME_ID,
        request: 'Tailor the summary to the posting',
        changes: [
          {
            ref: 'S',
            text: 'Backend engineer building payment systems in Python and PostgreSQL.',
            reason: 'Names the stack the posting asks for',
          },
        ],
      },
      readyContext()
    );

    expect(result.sessionId).toBe('session-1');
    expect(result.proposed).toBe(1);
    expect(result.dropped).toBe(0);
    expect(result.changes[0]).toMatchObject({ status: 'proposed' });
    expect(result.message).toMatch(/resume is unchanged/i);
  });

  it('saves an experience-bullet rewrite as a pending session', async () => {
    const result = await propose(
      {
        resumeId: RESUME_ID,
        request: 'Lead with the outcome',
        changes: [{ ref: 'E1.1', text: 'Cut checkout latency 30% by building Python services.' }],
      },
      readyContext()
    );

    expect(result.proposed).toBe(1);
    expect(result.changes[0]).toMatchObject({ where: 'Backend Engineer · Acme' });
  });

  it('records the session against the agent and the selected resume', async () => {
    await propose(
      {
        resumeId: RESUME_ID,
        request: 'Tailor the summary',
        changes: [{ ref: 'S', text: 'Backend engineer building payment systems in Python.' }],
      },
      readyContext()
    );

    const { data } = sessionCreate.mock.calls[0][0] as {
      data: { userId: string; profileId: string; brief: { via: string; jobDescription: string } };
    };
    expect(data.userId).toBe('user-1');
    expect(data.profileId).toBe(RESUME_ID);
    expect(data.brief.via).toBe(AGENT_VIA);
    expect(data.brief.jobDescription).toBe(JOB_DESCRIPTION);
  });

  it('keeps the original text for before/after review', async () => {
    const result = await propose(
      {
        resumeId: RESUME_ID,
        request: 'Tighten the summary',
        changes: [{ ref: 'S', text: 'Backend engineer building payment systems in Python.' }],
      },
      readyContext()
    );

    expect(result.changes[0]).toMatchObject({
      before: 'Engineer building payment systems in Python.',
    });
  });
});

describe('propose_resume_edits — real grounding', () => {
  it('drops a rewrite claiming a tool the resume never shows', async () => {
    const result = await propose(
      {
        resumeId: RESUME_ID,
        request: 'Match the posting',
        changes: [{ ref: 'E1.1', text: 'Built Python services on Kubernetes clusters.' }],
      },
      readyContext()
    );

    expect(result.dropped).toBe(1);
    expect(result.proposed).toBe(0);
    expect(result.sessionId).toBeNull();
  });

  it('blanks an added number the resume never stated', async () => {
    const result = await propose(
      {
        resumeId: RESUME_ID,
        request: 'Add scale',
        changes: [
          {
            ref: 'E1.1',
            // Keeps the real 30%, adds a "12" that appears nowhere on the resume.
            text: 'Built Python services across 12 teams that cut checkout latency 30%.',
          },
        ],
      },
      readyContext()
    );

    expect(result.proposed).toBe(1);
    expect(result.needsInput).toBe(1);
    expect(String(result.changes[0].after)).toContain('[__]');
    expect(String(result.changes[0].after)).not.toContain('12');
    expect(String(result.changes[0].after)).toContain('30%');
    expect(result.message).toMatch(/never stated/i);
  });

  it('refuses a rewrite that would erase a figure the resume states', async () => {
    const result = await propose(
      {
        resumeId: RESUME_ID,
        request: 'Inflate the number',
        // The real line says "2x traffic". Swapping in 9x blanks the invented
        // number, which would drop the stated one — grounding keeps the line.
        changes: [{ ref: 'E1.2', text: 'Tuned PostgreSQL queries to handle 9x traffic.' }],
      },
      readyContext()
    );

    expect(result.proposed).toBe(0);
    expect(result.sessionId).toBeNull();
  });

  it('reports no session when every change is dropped', async () => {
    const result = await propose(
      {
        resumeId: RESUME_ID,
        request: 'Match the posting',
        changes: [
          { ref: 'E1.1', text: 'Built Python services on Kubernetes clusters.' },
          { ref: 'E1.2', text: 'Tuned PostgreSQL queries with Terraform and Datadog.' },
        ],
      },
      readyContext()
    );

    expect(result.sessionId).toBeNull();
    expect(result.proposed).toBe(0);
    expect(result.dropped).toBeGreaterThan(0);
    expect(result.message).toMatch(/No suggestions were saved/i);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('ignores a ref that is not a real editable line', async () => {
    const result = await propose(
      {
        resumeId: RESUME_ID,
        request: 'Rewrite a line that does not exist',
        changes: [{ ref: 'E9.9', text: 'Something about a role that is not on the resume.' }],
      },
      readyContext()
    );

    expect(result.proposed).toBe(0);
    expect(result.ignored).toBe(1);
    expect(result.sessionId).toBeNull();
  });

  it('ignores a bullet ref inside a read-only role', async () => {
    const result = await propose(
      {
        resumeId: RESUME_ID,
        request: 'Rewrite the Globex role',
        changes: [{ ref: 'E2.1', text: 'Led the platform team and owned the deploy pipeline.' }],
      },
      readyContext()
    );

    expect(result.proposed).toBe(0);
    expect(result.sessionId).toBeNull();
  });
});

describe('propose_resume_edits — prerequisites', () => {
  const change = { ref: 'S', text: 'Backend engineer building payment systems in Python.' };

  it('refuses when no job posting has been analyzed', async () => {
    const ctx = toolContext();
    ctx.memory.set(MEMORY_RESUME_LINES_ID, RESUME_ID);

    await expect(
      propose({ resumeId: RESUME_ID, request: 'Tailor it', changes: [change] }, ctx)
    ).rejects.toThrow(/analyze_job_description first/i);

    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses when the resume lines were never read', async () => {
    const ctx = toolContext();
    ctx.memory.set(MEMORY_JOB_DESCRIPTION, JOB_DESCRIPTION);

    await expect(
      propose({ resumeId: RESUME_ID, request: 'Tailor it', changes: [change] }, ctx)
    ).rejects.toThrow(/read_resume_lines for this resume first/i);

    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses line context belonging to a different resume', async () => {
    const ctx = readyContext();
    ctx.memory.set(MEMORY_RESUME_LINES_ID, 'a-different-resume');

    await expect(
      propose({ resumeId: RESUME_ID, request: 'Tailor it', changes: [change] }, ctx)
    ).rejects.toThrow(/belong to a different resume/i);

    expect(sessionCreate).not.toHaveBeenCalled();
  });
});

describe('propose_resume_edits — authentication, ownership and pinning', () => {
  const change = { ref: 'S', text: 'Backend engineer building payment systems in Python.' };

  it('rejects a missing userId before any database access', async () => {
    await expect(
      propose(
        { resumeId: RESUME_ID, request: 'Tailor it', changes: [change] },
        readyContext({ userId: '   ' })
      )
    ).rejects.toThrow(/authenticated user/i);

    expect(requireOwnedResume).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('rejects a missing clerkId before any database access', async () => {
    await expect(
      propose(
        { resumeId: RESUME_ID, request: 'Tailor it', changes: [change] },
        readyContext({ clerkId: undefined })
      )
    ).rejects.toThrow(/Clerk identity/i);

    expect(requireOwnedResume).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('propagates an ownership failure without creating a session', async () => {
    requireOwnedResume.mockRejectedValue(new Error('No resume matches p9.'));

    await expect(
      propose({ resumeId: 'p9', request: 'Tailor it', changes: [change] }, readyContext())
    ).rejects.toThrow(/No resume matches/);

    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses a substituted resumeId through the pinning wrapper', async () => {
    const pinned = pinnedToSelectedResume(proposeResumeEditsTool);

    await expect(
      pinned.execute(
        { resumeId: 'someone-elses-resume', request: 'Tailor it', changes: [change] },
        readyContext()
      )
    ).rejects.toThrow(/only the resume the user selected/i);

    expect(requireOwnedResume).not.toHaveBeenCalled();
    expect(sessionCreate).not.toHaveBeenCalled();
  });
});

describe('propose_resume_edits — read-only guarantees', () => {
  const change = { ref: 'S', text: 'Backend engineer building payment systems in Python.' };

  it('writes a pending session but never touches the resume', async () => {
    await propose({ resumeId: RESUME_ID, request: 'Tailor it', changes: [change] }, readyContext());

    expect(sessionCreate).toHaveBeenCalledTimes(1);
    // Everything that would alter the resume itself stays untouched.
    expectNoMutations();
  });

  it('leaves every change pending the user approval', async () => {
    const result = await propose(
      { resumeId: RESUME_ID, request: 'Tailor it', changes: [change] },
      readyContext()
    );

    expect(result.changes.every((item) => item.status === 'proposed')).toBe(true);
    expect(result.message).toMatch(/resume is unchanged/i);
  });

  it('makes no model call', async () => {
    await propose({ resumeId: RESUME_ID, request: 'Tailor it', changes: [change] }, readyContext());
    expectNoModelCalls();
  });

  it('exposes no apply or revert capability in its contract', () => {
    const schemaKeys = Object.keys(
      (zodToOpenAIParameters(proposeResumeEditsTool.inputSchema).properties ?? {}) as object
    );
    expect(schemaKeys).toEqual(['resumeId', 'request', 'changes']);
  });
});
