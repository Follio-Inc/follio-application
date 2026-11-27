/**
 * Resume Agent evaluation tools and the role-profile module.
 *
 * These tools are deterministic by design — no LLM is involved — so these
 * tests assert real computed output rather than mocked output. They also
 * cover the guards that keep the model inside its lane: the resume pin, the
 * trusted-input requirement for job descriptions and roles, and the rule that
 * a tool with an unmet precondition reports back instead of improvising.
 */

import { describe, expect, it } from 'vitest';

import { createAgentMemory } from '@/lib/agents/memory';
import { buildResumeCorpus } from '@/lib/jd-match/build-resume-corpus';
import { evaluateRoleCoverage } from '@/lib/role-profiles/evaluate';
import {
  ROLE_PROFILES,
  ROLE_PROFILE_OPTIONS,
  isSupportedRole,
  resolveRoleProfile,
} from '@/lib/role-profiles/profiles';
import {
  evaluateAgainstRoleTool,
  findMissingKeywordsTool,
  JOB_DESCRIPTION_META_KEY,
  scoreAgainstJdTool,
  TARGET_ROLE_META_KEY,
  toProfileForMatch,
} from '@/services/agents/resume/jd-tools';
import {
  MEMORY_RESUME,
  pinnedToSelectedResume,
  SELECTED_RESUME_META_KEY,
  type AgentResumeView,
} from '@/services/agents/resume/tools';

import type { AgentToolContext } from '@/types/agents';

const RESUME_ID = 'resume_abc123';

/**
 * A resume shaped exactly like `get_resume` returns it.
 *
 * Kubernetes appears only in an experience bullet and Docker only in a
 * project, while TypeScript is a listed skill. That split is what the
 * three-way keyword classification is tested against.
 */
function buildResumeView(overrides: Partial<AgentResumeView> = {}): AgentResumeView {
  return {
    resumeId: RESUME_ID,
    handle: 'ada-lovelace',
    resumeTitle: 'Backend Engineer',
    name: 'Ada Lovelace',
    headline: 'Senior Backend Engineer',
    summary: 'Builds APIs and data platforms.',
    location: 'San Francisco, CA',
    contact: { email: 'ada@example.com', phone: null, website: null },
    experiences: [
      {
        id: 'exp1',
        company: 'Acme',
        role: 'Senior Backend Engineer',
        location: 'Remote',
        startDate: '2021-01-01',
        endDate: null,
        isCurrent: true,
        bullets: ['Designed REST APIs', 'Migrated services onto Kubernetes'],
      },
    ],
    education: [
      {
        id: 'edu1',
        institution: 'MIT',
        degree: 'BS',
        fieldOfStudy: 'Computer Science',
        startDate: '2015-09-01',
        endDate: '2019-06-01',
        isCurrent: false,
      },
    ],
    skills: ['TypeScript', 'PostgreSQL'],
    projects: [
      {
        id: 'proj1',
        title: 'Ops Platform',
        description: 'Internal deploy tooling built with Docker.',
        url: null,
        techStack: ['TypeScript'],
        highlights: ['Cut deploy time in half'],
      },
    ],
    ...overrides,
  } as AgentResumeView;
}

/** A tool context carrying whatever the run was given. */
function buildContext(options: {
  resume?: AgentResumeView | null;
  jobDescription?: string;
  targetRole?: string;
}): AgentToolContext {
  const memory = createAgentMemory({});
  if (options.resume !== null) {
    memory.set(MEMORY_RESUME, options.resume ?? buildResumeView());
  }

  return {
    runId: 'run_1',
    agentId: 'resume-agent',
    userId: 'user_1',
    memory,
    meta: {
      [SELECTED_RESUME_META_KEY]: RESUME_ID,
      ...(options.jobDescription ? { [JOB_DESCRIPTION_META_KEY]: options.jobDescription } : {}),
      ...(options.targetRole ? { [TARGET_ROLE_META_KEY]: options.targetRole } : {}),
    },
  };
}

