/**
 * Phase 3A — the deterministic guards.
 *
 * No agents, no runtime, no mocks. These are pure functions over a resume and
 * a proposal, and they are tested as such, because they are the part of
 * verification that holds when the model is wrong. Every case here is a
 * fabrication a confident rewrite would otherwise sail through on.
 */

import { describe, expect, it } from 'vitest';

import {
  checkProposal,
  checkProposalBatch,
  formatTargetRef,
  isRewritableField,
  listRewriteTargets,
  parseTargetRef,
  proposalIdForTarget,
  resolveTarget,
  verdictFloorFromIssues,
  type ProposalDraft,
  type ProposalTarget,
  type ResumeForRewrite,
} from '@/lib/resume-rewrite';

// ============================================================================
// FIXTURE
// ============================================================================

const RESUME: ResumeForRewrite = {
  headline: 'Backend Engineer',
  summary: 'Builds APIs and data platforms.',
  skills: ['TypeScript', 'PostgreSQL'],
  experiences: [
    {
      id: 'exp1',
      company: 'Acme',
      role: 'Backend Engineer',
      bullets: [
        'Responsible for various backend services and worked on the platform',
        'Migrated 12 services onto Kubernetes',
      ],
    },
  ],
  education: [{ id: 'edu1', institution: 'MIT', degree: 'BS', fieldOfStudy: 'Computer Science' }],
  projects: [
    {
      id: 'proj1',
      title: 'Ops Platform',
      description: 'Internal deploy tooling built with Docker.',
      highlights: ['Cut deploy time in half'],
      techStack: ['TypeScript'],
    },
  ],
};

const WEAK_BULLET = RESUME.experiences[0].bullets[0];
const METRIC_BULLET = RESUME.experiences[0].bullets[1];

const WEAK_TARGET: ProposalTarget = {
  section: 'experience',
  recordId: 'exp1',
  field: 'bullets',
  index: 0,
};
const METRIC_TARGET: ProposalTarget = {
  section: 'experience',
  recordId: 'exp1',
  field: 'bullets',
  index: 1,
};

function draft(overrides: Partial<ProposalDraft> & { proposedText: string }): ProposalDraft {
  const target = overrides.target ?? WEAK_TARGET;
  return {
    proposalId: overrides.proposalId ?? proposalIdForTarget(target),
    target,
    targetRef: formatTargetRef(target),
    originalText: overrides.originalText ?? WEAK_BULLET,
    explanation: 'Stronger opening, same facts.',
    keywordsAddressed: [],
    sourceEvidence: [],
    uncertainties: [],
    ...overrides,
  };
}

function codes(
  draftInput: ProposalDraft,
  options: Parameters<typeof checkProposal>[1] = { resume: RESUME }
) {
  return checkProposal(draftInput, options).map((issue) => issue.code);
}

// ============================================================================
// ADDRESSING
// ============================================================================

