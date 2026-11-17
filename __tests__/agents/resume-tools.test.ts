import { beforeEach, describe, expect, it, vi } from 'vitest';

import { zodToOpenAIParameters } from '@/lib/agents/define-tool';
import { createAgentMemory } from '@/lib/agents/memory';
import { getResumeTool, MEMORY_RESUME } from '@/services/agents/resume/tools';

import type { AgentToolContext } from '@/types/agents';

const { getConnectorProfile, mutations } = vi.hoisted(() => ({
  getConnectorProfile: vi.fn(),
  // Every write path we would ever reach if someone added a direct query to
  // this tool. The tool must never touch any of them.
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

vi.mock('@/services/ai-connector.service', () => ({ getConnectorProfile }));
vi.mock('@/lib/db', () => ({
  db: {
    profile: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), ...mutations },
    user: { findUnique: vi.fn(), findMany: vi.fn(), ...mutations },
    ...mutations,
  },
}));

function resumeView() {
  return {
    resumeId: 'p1',
    title: 'Stripe PM',
    isActive: false,
    handle: 'alex-stripe',
    resumeTitle: 'Stripe PM',
    name: 'Alex Rivera',
    headline: 'Product Manager',
    summary: 'Ships payments products.',
    location: 'San Francisco',
    contact: { email: 'alex@example.com', phone: null, website: null },
    experiences: [
      {
        id: 'e1',
        company: 'Acme',
        role: 'PM',
        location: null,
        startDate: '2022-01-01',
        endDate: null,
        isCurrent: true,
        bullets: ['Launched a billing migration'],
      },
    ],
    education: [],
    skills: ['Roadmapping'],
    projects: [],
  };
}

function toolContext(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    runId: 'run-1',
    memory: createAgentMemory(),
    userId: 'user-1',
    ...overrides,
  };
}

function expectNoMutations() {
  for (const [name, spy] of Object.entries(mutations)) {
    expect(spy, `db.${name} must never be called by a read-only tool`).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('get_resume tool definition', () => {
  it('is registered under the name the agent prompt uses', () => {
    expect(getResumeTool.name).toBe('get_resume');
    expect(getResumeTool.description).toContain('Read-only');
  });

  it('converts cleanly for OpenAI tool calling', () => {
    const json = zodToOpenAIParameters(getResumeTool.inputSchema);
    const properties = json.properties as Record<string, Record<string, unknown>>;

    expect(json.type).toBe('object');
    expect(json.required).toEqual(['resumeId']);
    expect(json.additionalProperties).toBe(false);
    expect(properties.resumeId.type).toBe('string');
    // A ZodEffects (.refine/.transform) would silently degrade to a free-form
    // object and drop the description — guard against that regression.
    expect(typeof properties.resumeId.description).toBe('string');
    expect(properties.resumeId.description).toContain('list_resumes');
  });
});

describe('get_resume input validation', () => {
  it('rejects a missing resumeId', () => {
    const parsed = getResumeTool.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('rejects an empty resumeId', () => {
    expect(getResumeTool.inputSchema.safeParse({ resumeId: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only resumeId', () => {
    expect(getResumeTool.inputSchema.safeParse({ resumeId: '   ' }).success).toBe(false);
  });

  it('accepts and trims a real resumeId', () => {
    const parsed = getResumeTool.inputSchema.safeParse({ resumeId: '  p1  ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.resumeId).toBe('p1');
  });
});

describe('get_resume execution', () => {
  it('returns the resume for an owned resumeId', async () => {
    const view = resumeView();
    getConnectorProfile.mockResolvedValue(view);

    const result = await getResumeTool.execute({ resumeId: 'p1' }, toolContext());

    expect(result).toEqual(view);
  });

  it('calls getConnectorProfile once with the context user and the requested resume', async () => {
    getConnectorProfile.mockResolvedValue(resumeView());

    await getResumeTool.execute({ resumeId: 'p1' }, toolContext({ userId: 'user-42' }));

    expect(getConnectorProfile).toHaveBeenCalledTimes(1);
    expect(getConnectorProfile).toHaveBeenCalledWith('user-42', 'p1');
  });

  it('stores the resume in agent memory for later tools', async () => {
    const view = resumeView();
    getConnectorProfile.mockResolvedValue(view);
    const ctx = toolContext();

    await getResumeTool.execute({ resumeId: 'p1' }, ctx);

    expect(ctx.memory.get(MEMORY_RESUME)).toEqual(view);
  });

  it('never issues a database mutation', async () => {
    getConnectorProfile.mockResolvedValue(resumeView());

    await getResumeTool.execute({ resumeId: 'p1' }, toolContext());

    expectNoMutations();
  });
});

describe('get_resume authorization', () => {
  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('rejects a %s userId before calling the retrieval service', async (_label, userId) => {
    await expect(
      getResumeTool.execute({ resumeId: 'p1' }, toolContext({ userId }))
    ).rejects.toThrow(/authenticated user/i);

    expect(getConnectorProfile).not.toHaveBeenCalled();
    expectNoMutations();
  });

  it('propagates an ownership failure from requireOwnedResume', async () => {
    getConnectorProfile.mockRejectedValue(
      new Error('No resume matches “p9”. Call list_resumes and pass resumeId.')
    );

    await expect(
      getResumeTool.execute({ resumeId: 'p9' }, toolContext({ userId: 'user-1' }))
    ).rejects.toThrow(/No resume matches/);
  });

  it('does not leak a resume into memory when ownership fails', async () => {
    getConnectorProfile.mockRejectedValue(new Error('Resume not found'));
    const ctx = toolContext();

    await expect(getResumeTool.execute({ resumeId: 'p9' }, ctx)).rejects.toThrow();

    expect(ctx.memory.get(MEMORY_RESUME)).toBeUndefined();
    expectNoMutations();
  });
});
