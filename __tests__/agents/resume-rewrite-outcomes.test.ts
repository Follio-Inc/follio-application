/**
 * Phase 3A.1 — outcome claims that carry no number.
 *
 * Regression suite for the failure the first live GPT-4o run exposed. The
 * Rewrite Agent did not invent a statistic; it stapled a benefit onto the end
 * of a sentence that was true without it, and because that clause introduces
 * no name, no number and no credential, every Phase 3A guard passed it and
 * the semantic verifier read it as consistent with the work and approved it.
 *
 * The three bullets below are the real ones, verbatim. They are the reason
 * this file exists, so they are tested as themselves rather than as a tidied
 * paraphrase of themselves.
 *
 * The other half of this file is the part that matters just as much: the
 * rewrites that must still pass. A check that flagged every sentence
 * containing "improved" would make the agent useless, and the tests for
 * faithful paraphrase, for outcomes the resume evidences elsewhere, and for
 * plain clarity edits are what stop this hardening going too far.
 */

import { describe, expect, it } from 'vitest';

import {
  buildResumeEvidence,
  checkProposal,
  extractOutcomeClaims,
  findUnsupportedOutcomeClaims,
  formatTargetRef,
  proposalIdForTarget,
  verdictFloorFromIssues,
  type ProposalDraft,
  type ProposalTarget,
  type ResumeForRewrite,
} from '@/lib/resume-rewrite';

// ============================================================================
// THE REAL RESUME
// ============================================================================

/** The bullets from the live run, as the resume actually stores them. */
const ORIGINAL_BULLETS = [
  'Developed a REST API using FastAPI and PostgreSQL to store data from learning management systems',
  'Developed a full-stack web application using Flask, React, PostgreSQL and Docker to analyze GitHub data',
  'Explored ways to visualize GitHub collaboration in a classroom setting',
];

const RESUME: ResumeForRewrite = {
  headline: 'Software Engineer',
  summary: null,
  skills: ['Python', 'FastAPI', 'PostgreSQL', 'Flask', 'React', 'Docker'],
  experiences: [
    {
      id: 'e1',
      company: 'University',
      role: 'Research Assistant',
      bullets: [...ORIGINAL_BULLETS],
    },
  ],
  education: [],
  projects: [
    {
      id: 'p1',
      title: 'Deploy tooling',
      description: 'Internal tooling for the research group.',
      highlights: ['Cut deploy time in half'],
      techStack: ['Docker'],
    },
  ],
};

function targetFor(index: number): ProposalTarget {
  return { section: 'experience', recordId: 'e1', field: 'bullets', index };
}

function draftFor(index: number, proposedText: string, extra: Partial<ProposalDraft> = {}) {
  const target = targetFor(index);
  return {
    proposalId: proposalIdForTarget(target),
    target,
    targetRef: formatTargetRef(target),
    originalText: ORIGINAL_BULLETS[index],
    proposedText,
    explanation: 'Stronger phrasing.',
    keywordsAddressed: [],
    sourceEvidence: [],
    uncertainties: [],
    ...extra,
  } satisfies ProposalDraft;
}

function check(index: number, proposedText: string, extra: Partial<ProposalDraft> = {}) {
  return checkProposal(draftFor(index, proposedText, extra), { resume: RESUME });
}

function codesOf(issues: ReturnType<typeof check>) {
  return issues.map((issue) => issue.code);
}

// ============================================================================
// THE THREE LIVE FAILURES
// ============================================================================

describe('the three rewrites the live run wrongly approved', () => {
  const CASES: Array<{ index: number; proposed: string; claim: string }> = [
    {
      index: 0,
      proposed:
        'Developed a REST API using FastAPI and PostgreSQL to store data from learning management systems, enhancing data retrieval speed.',
      claim: 'retrieval speed',
    },
    {
      index: 1,
      proposed:
        'Developed a full-stack web application using Flask, React, PostgreSQL and Docker to analyze GitHub data, improving data analysis capabilities for project evaluations.',
      claim: 'analysis capabilities',
    },
    {
      index: 2,
      proposed:
        'Explored ways to visualize GitHub collaboration in a classroom setting, leading to improved understanding of collaborative coding practices.',
      claim: 'understanding',
    },
  ];

  for (const { index, proposed, claim } of CASES) {
    it(`refuses to approve the "${claim}" rewrite`, () => {
      const issues = check(index, proposed);

      expect(codesOf(issues)).toContain('unsupported-outcome');
      // The decisive assertion: this can no longer reach the user as verified.
      expect(verdictFloorFromIssues(issues)).toBe('revision_required');
    });

    it(`explains the "${claim}" rewrite in terms the agent can act on`, () => {
      const finding = check(index, proposed).find((issue) => issue.code === 'unsupported-outcome')!;

      expect(finding.detail).toMatch(/outcome the original does not claim/i);
      // It names the clause, so a revision knows exactly what to strike.
      expect(finding.evidence).toBeTruthy();
      // And it says plainly that the agent's own reasoning is not evidence.
      expect(finding.detail).toMatch(/not evidence/i);
    });
  }

  it('leaves the resume’s own text untouched in every case', () => {
    for (const { index, proposed } of CASES) {
      check(index, proposed);
      expect(RESUME.experiences[0].bullets[index]).toBe(ORIGINAL_BULLETS[index]);
    }
  });
});

// ============================================================================
// THE SHAPES THE CHECK HAS TO SEE
// ============================================================================