describe('addressing resume text', () => {
  it('lists only the fields this phase may rewrite', () => {
    const targets = listRewriteTargets(RESUME);
    const refs = targets.map((target) => target.targetRef);

    expect(refs).toEqual([
      'summary:profile:summary',
      'experience:exp1:bullets:0',
      'experience:exp1:bullets:1',
      'project:proj1:description',
      'project:proj1:highlights:0',
    ]);

    // Nothing factual is addressable: no employer, title, date or degree.
    expect(refs.join(' ')).not.toMatch(/company|role|startDate|institution|degree/);
  });

  it('round-trips a target through its canonical ref', () => {
    const ref = formatTargetRef(WEAK_TARGET);
    expect(ref).toBe('experience:exp1:bullets:0');
    expect(parseTargetRef(ref)).toEqual(WEAK_TARGET);
  });

  it('refuses refs that are malformed or out of scope', () => {
    expect(parseTargetRef('experience:exp1:company')).toBeNull();
    expect(parseTargetRef('education:edu1:degree')).toBeNull();
    expect(parseTargetRef('experience:exp1:bullets')).toBeNull();
    expect(parseTargetRef('experience:exp1:bullets:-1')).toBeNull();
    expect(parseTargetRef('nonsense')).toBeNull();
  });

  it('accepts exactly the index forms it emits, and no others', () => {
    // `Number()` alone accepts `1e3`, `0x10`, `+5`, `5.0` and ` 5`, none of
    // which `formatTargetRef` can produce. Accepting them would mean a ref
    // that parses to an index the formatter would never write, breaking the
    // round trip the whole addressing scheme rests on.
    for (const raw of ['1e3', '0x10', '+5', '5.0', ' 5', '5 ', '', '-0']) {
      expect(parseTargetRef(`experience:exp1:bullets:${raw}`), raw).toBeNull();
    }

    for (const index of [0, 1, 7, 42, 100]) {
      const ref = formatTargetRef({
        section: 'experience',
        recordId: 'exp1',
        field: 'bullets',
        index,
      });
      expect(parseTargetRef(ref)?.index).toBe(index);
    }
  });

  it('round-trips every rewritable target on a real resume', () => {
    // The property, stated directly: anything the formatter emits, the parser
    // reads back unchanged.
    for (const target of listRewriteTargets(RESUME)) {
      expect(parseTargetRef(target.targetRef), target.targetRef).toEqual(target.target);
      expect(formatTargetRef(target.target)).toBe(target.targetRef);
    }
  });

  it('gives the same target the same proposal id every time', () => {
    expect(proposalIdForTarget(WEAK_TARGET)).toBe(proposalIdForTarget({ ...WEAK_TARGET }));
    expect(proposalIdForTarget(WEAK_TARGET)).not.toBe(proposalIdForTarget(METRIC_TARGET));
  });

  it('resolves a live target and refuses one the resume does not have', () => {
    const found = resolveTarget(RESUME, WEAK_TARGET);
    expect(found.ok).toBe(true);
    expect(found.ok && found.view.text).toBe(WEAK_BULLET);

    const missing = resolveTarget(RESUME, { ...WEAK_TARGET, index: 9 });
    expect(missing.ok).toBe(false);
  });

  it('treats factual identifier fields as outside the rewritable scope', () => {
    expect(isRewritableField(WEAK_TARGET)).toBe(true);
    expect(isRewritableField({ section: 'experience', recordId: 'exp1', field: 'summary' })).toBe(
      false
    );
  });
});

// ============================================================================
// FABRICATION
// ============================================================================