const BACKEND_JD = `Senior Backend Engineer
We are looking for an engineer fluent in TypeScript who has run services on
Kubernetes and Docker in production. Experience with Terraform and GraphQL is
required. You will design APIs and own reliability for a distributed platform.`;

function hasError(result: unknown): result is { error: string } {
  return Boolean(result && typeof result === 'object' && 'error' in result);
}

// ============================================================================

describe('toProfileForMatch', () => {
  it('maps the agent resume view onto the jd-match corpus shape', () => {
    const profile = toProfileForMatch(buildResumeView());

    expect(profile.id).toBe(RESUME_ID);
    expect(profile.skills).toEqual([
      { name: 'TypeScript', isVisible: true },
      { name: 'PostgreSQL', isVisible: true },
    ]);
    expect(profile.workExperiences[0]).toMatchObject({
      company: 'Acme',
      role: 'Senior Backend Engineer',
    });
    expect(profile.educations[0]).toMatchObject({ institution: 'MIT' });
    // Documented gap: the connector view carries no certifications.
    expect(profile.certifications).toEqual([]);
  });

  it('produces a corpus whose body text carries bullets and project text', () => {
    const corpus = buildResumeCorpus(toProfileForMatch(buildResumeView()));

    expect(corpus.bodyText).toContain('Kubernetes');
    expect(corpus.bodyText).toContain('Docker');
    expect(corpus.roles).toContain('Senior Backend Engineer');
  });
});

describe('score_against_jd', () => {
  it('returns a deterministic score and stores it in memory', async () => {
    const ctx = buildContext({ jobDescription: BACKEND_JD });

    const result = (await scoreAgainstJdTool.execute({ resumeId: RESUME_ID }, ctx)) as {
      score: number;
      band: string;
      matchedSkills: string[];
      basis: string;
    };

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['strong', 'good', 'fair', 'weak']).toContain(result.band);
    expect(result.matchedSkills).toContain('TypeScript');
    // The disclaimer travels with the number so the UI cannot show one without it.
    expect(result.basis).toMatch(/not an applicant-tracking-system result/i);

    // Grounding: the result tool reads this back rather than trusting the model.
    expect(ctx.memory.get('jdMatch')).toEqual(result);
  });

  it('is reproducible across calls', async () => {
    const first = await scoreAgainstJdTool.execute(
      { resumeId: RESUME_ID },
      buildContext({ jobDescription: BACKEND_JD })
    );
    const second = await scoreAgainstJdTool.execute(
      { resumeId: RESUME_ID },
      buildContext({ jobDescription: BACKEND_JD })
    );

    expect(first).toEqual(second);
  });

  it('refuses when the run was given no job description', async () => {
    const result = await scoreAgainstJdTool.execute({ resumeId: RESUME_ID }, buildContext({}));

    expect(hasError(result)).toBe(true);
    expect((result as { error: string }).error).toMatch(/no job description/i);
  });

  it('refuses when get_resume has not run yet', async () => {
    const ctx = buildContext({ resume: null, jobDescription: BACKEND_JD });

    const result = await scoreAgainstJdTool.execute({ resumeId: RESUME_ID }, ctx);

    expect(hasError(result)).toBe(true);
    expect((result as { error: string }).error).toMatch(/call get_resume first/i);
  });
});

