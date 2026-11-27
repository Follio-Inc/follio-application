import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResumeEditBrief } from '@/lib/resume-edit/types';
import { changeEffects, evaluateResume, termForms, termId } from '@/services/ai/evaluate';
import {
  buildJobRequirementsUserPrompt,
  parseJobRequirements,
  readJobRequirements,
  type JobRequirement,
} from '@/services/ai/job-requirements';
import {
  buildEditFacts,
  planBatches,
  type EditSourceProfile,
} from '@/services/ai/resume-edit/facts';
import { planWriting } from '@/services/ai/resume-edit/plan';
import { buildResumeEditUserPrompt } from '@/services/ai/resume-edit/prompt';
import { evaluateSkillMatch, readResumeSkills } from '@/services/ai/skills';

const { executeAICall } = vi.hoisted(() => ({ executeAICall: vi.fn() }));
vi.mock('@/lib/ai-client', () => ({ executeAICall, isAIAvailable: () => true }));

const posting = `About Us
Northwind Payments is reinventing payments for millions of merchants. Our payments platform processes billions. Our culture values ownership, curiosity, and customers. Customers love us.

What you'll do
Build backend services in Python. Run Kubernetes clusters.

Requirements
Python, PostgreSQL, Kubernetes. GraphQL is a plus.

Benefits
Medical, dental, vision. 401(k) with match. Generous parental leave. Flexible PTO. Wellness stipend.

EEO Statement
Northwind is an Equal Opportunity Employer. All qualified applicants will receive consideration without regard to race, color, religion, sex, sexual orientation, gender identity, national origin, disability, or veteran status. We participate in E-Verify. CCPA notice: see our Privacy Policy.`;

const profile: EditSourceProfile = {
  headline: 'Backend Engineer',
  summary: 'Engineer building payment systems.',
  workExperiences: [
    {
      id: 'exp-acme',
      company: 'Acme',
      role: 'Backend Engineer',
      startDate: new Date('2020-01-01'),
      endDate: null,
      isCurrent: true,
      bullets: [
        'Built payment APIs in Python serving 2M requests a day',
        'Cut deploy time 40% with Docker and a microservice rollout',
      ],
      bulletsHtml: null,
      isVisible: true,
    },
  ],
  skills: [{ name: 'Python' }, { name: 'GraphQL, Docker' }],
  educations: [
    { institution: 'State University', degree: 'B.S.', fieldOfStudy: 'Computer Science' },
  ],
  certifications: [],
  projects: [],
};
const facts = buildEditFacts(profile);

const requirements: JobRequirement[] = [
  { term: 'Python', kind: 'tool', importance: 'required', aliases: [] },
  { term: 'Kubernetes', kind: 'tool', importance: 'required', aliases: ['k8s'] },
  { term: 'Computer Science', kind: 'credential', importance: 'required', aliases: [] },
  { term: 'GraphQL', kind: 'tool', importance: 'preferred', aliases: [] },
];

function brief(overrides: Partial<ResumeEditBrief> = {}): ResumeEditBrief {
  return {
    jobDescription: null,
    instructions: null,
    presets: [],
    scope: { kind: 'all' },
    ...overrides,
  };
}

describe('termId and termForms', () => {
  it('collapses written equivalents and singular or plural forms', () => {
    expect(termId('Node.js')).toBe('nodejs');
    expect(termId('Postgres')).toBe('postgresql');
    expect(termForms('CI/CD')).toContain('continuous integration');
    expect(termForms('microservices')).toContain('microservice');
    expect(termForms('Redshift', ['Amazon Redshift'])).toEqual(
      expect.arrayContaining(['redshift', 'amazon redshift'])
    );
  });
});