describe('fabricated facts are caught', () => {
  it('rejects a performance metric the resume never states', () => {
    const found = codes(
      draft({ proposedText: 'Rebuilt backend services, cutting platform latency by 40%' })
    );

    expect(found).toContain('unsupported-number');
    expect(
      verdictFloorFromIssues(
        checkProposal(
          draft({
            proposedText: 'Rebuilt backend services, cutting platform latency by 40%',
          }),
          { resume: RESUME }
        )
      )
    ).toBe('rejected');
  });

  it('allows a figure the resume already states elsewhere', () => {
    const found = codes(
      draft({
        target: METRIC_TARGET,
        originalText: METRIC_BULLET,
        proposedText: 'Migrated 12 production services onto Kubernetes',
      })
    );

    expect(found).not.toContain('unsupported-number');
  });

  it('rejects an employer the resume does not list', () => {
    const found = codes(draft({ proposedText: 'Rebuilt the backend services platform at Globex' }));

    expect(found).toContain('unsupported-employer');
    expect(found).toContain('unsupported-proper-noun');
  });

  it('rejects a technology the resume does not evidence', () => {
    const found = codes(
      draft({
        target: METRIC_TARGET,
        originalText: METRIC_BULLET,
        proposedText: 'Migrated 12 services onto Kubernetes using Terraform',
      })
    );

    expect(found).toContain('unsupported-proper-noun');
  });

  it('rejects a job-description keyword the resume does not support, even in lower case', () => {
    const found = codes(
      draft({ proposedText: 'Rebuilt backend services across the platform using terraform' }),
      { resume: RESUME, unsupportedKeywords: ['terraform', 'graphql'] }
    );

    expect(found).toContain('unsupported-skill');
  });

  it('rejects a claim to address a keyword the resume never mentions', () => {
    const found = codes(
      draft({
        proposedText: 'Rebuilt and maintained the backend services platform',
        keywordsAddressed: ['Terraform'],
      })
    );

    expect(found).toContain('unsupported-keyword');
  });

  it('rejects invented leadership and the team size that comes with it', () => {
    const issues = checkProposal(
      draft({ proposedText: 'Led a team of 5 engineers delivering backend services' }),
      { resume: RESUME }
    );
    const found = issues.map((issue) => issue.code);

    expect(found).toContain('unsupported-leadership');
    expect(found).toContain('unsupported-number');
    expect(verdictFloorFromIssues(issues)).toBe('rejected');
  });

  it('flags ownership language on a resume that describes no leadership', () => {
    const found = codes(
      draft({ proposedText: 'Spearheaded the backend services the platform runs on' })
    );

    expect(found).toContain('overstated-leadership');
  });

  it('rejects a certification the resume does not list', () => {
    const found = codes(
      draft({
        proposedText: 'Applied Certified Scrum practices across backend services',
      })
    );

    expect(found).toContain('unsupported-certification');
  });

  it('rejects an academic qualification the resume does not list', () => {
    const found = codes(
      draft({
        proposedText: 'Applied masters-level distributed systems work to backend services',
      })
    );

    expect(found).toContain('unsupported-qualification');
  });

  it('rejects a seniority the resume does not claim', () => {
    const found = codes(
      draft({ proposedText: 'Acted as the principal engineer for backend services' })
    );

    expect(found).toContain('unsupported-title');
  });

  it('rejects a proposal whose original text is not what the resume says', () => {
    const issues = checkProposal(
      draft({
        originalText: 'Built a payments platform from scratch',
        proposedText: 'Rebuilt the payments platform',
      }),
      { resume: RESUME }
    );

    expect(issues.map((issue) => issue.code)).toEqual(['original-text-mismatch']);
    expect(verdictFloorFromIssues(issues)).toBe('rejected');
  });

  it('rejects a target that does not exist', () => {
    const issues = checkProposal(
      draft({ target: { ...WEAK_TARGET, index: 7 }, proposedText: 'Anything' }),
      { resume: RESUME }
    );

    expect(issues.map((issue) => issue.code)).toEqual(['target-missing']);
  });

  it('rejects an edit aimed at a protected factual field', () => {
    const issues = checkProposal(
      draft({
        target: { section: 'experience', recordId: 'exp1', field: 'summary' },
        proposedText: 'Staff Engineer',
      }),
      { resume: RESUME }
    );

    expect(issues.map((issue) => issue.code)).toEqual(['protected-field']);
  });
});

// ============================================================================
// PRESERVATION
// ============================================================================

describe('facts the original carried are preserved', () => {
  it('flags a rewrite that drops a measurable result', () => {
    const issues = checkProposal(
      draft({
        target: METRIC_TARGET,
        originalText: METRIC_BULLET,
        proposedText: 'Migrated production services onto Kubernetes',
      }),
      { resume: RESUME }
    );

    expect(issues.map((issue) => issue.code)).toContain('removed-metric');
    expect(verdictFloorFromIssues(issues)).toBe('revision_required');
  });

  it('flags a rewrite that drops a named technology', () => {
    const found = codes(
      draft({
        target: METRIC_TARGET,
        originalText: METRIC_BULLET,
        proposedText: 'Migrated 12 production services onto container orchestration',
      })
    );

    expect(found).toContain('removed-proper-noun');
  });

  it('rejects a rewrite that is the same sentence again', () => {
    const found = codes(draft({ proposedText: `${WEAK_BULLET}.` }));
    expect(found).toContain('no-meaningful-change');
  });

  it('rejects an empty replacement', () => {
    const found = codes(draft({ proposedText: '   ' }));
    expect(found).toContain('empty-proposal');
  });

  it('flags a bullet too long for a conventional resume', () => {
    const found = codes(draft({ proposedText: `Rebuilt backend services. ${'x'.repeat(400)}` }));
    expect(found).toContain('too-long');
  });
});

// ============================================================================
// GOOD REWRITES
// ============================================================================

