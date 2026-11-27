/**
 * Analysis dialog — response handling for both execution engines.
 *
 * The repo has no DOM test environment (the `.tsx` suites render with
 * `renderToStaticMarkup`), so these test the layer that decides *what* the
 * dialog renders rather than the markup itself: `toAnalysisView`, which
 * normalises the single-agent and orchestrated payloads into one view.
 *
 * That is the layer worth testing anyway. The two engines return structurally
 * different objects, and the failure this guards against is the quiet one —
 * an absent specialist turning into a zero that reads exactly like a real
 * measurement.
 */

import { describe, expect, it } from 'vitest';

import { toAnalysisView } from '@/app/(dashboard)/resumes/analyze-resume-dialog';

const JD_MATCH = {
  score: 62,
  band: 'fair',
  label: 'Fair match',
  summary: 'Partial overlap.',
  jobTitleHint: 'Senior Backend Engineer',
  matchedSkills: ['TypeScript'],
  missingKeywords: ['terraform'],
  basis: 'Lexical overlap, not an ATS result.',
};

const KEYWORDS = {
  jobTitleHint: 'Senior Backend Engineer',
  matchedInSkills: ['typescript'],
  presentButNotListedAsSkill: ['kubernetes'],
  absentFromResume: ['terraform'],
  interpretation: 'Absent means not written here.',
};

const ROLE_COVERAGE = {
  roleLabel: 'Technical Program Manager',
  roleSummary: 'Drives cross-functional programs.',
  band: 'partial',
  label: 'Evidence found for 3 of 6 competencies.',
  competencies: [
    {
      id: 'program-delivery',
      label: 'Cross-functional program delivery',
      description: 'Running multi-team programs.',
      coverage: 'covered',
      evidence: ['program', 'roadmap'],
    },
  ],
  coveredCount: 3,
  totalCompetencies: 6,
  matchingTitles: [],
  provenance: 'Follio application-defined role profile.',
  basis: 'Not an ATS score.',
};

const EVALUATION = {
  assessment: 'Bullets lean on filler.',
  recommendations: ['Replace "responsible for".'],
  counts: {
    experiences: 3,
    education: 2,
    skills: 26,
    projects: 2,
    totalBullets: 8,
    bulletsWithMetrics: 2,
  },
  metricCoveragePercent: 25,
  missingSections: ['summary'],
  findings: [
    {
      code: 'weak-phrasing',
      severity: 'medium',
      location: 'Engineer @ Acme',
      detail: 'Contains filler.',
      evidence: 'Responsible for various things',
    },
  ],
  basis: 'Computed from the text of this resume.',
  limitations: [],
};

function orchestrated(overrides: Record<string, unknown> = {}) {
  return {
    resumeId: 'resume_1',
    mode: 'general',
    summary: 'Readable but under-evidenced.',
    recommendations: ['Add figures where you have them.'],
    agentsUsed: ['resume-evaluation'],
    evaluation: EVALUATION,
    limitations: [],
    ...overrides,
  };
}

function singleAgent(overrides: Record<string, unknown> = {}) {
  return {
    resumeId: 'resume_1',
    resumeTitle: 'Backend Engineer',
    name: 'Ada Lovelace',
    summary: 'A backend engineer with three roles.',
    highlights: ['Shipped the billing rewrite'],
    counts: { experiences: 3, education: 2, skills: 26, projects: 2 },
    missingSections: [],
    limitations: [],
    ...overrides,
  };
}

describe('single-agent payloads', () => {
  it('preserves the Phase 1 fields the dialog already rendered', () => {
    const view = toAnalysisView('single-agent', singleAgent())!;

    expect(view.engine).toBe('single-agent');
    expect(view.summary).toBe('A backend engineer with three roles.');
    expect(view.highlights).toEqual(['Shipped the billing rewrite']);
    expect(view.counts).toEqual({ experiences: 3, education: 2, skills: 26, projects: 2 });
    expect(view.agentsUsed).toEqual(['resume-agent']);
  });

  it('carries the Phase 1 matching fields through unchanged', () => {
    const view = toAnalysisView(
      'single-agent',
      singleAgent({ jdMatch: JD_MATCH, keywords: KEYWORDS })
    )!;

    expect(view.jdMatch?.score).toBe(62);
    expect(view.keywords?.absentFromResume).toEqual(['terraform']);
  });

  it('adds nothing the single-agent engine does not produce', () => {
    const view = toAnalysisView('single-agent', singleAgent())!;

    expect(view.metricCoveragePercent).toBeUndefined();
    expect(view.qualityFindings).toBeUndefined();
    expect(view.assessment).toBeUndefined();
  });
});

describe('orchestrated general evaluation', () => {
  it('surfaces the Evaluation Agent’s computed findings', () => {
    const view = toAnalysisView('multi-agent', orchestrated())!;

    expect(view.engine).toBe('multi-agent');
    expect(view.assessment).toBe('Bullets lean on filler.');
    expect(view.counts).toMatchObject({ experiences: 3, skills: 26 });
    expect(view.totalBullets).toBe(8);
    expect(view.metricCoveragePercent).toBe(25);
    expect(view.missingSections).toEqual(['summary']);
    expect(view.qualityFindings).toHaveLength(1);
    expect(view.qualityFindings?.[0].evidence).toContain('Responsible for');
  });

  it('names the orchestrator alongside the specialists that contributed', () => {
    const view = toAnalysisView('multi-agent', orchestrated())!;

    expect(view.agentsUsed).toEqual(['resume-orchestrator', 'resume-evaluation']);
  });

  it('merges recommendations from the orchestrator and its specialists', () => {
    const view = toAnalysisView('multi-agent', orchestrated())!;

    expect(view.recommendations).toEqual([
      'Add figures where you have them.',
      'Replace "responsible for".',
    ]);
  });

  it('de-duplicates a recommendation both agents made', () => {
    const shared = 'Add figures where you have them.';
    const view = toAnalysisView(
      'multi-agent',
      orchestrated({
        recommendations: [shared],
        evaluation: { ...EVALUATION, recommendations: [shared] },
      })
    )!;

    expect(view.recommendations).toEqual([shared]);
  });
});

