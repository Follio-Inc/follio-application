import { describe, expect, it } from 'vitest';

import type { JobRequirement } from '@/services/ai/job-requirements';
import { parseJobRequirements } from '@/services/ai/job-requirements';
import { buildEditFacts, type EditSourceProfile } from '@/services/ai/resume-edit/facts';
import { parseResumeSkills, readStoredSkillProfile } from '@/services/ai/resume-skills/parse';
import {
  ancestorsOf,
  evaluateSkillMatch,
  matchDegree,
  readDegreeRequirement,
  readResumeDegree,
  readResumeSkills,
  readSkillLines,
  resolveSkill,
  scanSkills,
  SKILL_PROFILE_VERSION,
} from '@/services/ai/skills';
import { SKILL_CATALOG } from '@/services/ai/skills/catalog-data';

const base: EditSourceProfile = {
  headline: 'Software Engineer',
  summary: '',
  workExperiences: [
    {
      id: 'exp-1',
      company: 'Acme',
      role: 'Software Engineer',
      startDate: new Date('2021-01-01'),
      endDate: null,
      isCurrent: true,
      bullets: [
        'Tuned slow Postgres queries, cutting report time 60%',
        'Built React dashboards for 40 internal teams',
      ],
      bulletsHtml: null,
      isVisible: true,
    },
  ],
  skills: [{ name: 'DBMS' }, { name: 'Go, Docker' }],
  educations: [
    {
      institution: 'NIT Trichy',
      degree: 'B.Tech',
      fieldOfStudy: 'Computer Science and Engineering',
    },
  ],
  certifications: [{ name: 'AWS Certified Solutions Architect', issuer: 'Amazon' }],
  projects: [],
};
const facts = buildEditFacts(base);

function requirement(term: string, overrides: Partial<JobRequirement> = {}): JobRequirement {
  return { term, kind: 'tool', importance: 'required', aliases: [], ...overrides };
}

function matchOf(term: string, overrides: Partial<JobRequirement> = {}) {
  const [match] = evaluateSkillMatch(facts, [requirement(term, overrides)]).matches;
  return match;
}

describe('the skill list', () => {
  it('gives every name for a skill the same id', () => {
    const dbms = resolveSkill('Database Management Systems');
    expect(dbms).toBe('database-management-systems');
    for (const name of ['DBMS', 'database management', 'Database Management System']) {
      expect(resolveSkill(name)).toBe(dbms);
    }
    expect(resolveSkill('Postgres')).toBe('postgresql');
    expect(resolveSkill('k8s')).toBe('kubernetes');
    expect(resolveSkill('Underwater basket weaving')).toBeNull();
  });

  it('knows the broader skills each one belongs to', () => {
    const above = ancestorsOf('postgresql');
    for (const id of ['sql', 'relational-databases', 'database-management-systems']) {
      expect(above.has(id)).toBe(true);
    }
  });

  it('only points at skills it defines, without loops', () => {
    const ids = new Set(SKILL_CATALOG.map((entry) => entry.id));
    expect(ids.size).toBe(SKILL_CATALOG.length);
    for (const entry of SKILL_CATALOG) {
      for (const parent of entry.under ?? []) expect(ids.has(parent)).toBe(true);
      expect(ancestorsOf(entry.id).has(entry.id)).toBe(false);
    }
  });

  it('reads running text longest name first, and keeps ordinary words out', () => {
    expect(scanSkills('Shipped Spark SQL jobs on Amazon Redshift').map((s) => s.id)).toEqual([
      'spark',
      'redshift',
    ]);
    expect(scanSkills('Go to market faster; excel at rest of the work').map((s) => s.id)).toEqual(
      []
    );
    expect(scanSkills('Built Excel models and REST APIs').map((s) => s.id)).toEqual([
      'excel',
      'rest',
    ]);
  });
});

describe('the resume skill profile', () => {
  it('reads names the resume writes, by any spelling, with their lines', () => {
    const skills = readResumeSkills(facts);
    const byId = new Map(skills.map((skill) => [skill.id, skill]));

    expect(byId.get('postgresql')).toMatchObject({ where: ['experience'], refs: ['E1.1'] });
    expect(byId.get('database-management-systems')).toMatchObject({
      label: 'Database management systems',
      where: ['skills'],
      inferred: false,
    });
    // "Go" counts as a skill entry, never in running text.
    expect(byId.get('go')?.where).toEqual(['skills']);
    expect(byId.get('aws')?.where).toEqual(['certifications']);
  });

  it('adds the saved model read only for lines that still say the same thing', () => {
    const lines = readSkillLines(facts);
    const stored = parseResumeSkills(
      {
        skills: [
          {
            label: 'Query optimization',
            kind: 'practice',
            aliases: ['SQL tuning'],
            broader: ['Relational databases'],
            refs: ['E1.1', 'E9.9'],
          },
          { label: 'Invented', kind: 'tool', refs: ['Z1'] },
        ],
      },
      lines,
      'hash'
    );
    expect(stored?.skills.map((skill) => skill.label)).toEqual(['Query optimization']);
    expect(stored?.skills[0]?.refs).toEqual(['E1.1']);
    expect(readStoredSkillProfile(stored)).toEqual(stored);
    expect(readStoredSkillProfile({ ...stored, version: SKILL_PROFILE_VERSION + 1 })).toBeNull();

    const inferred = readResumeSkills(facts, stored).find(
      (skill) => skill.label === 'Query optimization'
    );
    expect(inferred).toMatchObject({ inferred: true, refs: ['E1.1'], aliases: ['SQL tuning'] });
    expect(inferred?.broader).toEqual(['relational-databases']);

    const edited = buildEditFacts({
      ...base,
      workExperiences: [
        { ...base.workExperiences[0]!, bullets: ['Led the design review for payments'] },
      ],
    });
    expect(
      readResumeSkills(edited, stored).some((skill) => skill.label === 'Query optimization')
    ).toBe(false);
  });
});