describe('parseJobRequirements', () => {
  it('keeps only what the posting writes, merges duplicates, and lists required first', () => {
    const parsed = parseJobRequirements(
      {
        requirements: [
          { term: 'GraphQL', kind: 'tool', importance: 'preferred', aliases: [] },
          { term: 'Python', kind: 'tool', importance: 'required', aliases: [] },
          { term: 'Postgres', kind: 'tool', importance: 'preferred', aliases: ['PG'] },
          { term: 'PostgreSQL', kind: 'TOOL', importance: 'required', aliases: ['Postgres'] },
          { term: 'Terraform', kind: 'tool', importance: 'required', aliases: [] },
          {
            term: 'Kubernetes',
            kind: 'wizardry',
            aliases: ['k8s', 'kube', 'x'.repeat(50)],
          },
          { term: '   ', kind: 'tool', importance: 'required' },
        ],
      },
      posting
    );

    expect(parsed).toEqual([
      { term: 'Python', kind: 'tool', importance: 'required', aliases: [] },
      { term: 'Postgres', kind: 'tool', importance: 'required', aliases: ['PG'] },
      { term: 'Kubernetes', kind: 'practice', importance: 'required', aliases: ['kube'] },
      { term: 'GraphQL', kind: 'tool', importance: 'preferred', aliases: [] },
    ]);
  });

  it('rejects output that is not a requirement list', () => {
    expect(parseJobRequirements({ skills: ['Python'] }, posting)).toBeNull();
    expect(parseJobRequirements('Python', posting)).toBeNull();
    expect(parseJobRequirements({ requirements: [] }, posting)).toEqual([]);
  });
});

describe('readJobRequirements', () => {
  beforeEach(() => executeAICall.mockReset());

  it('reads a posting once and reuses the result', async () => {
    executeAICall.mockResolvedValue({
      data: { requirements: [{ term: 'Python', kind: 'tool', importance: 'required' }] },
    });
    const job = `${posting}\nRead once.`;
    const first = await readJobRequirements(job);
    const again = await readJobRequirements(`  ${job.replace(/\n/g, '\n\n')}  `);

    expect(first).toEqual([{ term: 'Python', kind: 'tool', importance: 'required', aliases: [] }]);
    expect(again).toBe(first);
    expect(executeAICall).toHaveBeenCalledTimes(1);
    expect(executeAICall.mock.calls[0]?.[0]).toMatchObject({
      stage: 'jobRequirements',
      taskType: 'extraction',
      userPrompt: buildJobRequirementsUserPrompt(job),
    });
  });

  it('returns null when the model fails, and does not cache the failure', async () => {
    executeAICall.mockRejectedValueOnce(new Error('timeout'));
    const job = `${posting}\nFails first.`;
    expect(await readJobRequirements(job)).toBeNull();

    executeAICall.mockResolvedValueOnce({ data: { requirements: [] } });
    expect(await readJobRequirements(job)).toEqual([]);
    expect(executeAICall).toHaveBeenCalledTimes(2);
  });
});

describe('readResumeSkills', () => {
  it('lists every skill once, with the sections that name it', () => {
    const skills = readResumeSkills(facts);
    const byLabel = new Map(skills.map((skill) => [skill.label, skill.where]));

    expect(new Set(skills.map((skill) => skill.id)).size).toBe(skills.length);
    expect(byLabel.get('Backend development')).toEqual(['experience', 'summary']);
    expect(byLabel.get('Python')).toEqual(['experience', 'skills']);
    expect(byLabel.get('GraphQL')).toEqual(['skills']);
    expect(byLabel.get('Docker')).toEqual(['experience', 'skills']);
    expect(byLabel.has('B.S.')).toBe(false);
  });

  it('follows edits, since it is read from the resume each time', () => {
    const edited = buildEditFacts({
      ...profile,
      workExperiences: [
        { ...profile.workExperiences[0]!, bullets: ['Ran GraphQL gateways for 30 services'] },
      ],
    });
    const graphql = readResumeSkills(edited).find((skill) => skill.label === 'GraphQL');
    expect(graphql?.where).toEqual(['experience', 'skills']);
  });
});