describe('find_missing_keywords', () => {
  it('separates listed skills, unlisted evidence, and genuinely absent keywords', async () => {
    const ctx = buildContext({ jobDescription: BACKEND_JD });

    const result = (await findMissingKeywordsTool.execute({ resumeId: RESUME_ID }, ctx)) as {
      matchedInSkills: string[];
      presentButNotListedAsSkill: string[];
      absentFromResume: string[];
      interpretation: string;
    };

    // Listed in the skills section.
    expect(result.matchedInSkills).toContain('typescript');

    // Written in a bullet / project, but not listed as a skill. This is the
    // distinction the deterministic matcher alone does not make.
    expect(result.presentButNotListedAsSkill).toContain('kubernetes');
    expect(result.presentButNotListedAsSkill).toContain('docker');

    // In the posting, nowhere in the resume.
    expect(result.absentFromResume).toContain('terraform');
    expect(result.absentFromResume).toContain('graphql');

    // A keyword must land in exactly one bucket.
    const all = [
      ...result.matchedInSkills,
      ...result.presentButNotListedAsSkill,
      ...result.absentFromResume,
    ];
    expect(new Set(all).size).toBe(all.length);

    // The anti-overclaim note travels with the data.
    expect(result.interpretation).toMatch(/not evidence the user lacks the experience/i);
  });

  it('refuses when the run was given no job description', async () => {
    const result = await findMissingKeywordsTool.execute({ resumeId: RESUME_ID }, buildContext({}));

    expect(hasError(result)).toBe(true);
    expect((result as { error: string }).error).toMatch(/no job description/i);
  });
});

describe('evaluate_against_role', () => {
  it('reports per-competency coverage with the evidence behind it', async () => {
    const ctx = buildContext({ targetRole: 'software-engineer' });

    const result = (await evaluateAgainstRoleTool.execute({ resumeId: RESUME_ID }, ctx)) as {
      roleLabel: string;
      competencies: Array<{ id: string; coverage: string; evidence: string[] }>;
      totalCompetencies: number;
      matchingTitles: string[];
      provenance: string;
      basis: string;
    };

    expect(result.roleLabel).toBe('Software Engineer');
    expect(result.competencies).toHaveLength(result.totalCompetencies);

    // Every "covered" verdict must be backed by evidence drawn from the resume.
    for (const competency of result.competencies) {
      if (competency.coverage === 'covered') expect(competency.evidence.length).toBeGreaterThan(1);
      if (competency.coverage === 'partial') expect(competency.evidence).toHaveLength(1);
      if (competency.coverage === 'absent') expect(competency.evidence).toHaveLength(0);
    }

    // "Senior Backend Engineer" aligns with this role family.
    expect(result.matchingTitles).toContain('Senior Backend Engineer');

    expect(result.provenance).toMatch(/application-defined/i);
    expect(result.basis).toMatch(/not an ATS score/i);
  });

  it('never reports a percentage or ATS score for a general role', async () => {
    const ctx = buildContext({ targetRole: 'technical-program-manager' });

    const result = (await evaluateAgainstRoleTool.execute({ resumeId: RESUME_ID }, ctx)) as Record<
      string,
      unknown
    >;

    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('percentage');
    expect(['broad', 'partial', 'limited']).toContain(result.band);
  });

  it('refuses when the run was given no target role', async () => {
    const result = await evaluateAgainstRoleTool.execute({ resumeId: RESUME_ID }, buildContext({}));

    expect(hasError(result)).toBe(true);
    expect((result as { error: string }).error).toMatch(/no target role/i);
  });

  it('refuses an unsupported role even if one reaches the tool', async () => {
    const ctx = buildContext({ targetRole: 'chief-vibes-officer' });

    const result = await evaluateAgainstRoleTool.execute({ resumeId: RESUME_ID }, ctx);

    expect(hasError(result)).toBe(true);
    expect((result as { error: string }).error).toMatch(/not a supported target role/i);
  });
});