describe('outcome claims with no number at all', () => {
  it('catches an appended benefit clause', () => {
    const issues = check(
      0,
      `${ORIGINAL_BULLETS[0]}, improving query performance for downstream consumers`
    );
    expect(codesOf(issues)).toContain('unsupported-outcome');
  });

  it.each([
    ['leading to', `${ORIGINAL_BULLETS[2]}, leading to wider adoption across the department`],
    ['resulting in', `${ORIGINAL_BULLETS[2]}, resulting in faster grading turnaround`],
    ['thereby', `${ORIGINAL_BULLETS[2]}, thereby reducing the cost of running the course`],
  ])('catches causal language: %s', (_label, proposed) => {
    expect(codesOf(check(2, proposed))).toContain('unsupported-outcome');
  });

  it('catches an outcome welded into the main clause and routes it to the user', () => {
    const issues = check(
      0,
      'Improved data retrieval speed by developing a REST API using FastAPI and PostgreSQL for learning management systems'
    );

    expect(codesOf(issues)).toContain('unsupported-outcome');
    // Not removable by striking a clause, so the user decides, not the agent.
    expect(verdictFloorFromIssues(issues)).toBe('needs_user_input');
  });

  it('catches implied impact dressed as a confirmed achievement', () => {
    const issues = check(
      1,
      `${ORIGINAL_BULLETS[1]}, successfully delivering a high-impact analytics platform`
    );
    expect(codesOf(issues)).toContain('unsupported-outcome');
  });

  it('catches a purpose clause written as an achieved benefit', () => {
    const issues = check(
      0,
      'Developed a REST API using FastAPI and PostgreSQL to improve retrieval speed for learning management systems'
    );
    expect(codesOf(issues)).toContain('unsupported-outcome');
    expect(verdictFloorFromIssues(issues)).toBe('needs_user_input');
  });

  it('reports which words the resume never uses', () => {
    const finding = findUnsupportedOutcomeClaims({
      proposed: `${ORIGINAL_BULLETS[0]}, enhancing data retrieval speed.`,
      original: ORIGINAL_BULLETS[0],
      evidence: buildResumeEvidence(RESUME),
    })[0];

    expect(finding.unsupportedTerms).toEqual(expect.arrayContaining(['retrieval', 'speed']));
    // "data" is on the resume, so it is not held against the rewrite.
    expect(finding.unsupportedTerms).not.toContain('data');
  });
});

// ============================================================================
// WHAT MUST STILL PASS
// ============================================================================

describe('rewrites that must not be flagged', () => {
  it('accepts the clarity-only rewrite of the first bullet', () => {
    // The rewrite the brief itself gives as the safe version.
    const issues = check(
      0,
      'Built a REST API with FastAPI and PostgreSQL to store and manage data from learning management systems'
    );

    expect(codesOf(issues)).not.toContain('unsupported-outcome');
    expect(verdictFloorFromIssues(issues)).toBe('approved');
  });

  it('accepts a plain tightening of the third bullet', () => {
    const issues = check(
      2,
      'Prototyped visualisations of GitHub collaboration for use in a classroom setting'
    );

    expect(codesOf(issues)).not.toContain('unsupported-outcome');
    expect(verdictFloorFromIssues(issues)).toBe('approved');
  });

  it('accepts a faithful paraphrase of an outcome the user already claimed', () => {
    const original = 'Reduced API latency for the search service';
    const findings = findUnsupportedOutcomeClaims({
      original,
      proposed: 'Improved API response speed for the search service',
      evidence: buildResumeEvidence(RESUME),
    });

    // Same kind of benefit, differently worded. The user's claim, not a new one.
    expect(findings).toEqual([]);
  });

  it('accepts an outcome the resume evidences somewhere else', () => {
    // The resume's own project highlight says "Cut deploy time in half".
    const findings = findUnsupportedOutcomeClaims({
      original: 'Containerised the research tooling with Docker',
      proposed: 'Containerised the research tooling with Docker, reducing deploy time',
      evidence: buildResumeEvidence(RESUME),
    });

    expect(findings).toEqual([]);
  });

  it('does not flag "improved" when the user wrote it themselves', () => {
    const findings = findUnsupportedOutcomeClaims({
      original: 'Improved the grading workflow for teaching assistants',
      proposed: 'Rebuilt the grading workflow, improving turnaround for teaching assistants',
      evidence: buildResumeEvidence(RESUME),
    });

    expect(findings).toEqual([]);
  });
});

// ============================================================================
// EXTRACTION
// ============================================================================

describe('claim extraction', () => {
  it('separates the construction from the benefit being claimed', () => {
    const [claim] = extractOutcomeClaims(
      'Built a pipeline, improving data retrieval speed for the team'
    );

    expect(claim.trigger).toBe('improving');
    expect(claim.object).toBe('data retrieval speed for the team');
    expect(claim.category).toBe('performance');
    // A trailing clause can be struck, so a revision can fix it.
    expect(claim.removable).toBe(true);
  });

  it('marks a benefit inside the main clause as not simply removable', () => {
    const claim = extractOutcomeClaims('Reduced onboarding time for new analysts').find(
      (candidate) => candidate.trigger.toLowerCase() === 'reduced'
    )!;

    expect(claim.removable).toBe(false);
  });

  it('finds nothing to flag in a sentence that only says what was built', () => {
    expect(
      extractOutcomeClaims('Built a REST API with FastAPI and PostgreSQL to store course data')
    ).toEqual([]);
  });
});