describe('evaluateSkillMatch', () => {
  it('weighs required skills double and gives part credit to a skill that is only listed', () => {
    const check = evaluateSkillMatch(facts, requirements);

    expect(check.matches.map((match) => [match.term, match.evidence])).toEqual([
      ['Python', 'shown'],
      ['Kubernetes', 'missing'],
      ['Computer Science', 'shown'],
      ['GraphQL', 'listed'],
    ]);
    // (2 + 0 + 2 + 0.75) of 7
    expect(check.score).toBe(68);
    expect(check.required).toEqual({ met: 2, total: 3 });
    expect(check.preferred).toEqual({ met: 1, total: 1 });
    expect(check.summary).toBe(
      'Required: 2 of 3 on your resume. Nice to have: 1 of 1. 1 skill only listed, not shown in your experience.'
    );
  });

  it('finds aliases and plural forms', () => {
    const check = evaluateSkillMatch(facts, [
      { term: 'microservices', kind: 'practice', importance: 'required', aliases: [] },
      { term: 'Amazon Redshift', kind: 'tool', importance: 'required', aliases: ['Redshift'] },
    ]);
    expect(check.matches.map((match) => match.evidence)).toEqual(['shown', 'missing']);

    const withRedshift = buildEditFacts({
      ...profile,
      workExperiences: [
        { ...profile.workExperiences[0]!, bullets: ['Modeled finance data in Redshift'] },
      ],
    });
    expect(
      evaluateSkillMatch(withRedshift, [
        { term: 'Amazon Redshift', kind: 'tool', importance: 'required', aliases: ['Redshift'] },
      ]).score
    ).toBe(100);
  });

  it('has no score when the posting asks for nothing specific', () => {
    const check = evaluateSkillMatch(facts, []);
    expect(check.score).toBeNull();
    expect(check.summary).toBe('This posting asks for no specific skills.');
  });

  it('is part of the evaluation only once requirements are read', () => {
    expect(evaluateResume(facts, posting).skills).toBeNull();
    expect(evaluateResume(facts, posting, requirements).skills?.score).toBe(68);
    expect(evaluateResume(facts, null, requirements).skills).toBeNull();
    expect(evaluateResume(facts).resumeSkills.length).toBeGreaterThan(0);
  });

  it('leaves out the company, benefits, and legal words the raw match counts', () => {
    const raw = evaluateResume(facts, posting).job;
    const rawTerms = [...(raw?.onResume ?? []), ...(raw?.missing ?? [])];
    expect(rawTerms).toEqual(expect.arrayContaining(['Northwind', 'PTO', 'EEO', 'CCPA']));

    const smart = evaluateSkillMatch(facts, requirements).matches.map((match) => match.term);
    for (const noise of ['Northwind', 'PTO', 'EEO', 'CCPA']) expect(smart).not.toContain(noise);
  });
});

describe('the writing plan with requirements', () => {
  it('surfaces shown and listed skills, and names gaps to leave alone', () => {
    const plan = planWriting(facts, brief({ jobDescription: posting }), requirements);
    expect(plan.job).toEqual({
      onResume: ['Python', 'Computer Science', 'GraphQL'],
      listedOnly: ['GraphQL'],
      missing: ['Kubernetes'],
    });

    const [, role] = planBatches(facts, { kind: 'all' });
    const prompt = buildResumeEditUserPrompt(
      facts,
      role!,
      brief({ jobDescription: posting }),
      plan
    );
    expect(prompt).toContain(
      'Only in the skills list. Name one in a line only when that line already describes work that used it: GraphQL'
    );
    expect(prompt).toContain('Not on the resume. Gaps; never add these: Kubernetes');
  });

  it('falls back to raw keywords when requirements could not be read', () => {
    const plan = planWriting(facts, brief({ jobDescription: posting }), null);
    expect(plan.job?.listedOnly).toEqual([]);
    expect(plan.job?.onResume).toContain('Python');
  });
});

describe('suggestion effects with requirement terms', () => {
  it('credits a rewrite that names a requirement by one of its aliases', () => {
    const effects = changeEffects({
      op: 'rewrite',
      isBullet: true,
      before: 'Ran container clusters for payments',
      after: 'Ran k8s clusters for payments',
      jobKeywords: [
        { id: 'kubernetes', label: 'Kubernetes', forms: termForms('Kubernetes', ['k8s']) },
      ],
    });
    expect(effects.map((effect) => effect.label)).toContain('Uses “Kubernetes”');
  });
});