describe('a genuine improvement passes', () => {
  it('accepts stronger wording that changes no fact', () => {
    const issues = checkProposal(
      draft({
        proposedText: 'Built and maintained the backend services behind the platform',
      }),
      { resume: RESUME }
    );

    expect(issues.filter((issue) => issue.severity !== 'info')).toEqual([]);
    expect(verdictFloorFromIssues(issues)).toBe('approved');
  });

  it('notes a missing figure as an opportunity rather than a failure', () => {
    const issues = checkProposal(
      draft({ proposedText: 'Built and maintained the backend services behind the platform' }),
      { resume: RESUME }
    );

    const opportunity = issues.find((issue) => issue.code === 'metric-opportunity');
    expect(opportunity?.severity).toBe('info');
    // An `info` issue decides nothing.
    expect(verdictFloorFromIssues(issues)).toBe('approved');
  });

  it('accepts a keyword the resume already evidences', () => {
    const found = codes(
      draft({
        target: METRIC_TARGET,
        originalText: METRIC_BULLET,
        proposedText: 'Migrated 12 production services onto Kubernetes',
        keywordsAddressed: ['Kubernetes'],
      })
    );

    expect(found).not.toContain('unsupported-keyword');
    expect(found).not.toContain('unsupported-skill');
  });
});

// ============================================================================
// UNCERTAINTY AND BATCHES
// ============================================================================

describe('uncertainty and batch-level problems', () => {
  it('sends a proposal whose author flagged a gap to the user', () => {
    const issues = checkProposal(
      draft({
        proposedText: 'Built and maintained the backend services behind the platform',
        uncertainties: ['How many services were there? The resume does not say.'],
      }),
      { resume: RESUME }
    );

    expect(issues.map((issue) => issue.code)).toContain('author-flagged-uncertainty');
    expect(verdictFloorFromIssues(issues)).toBe('needs_user_input');
  });

  it('rejects two proposals that rewrite the same element', () => {
    const first = draft({
      proposalId: 'a',
      proposedText: 'Built and maintained the backend services behind the platform',
    });
    const second = draft({
      proposalId: 'b',
      proposedText: 'Built the backend services the platform depends on',
    });

    const results = checkProposalBatch([first, second], { resume: RESUME });
    expect(results.get('a')!.map((issue) => issue.code)).toContain('duplicate-target');
    expect(results.get('b')!.map((issue) => issue.code)).toContain('duplicate-target');
  });

  it('flags two elements rewritten into the same sentence', () => {
    const shared = 'Built and maintained the backend services behind the platform';
    const first = draft({ proposedText: shared });
    const second = draft({
      target: METRIC_TARGET,
      originalText: METRIC_BULLET,
      proposedText: shared,
    });

    const results = checkProposalBatch([first, second], { resume: RESUME });
    expect(results.get(first.proposalId)!.map((issue) => issue.code)).toContain(
      'conflicting-proposal'
    );
  });

  it('flags cited evidence that is not on the resume', () => {
    const found = codes(
      draft({
        proposedText: 'Built and maintained the backend services behind the platform',
        sourceEvidence: ['Managed a 30-person engineering organisation'],
      })
    );

    expect(found).toContain('unsupported-evidence-citation');
  });
});

// ============================================================================
// VERDICT FLOORS
// ============================================================================

describe('severity decides the verdict floor', () => {
  it('maps each severity onto the verdict it forces', () => {
    expect(verdictFloorFromIssues([])).toBe('approved');
    expect(verdictFloorFromIssues([{ code: 'x', severity: 'info', detail: 'd' }])).toBe('approved');
    expect(verdictFloorFromIssues([{ code: 'x', severity: 'clarify', detail: 'd' }])).toBe(
      'needs_user_input'
    );
    expect(verdictFloorFromIssues([{ code: 'x', severity: 'revision', detail: 'd' }])).toBe(
      'revision_required'
    );
    expect(
      verdictFloorFromIssues([
        { code: 'x', severity: 'clarify', detail: 'd' },
        { code: 'y', severity: 'blocking', detail: 'd' },
        { code: 'z', severity: 'revision', detail: 'd' },
      ])
    ).toBe('rejected');
  });
});