describe('degrees', () => {
  const cse = readResumeDegree('D1', {
    degree: 'B.Tech',
    field: 'Computer Science and Engineering',
  });

  it('reads level and field from how resumes write them', () => {
    expect(cse.level).toBe('bachelors');
    expect(cse.fields).toEqual(
      expect.arrayContaining(['computer-science', 'computer-engineering'])
    );
    expect(readResumeDegree('D1', { degree: 'M.S.', field: 'Statistics' }).level).toBe('masters');
    expect(readResumeDegree('D1', { degree: 'Ph.D.', field: 'Physics' }).level).toBe('doctorate');
  });

  it('meets a degree requirement by level and field, not by wording', () => {
    for (const term of [
      "Bachelor's degree in Computer Science",
      'BS/MS in CS or related field',
      'B.E. in Computer Engineering',
      'Degree in a technical field',
    ]) {
      expect(matchDegree(readDegreeRequirement(term), [cse]).fit).toBe('meets');
    }
  });

  it('partly meets the right field at a lower level, and not an unrelated field', () => {
    expect(matchDegree(readDegreeRequirement("Master's in Computer Science"), [cse]).fit).toBe(
      'partly'
    );
    const history = readResumeDegree('D1', { degree: 'Bachelor of Arts', field: 'History' });
    expect(matchDegree(readDegreeRequirement("Master's in Computer Science"), [history]).fit).toBe(
      'no'
    );
    expect(
      matchDegree(
        readDegreeRequirement('Degree', {
          level: 'bachelors',
          fields: ['Finance'],
          orRelated: false,
        }),
        [cse]
      ).fit
    ).toBe('partly');
  });
});

describe('matching requirements', () => {
  it('counts a Computer Science and Engineering degree for a CS degree requirement', () => {
    expect(
      matchOf("Bachelor's degree in Computer Science or related field", { kind: 'credential' })
    ).toMatchObject({
      match: 'exact',
      evidence: 'shown',
      where: ['education'],
      via: 'B.Tech, Computer Science and Engineering',
    });
  });

  it('matches DBMS on the resume to Database Management Systems in the posting', () => {
    expect(matchOf('Database Management Systems', { kind: 'practice' })).toMatchObject({
      match: 'exact',
      evidence: 'listed',
    });
  });

  it('treats a specific skill as proof of the broader one', () => {
    expect(matchOf('SQL')).toMatchObject({
      match: 'implied',
      evidence: 'shown',
      via: 'PostgreSQL',
    });
    expect(matchOf('Relational databases')).toMatchObject({ match: 'implied' });
  });

  it('gives half credit to a close skill, and none to an unrelated one', () => {
    const vue = evaluateSkillMatch(facts, [requirement('Vue.js')]);
    expect(vue.matches[0]).toMatchObject({ match: 'related', via: 'React' });
    expect(vue.score).toBe(50);
    expect(vue.related).toBe(1);
    expect(vue.required.met).toBe(0);
    expect(vue.summary).toBe('Required: 0 of 1 on your resume. 1 close match counts for half.');

    expect(matchOf('Kubernetes')).toMatchObject({ match: 'missing', evidence: 'missing' });
  });

  it('still finds terms the skill list does not know, by their words', () => {
    const custom = buildEditFacts({
      ...base,
      workExperiences: [
        { ...base.workExperiences[0]!, bullets: ['Ran the merchant onboarding funnel'] },
      ],
    });
    const [match] = evaluateSkillMatch(custom, [
      requirement('merchant onboarding', { kind: 'domain' }),
    ]).matches;
    expect(match).toMatchObject({ match: 'exact', evidence: 'shown' });
  });
});

describe('degree requirements from the model', () => {
  const posting = `Requirements
BS or MS in Computer Science or a related field. 3+ years with PostgreSQL.`;

  it('keeps a degree the posting asks for even when the model rewords it', () => {
    const parsed = parseJobRequirements(
      {
        requirements: [
          {
            term: "Bachelor's degree in Computer Science",
            kind: 'credential',
            importance: 'required',
            aliases: [],
            degree: { level: 'bachelors', fields: ['Computer Science'], orRelated: true },
          },
          {
            term: 'PostgreSQL',
            kind: 'tool',
            importance: 'required',
            aliases: [],
            broader: ['Relational databases'],
            degree: null,
          },
        ],
      },
      posting
    );
    expect(parsed).toEqual([
      {
        term: "Bachelor's degree in Computer Science",
        kind: 'credential',
        importance: 'required',
        aliases: [],
        degree: { level: 'bachelors', fields: ['Computer Science'], orRelated: true },
      },
      {
        term: 'PostgreSQL',
        kind: 'tool',
        importance: 'required',
        aliases: [],
        broader: ['Relational databases'],
      },
    ]);
  });

  it('drops a degree when the posting never asks for one', () => {
    expect(
      parseJobRequirements(
        {
          requirements: [
            {
              term: "Master's degree in Physics",
              kind: 'credential',
              importance: 'required',
              aliases: [],
              degree: { level: 'masters', fields: ['Physics'], orRelated: false },
            },
          ],
        },
        'Requirements\n3+ years with PostgreSQL and Python in production.'
      )
    ).toEqual([]);
  });
});