describe('resume pinning on the evaluation tools', () => {
  it('rejects a different resume id, naming the one that is allowed', async () => {
    const pinned = pinnedToSelectedResume(scoreAgainstJdTool);
    const ctx = buildContext({ jobDescription: BACKEND_JD });

    await expect(pinned.execute({ resumeId: 'someone_elses_resume' }, ctx)).rejects.toThrow(
      /reads only the resume the user selected/i
    );
  });

  it('rejects when no resume was pinned for the run', async () => {
    const pinned = pinnedToSelectedResume(scoreAgainstJdTool);
    const ctx = buildContext({ jobDescription: BACKEND_JD });
    ctx.meta = { [JOB_DESCRIPTION_META_KEY]: BACKEND_JD };

    await expect(pinned.execute({ resumeId: RESUME_ID }, ctx)).rejects.toThrow(
      /no resume was selected/i
    );
  });

  it('allows the pinned resume through', async () => {
    const pinned = pinnedToSelectedResume(scoreAgainstJdTool);
    const ctx = buildContext({ jobDescription: BACKEND_JD });

    const result = await pinned.execute({ resumeId: RESUME_ID }, ctx);

    expect(hasError(result)).toBe(false);
  });
});

describe('role profiles', () => {
  it('resolves ids, labels and aliases, and rejects anything else', () => {
    expect(resolveRoleProfile('technical-program-manager')?.id).toBe('technical-program-manager');
    expect(resolveRoleProfile('Technical Program Manager')?.id).toBe('technical-program-manager');
    expect(resolveRoleProfile('TPM')?.id).toBe('technical-program-manager');
    expect(resolveRoleProfile('  product manager ')?.id).toBe('product-manager');

    expect(resolveRoleProfile('chief vibes officer')).toBeNull();
    expect(resolveRoleProfile('')).toBeNull();
    expect(resolveRoleProfile(null)).toBeNull();
    expect(isSupportedRole('data scientist')).toBe(true);
    expect(isSupportedRole('astronaut')).toBe(false);
  });

  it('includes the role Shobhit named, with explicit provenance', () => {
    const tpm = ROLE_PROFILES['technical-program-manager'];

    expect(tpm.label).toBe('Technical Program Manager');
    expect(tpm.competencies.length).toBeGreaterThanOrEqual(4);
    expect(tpm.provenance).toMatch(/Not taken from any specific employer, posting/i);
  });

  it('keeps every profile well formed', () => {
    for (const role of Object.values(ROLE_PROFILES)) {
      expect(role.competencies.length).toBeGreaterThan(0);
      expect(role.signalTitles.length).toBeGreaterThan(0);
      expect(role.provenance).toBeTruthy();

      const ids = role.competencies.map((competency) => competency.id);
      expect(new Set(ids).size).toBe(ids.length);

      for (const competency of role.competencies) {
        expect(competency.label).toBeTruthy();
        expect(competency.description).toBeTruthy();
        expect(competency.signals.length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes picker options matching the profiles', () => {
    expect(ROLE_PROFILE_OPTIONS).toHaveLength(Object.keys(ROLE_PROFILES).length);
    for (const option of ROLE_PROFILE_OPTIONS) {
      expect(ROLE_PROFILES[option.id].label).toBe(option.label);
    }
  });
});

describe('evaluateRoleCoverage', () => {
  it('reports limited coverage and no evidence for an empty resume', () => {
    const corpus = buildResumeCorpus(
      toProfileForMatch(
        buildResumeView({
          headline: null,
          summary: null,
          skills: [],
          experiences: [],
          projects: [],
          education: [],
        })
      )
    );

    const result = evaluateRoleCoverage(corpus, ROLE_PROFILES['data-scientist']);

    expect(result.band).toBe('limited');
    expect(result.coveredCount).toBe(0);
    expect(result.matchingTitles).toEqual([]);
    expect(result.competencies.every((c) => c.coverage === 'absent')).toBe(true);
    expect(result.label).toMatch(/No clear evidence/i);
  });

  it('counts competencies consistently', () => {
    const corpus = buildResumeCorpus(toProfileForMatch(buildResumeView()));
    const result = evaluateRoleCoverage(corpus, ROLE_PROFILES['software-engineer']);

    expect(result.coveredCount + result.partialCount + result.absentCount).toBe(
      result.totalCompetencies
    );
  });
});