describe('orchestrated job-description evaluation', () => {
  const matching = {
    target: 'jd',
    assessment: 'Partial overlap.',
    recommendations: ['List Kubernetes under skills.'],
    jdMatch: JD_MATCH,
    keywords: KEYWORDS,
    limitations: [],
  };

  it('surfaces the deterministic score and the three-way keyword split', () => {
    const view = toAnalysisView(
      'multi-agent',
      orchestrated({ mode: 'jd', agentsUsed: ['resume-jd-match'], evaluation: undefined, matching })
    )!;

    expect(view.jdMatch?.score).toBe(62);
    expect(view.jdMatch?.band).toBe('fair');
    expect(view.keywords?.matchedInSkills).toEqual(['typescript']);
    expect(view.keywords?.presentButNotListedAsSkill).toEqual(['kubernetes']);
    expect(view.keywords?.absentFromResume).toEqual(['terraform']);
  });

  it('invents no counts when the Evaluation Agent did not run', () => {
    const view = toAnalysisView(
      'multi-agent',
      orchestrated({ mode: 'jd', agentsUsed: ['resume-jd-match'], evaluation: undefined, matching })
    )!;

    // Absent, not zero: a zero here would read as a measured result.
    expect(view.counts).toBeUndefined();
    expect(view.metricCoveragePercent).toBeUndefined();
    expect(view.totalBullets).toBeUndefined();
    expect(view.qualityFindings).toBeUndefined();
    expect(view.missingSections).toBeUndefined();
  });

  it('includes quality findings when the orchestrator called in both specialists', () => {
    const view = toAnalysisView(
      'multi-agent',
      orchestrated({
        mode: 'jd',
        agentsUsed: ['resume-evaluation', 'resume-jd-match'],
        matching,
      })
    )!;

    expect(view.jdMatch).toBeDefined();
    expect(view.qualityFindings).toHaveLength(1);
    expect(view.agentsUsed).toEqual([
      'resume-orchestrator',
      'resume-evaluation',
      'resume-jd-match',
    ]);
  });
});

describe('orchestrated target-role evaluation', () => {
  it('surfaces competency coverage and invents no match percentage', () => {
    const view = toAnalysisView(
      'multi-agent',
      orchestrated({
        mode: 'role',
        agentsUsed: ['resume-jd-match'],
        evaluation: undefined,
        matching: {
          target: 'role',
          assessment: 'Partial coverage.',
          recommendations: [],
          roleCoverage: ROLE_COVERAGE,
          limitations: [],
        },
      })
    )!;

    expect(view.roleCoverage?.roleLabel).toBe('Technical Program Manager');
    expect(view.roleCoverage?.coveredCount).toBe(3);
    expect(view.roleCoverage?.competencies[0].evidence).toEqual(['program', 'roadmap']);
    expect(view.roleCoverage?.provenance).toMatch(/application-defined/i);

    // A general role is not a posting: no score anywhere.
    expect(view.jdMatch).toBeUndefined();
    expect(view.roleCoverage).not.toHaveProperty('score');
  });
});

describe('limitations and failure handling', () => {
  it('merges limitations from every agent that reported one', () => {
    const view = toAnalysisView(
      'multi-agent',
      orchestrated({
        limitations: ['The role evaluation did not run.'],
        evaluation: { ...EVALUATION, limitations: ['assess_resume_quality failed.'] },
        matching: {
          target: 'jd',
          assessment: '',
          recommendations: [],
          limitations: ['No job description was provided.'],
        },
      })
    )!;

    expect(view.limitations).toEqual([
      'The role evaluation did not run.',
      'assess_resume_quality failed.',
      'No job description was provided.',
    ]);
  });

  it('returns null for an empty or malformed payload rather than a blank report', () => {
    expect(toAnalysisView('multi-agent', null)).toBeNull();
    expect(toAnalysisView('multi-agent', undefined)).toBeNull();
    expect(toAnalysisView('multi-agent', 'not an object')).toBeNull();
    expect(toAnalysisView('multi-agent', {})).toBeNull();
    expect(toAnalysisView('single-agent', {})).toBeNull();
    expect(toAnalysisView('single-agent', { summary: 42 })).toBeNull();
  });

  it('survives an orchestrated payload with no specialist output at all', () => {
    const view = toAnalysisView(
      'multi-agent',
      orchestrated({ agentsUsed: [], evaluation: undefined, limitations: ['Nothing ran.'] })
    )!;

    expect(view.agentsUsed).toEqual(['resume-orchestrator']);
    expect(view.counts).toBeUndefined();
    expect(view.limitations).toEqual(['Nothing ran.']);
  });

  it('tolerates an orchestrated payload missing its optional arrays', () => {
    const view = toAnalysisView('multi-agent', {
      resumeId: 'r',
      mode: 'general',
      summary: 'Bare.',
    })!;

    expect(view.recommendations).toEqual([]);
    expect(view.limitations).toEqual([]);
    expect(view.agentsUsed).toEqual(['resume-orchestrator']);
  });
});
