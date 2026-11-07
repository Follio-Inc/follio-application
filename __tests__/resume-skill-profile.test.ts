import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashSkillLines } from '@/services/ai/resume-skills/extract';
import { buildResumeSkillsUserPrompt } from '@/services/ai/resume-skills/prompt';
import { buildEditFacts, type EditSourceProfile } from '@/services/ai/resume-edit/facts';
import { readSkillLines } from '@/services/ai/skills/profile';
import { SKILL_PROFILE_VERSION } from '@/services/ai/skills/types';

const { executeAICall, findUnique, update } = vi.hoisted(() => ({
  executeAICall: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/ai-client', () => ({ executeAICall, isAIAvailable: () => true }));
vi.mock('@/lib/db', () => ({ db: { profile: { findUnique, update } } }));

const source: EditSourceProfile = {
  headline: 'Data Engineer',
  summary: '',
  workExperiences: [
    {
      id: 'exp-1',
      company: 'Acme',
      role: 'Data Engineer',
      startDate: new Date('2022-01-01'),
      endDate: null,
      isCurrent: true,
      bullets: ['Tuned slow warehouse queries with indexes'],
      bulletsHtml: null,
      isVisible: true,
    },
  ],
  skills: [{ name: 'Python' }],
  educations: [],
  certifications: [],
  projects: [],
};
const lines = readSkillLines(buildEditFacts(source));

function respond(stored: unknown) {
  findUnique.mockImplementation(({ select }: { select: Record<string, boolean> }) =>
    Promise.resolve(select.resumeSkillProfile ? { resumeSkillProfile: stored } : source)
  );
}

describe('the skill read prompt', () => {
  it('lists every line under its section with its ref', () => {
    const prompt = buildResumeSkillsUserPrompt(lines);
    expect(prompt).toContain('EXPERIENCE\n[E1] Data Engineer · Acme\n[E1.1] Tuned slow');
    expect(prompt).toContain('SKILLS LIST\n[K1] Python');
  });
});

describe('refreshResumeSkillProfile', () => {
  beforeEach(() => {
    executeAICall.mockReset();
    findUnique.mockReset();
    update.mockReset();
  });

  it('skips the model when no line changed since the last read', async () => {
    respond({
      version: SKILL_PROFILE_VERSION,
      sourceHash: hashSkillLines(lines),
      generatedAt: '2026-10-01T00:00:00.000Z',
      lines: {},
      skills: [],
    });
    const { refreshResumeSkillProfile } = await import('@/services/resume-skill-profile.service');
    await refreshResumeSkillProfile('profile-1');
    expect(executeAICall).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('reads changed lines and saves only skills tied to real lines', async () => {
    respond(null);
    executeAICall.mockResolvedValue({
      data: {
        skills: [
          {
            label: 'SQL',
            kind: 'tool',
            aliases: [],
            broader: ['Relational databases'],
            refs: ['E1.1'],
          },
          { label: 'Made up', kind: 'tool', refs: ['E7.1'] },
        ],
      },
    });
    const { refreshResumeSkillProfile } = await import('@/services/resume-skill-profile.service');
    await refreshResumeSkillProfile('profile-2');

    expect(executeAICall.mock.calls[0]?.[0]).toMatchObject({
      stage: 'resumeSkills',
      taskType: 'extraction',
    });
    const saved = update.mock.calls[0]?.[0]?.data?.resumeSkillProfile;
    expect(saved).toMatchObject({
      version: SKILL_PROFILE_VERSION,
      sourceHash: hashSkillLines(lines),
      lines: { 'E1.1': 'Tuned slow warehouse queries with indexes' },
      skills: [{ label: 'SQL', refs: ['E1.1'], broader: ['Relational databases'] }],
    });
  });

  it('keeps the previous read when the model fails', async () => {
    respond(null);
    executeAICall.mockRejectedValue(new Error('timeout'));
    const { refreshResumeSkillProfile } = await import('@/services/resume-skill-profile.service');
    await expect(refreshResumeSkillProfile('profile-3')).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});
