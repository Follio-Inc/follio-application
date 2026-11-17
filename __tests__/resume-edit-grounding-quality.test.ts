/**
 * Proposal quality guards (Part 7E).
 *
 * Both cases here are real: a live GPT-4o run through the Resume Agent
 * produced them, and both passed grounding as it stood. `unsupportedTerms`
 * only catches invented proper nouns and keyword-stuffed posting terms, so an
 * outcome assembled from ordinary lowercase words went straight through.
 *
 * These exercise the real pipeline — `groundAssistantEdits`, not a stub.
 */

import { describe, expect, it } from 'vitest';

import { RESUME_EDIT_AGENT_TOOLS } from '@/services/agents/resume/edit-tools';
import { groundAssistantEdits } from '@/services/ai/resume-edit/assistant';
import { buildEditFacts, type EditSourceProfile } from '@/services/ai/resume-edit/facts';
import { hasEditorialAside, unsupportedImpact } from '@/services/ai/resume-edit/ground';

const JOB_DESCRIPTION = `Senior Backend Engineer. Build backend services in Python.
Work with PostgreSQL daily. Kubernetes experience required.`;

const profile: EditSourceProfile = {
  headline: 'Backend Engineer',
  summary: 'Engineer building payment systems in Python.',
  workExperiences: [
    {
      id: 'exp-1',
      company: 'Riverbend',
      role: 'Backend Engineer',
      startDate: new Date('2019-07-01'),
      endDate: null,
      isCurrent: true,
      bullets: [
        'Wrote Django REST services backing an inventory product used by 40 warehouse teams',
        'Replaced a hand-rolled CSV importer with a validated pipeline, dropping support tickets about bad uploads by half',
        'Built Python services for checkout that cut median latency 30%',
      ],
      bulletsHtml: null,
      isVisible: true,
    },
  ],
  skills: [{ name: 'Python' }, { name: 'PostgreSQL' }, { name: 'Django' }],
  educations: [],
  certifications: [],
  projects: [],
};

const facts = buildEditFacts(profile);
const corpus = [
  facts.summary,
  ...facts.experiences.flatMap((e) => e.bullets.map((b) => b.text)),
].join('\n');

/** One rewrite through the real grounding pipeline. */
function ground(ref: string, text: string) {
  const result = groundAssistantEdits(facts, {
    changes: [{ ref, text }],
    instructions: 'Tailor my resume to this posting',
    jobDescription: JOB_DESCRIPTION,
  });
  return {
    kept: result.changes.length === 1,
    dropped: result.dropped,
    ignored: result.ignored,
    after: result.changes[0]?.after ?? null,
  };
}

const BULLET_1 = facts.experiences[0].bullets[0].text;
const BULLET_2 = facts.experiences[0].bullets[1].text;

// ---------------------------------------------------------------------------

describe('unsupported impact claims', () => {
  it('drops the exact clause a live GPT-4o run appended', () => {
    // Verbatim from local-tests/resume-agent/output/live-agent-proposals.json.
    const result = ground(
      'E1.1',
      'Developed Django REST services for an inventory product utilized by 40 warehouse teams, enhancing operational efficiency.'
    );

    expect(result.kept).toBe(false);
    expect(result.dropped).toBe(1);
  });

  it('names the vague benefit it objected to', () => {
    expect(
      unsupportedImpact('Shipped the importer, improving efficiency', {
        corpus,
        before: BULLET_1,
      })
    ).toEqual(['efficiency']);
  });

  it.each([
    'improving productivity',
    'increasing scalability',
    'driving business value',
    'boosting engagement',
  ])('rejects the appended benefit %p', (tail) => {
    expect(
      unsupportedImpact(`Wrote Django REST services, ${tail}`, { corpus, before: BULLET_1 })
    ).not.toHaveLength(0);
  });

  it('keeps a benefit the resume itself already states', () => {
    const resumeSaysReliability = `${corpus}\nImproved reliability of the ingest path`;

    expect(
      unsupportedImpact('Rebuilt the ingest path, improving reliability', {
        corpus: resumeSaysReliability,
        before: BULLET_1,
      })
    ).toEqual([]);
  });

  it('keeps a benefit the original line already claimed', () => {
    expect(
      unsupportedImpact('Tuned the pipeline for efficiency', {
        corpus,
        before: 'Rewrote the pipeline, gaining efficiency',
      })
    ).toEqual([]);
  });
});

describe('qualitative wording is not rejected wholesale', () => {
  it.each([
    'Wrote Django REST services backing an inventory product used by 40 warehouse teams company-wide',
    'Built and maintained Django REST services for an inventory product used by 40 warehouse teams',
    'Delivered Django REST services supporting an inventory product used by 40 warehouse teams',
  ])('keeps the ordinary rewrite %#', (text) => {
    const result = ground('E1.1', text);

    expect(result.kept).toBe(true);
    expect(result.after).toBe(text);
  });

  it('allows a plain reordering with no outcome at all', () => {
    const result = ground(
      'E1.1',
      'For 40 warehouse teams, wrote the Django REST services backing an inventory product'
    );

    expect(result.kept).toBe(true);
  });
});

describe('existing numbers survive', () => {
  it('keeps a rewrite that preserves "by half"', () => {
    const result = ground(
      'E1.2',
      'Replaced a hand-rolled CSV importer with a validated pipeline, cutting support tickets about bad uploads by half'
    );

    expect(result.kept).toBe(true);
    expect(result.after).toMatch(/by half/);
  });

  it('keeps a rewrite that preserves a percentage', () => {
    const result = ground(
      'E1.3',
      'Built Python services for checkout and refunds that cut median latency 30%'
    );

    expect(result.kept).toBe(true);
    expect(result.after).toMatch(/30%/);
  });

  it('still refuses a rewrite that would lose the number', () => {
    const result = ground('E1.3', 'Built Python services for checkout and refunds');

    expect(result.kept).toBe(false);
  });
});

describe('editorial commentary never reaches a bullet', () => {
  it('drops the exact hedge a live GPT-4o run wrote', () => {
    // Verbatim from the live run. Note it also kept "by half", so the number
    // guard would not have caught it.
    const result = ground(
      'E1.2',
      'Implemented a validated pipeline to replace a hand-rolled CSV importer, reducing support tickets by half, though exact numbers are not specified.'
    );

    expect(result.kept).toBe(false);
    expect(result.dropped).toBe(1);
  });

  it.each([
    'Shipped the importer, though exact numbers are not specified',
    'Shipped the importer; metrics are not provided',
    'Shipped the importer (assuming a 30% gain)',
    'Shipped the importer [insert metric here]',
    'Based on the resume, shipped the importer',
    'Shipped the importer, impact TBD',
    'Reduced tickets by an estimated amount, not quantified in the resume',
  ])('flags %p', (text) => {
    expect(hasEditorialAside(text)).toBe(true);
  });

  it.each([
    'Replaced a hand-rolled CSV importer with a validated pipeline, dropping support tickets about bad uploads by half',
    'Built Python services for checkout that cut median latency 30%',
    'Wrote Django REST services for an inventory product used by 40 warehouse teams',
    'Specified the schema for the settlement ledger',
    'Documented the on-call runbooks the team still uses',
  ])('leaves the ordinary line %# alone', (text) => {
    expect(hasEditorialAside(text)).toBe(false);
  });

  it('does not flag a legitimate parenthesis', () => {
    expect(hasEditorialAside('Led the migration (Python 2 to 3) across 12 services')).toBe(false);
  });
});

describe('the earlier guards still hold', () => {
  it('still drops an invented tool', () => {
    const result = ground(
      'E1.1',
      'Wrote Django REST services on Kubernetes for an inventory product used by 40 warehouse teams'
    );

    expect(result.kept).toBe(false);
    expect(result.dropped).toBe(1);
  });

  it('still ignores a rewrite identical to the line', () => {
    const result = ground('E1.1', BULLET_1);

    expect(result.kept).toBe(false);
    expect(result.dropped).toBe(0);
    expect(result.ignored).toBe(1);
  });

  it('still blanks an invented number', () => {
    const result = ground(
      'E1.1',
      'Wrote Django REST services backing an inventory product used by 40 warehouse teams and 900 stores'
    );

    expect(result.after).toContain('[__]');
  });

  it('leaves BULLET_2 reachable for the number tests', () => {
    expect(BULLET_2).toMatch(/by half/);
  });
});

describe('the agent still cannot apply anything', () => {
  it('exposes only a read tool and a propose tool', () => {
    expect(RESUME_EDIT_AGENT_TOOLS.map((tool) => tool.name)).toEqual([
      'read_resume_lines',
      'propose_resume_edits',
    ]);
  });

  it('registers nothing that could write to the resume', () => {
    for (const tool of RESUME_EDIT_AGENT_TOOLS) {
      expect(tool.name).not.toMatch(/apply|revert|delete|publish/i);
    }
  });

  it('tells the model it cannot invent outcomes or editorialise', async () => {
    const { resumeProposeAgent } = await import('@/services/agents/resume/resume.agent');
    const text = String(resumeProposeAgent.instructions).toLowerCase();

    expect(text).toContain('never add an outcome the resume does not already state');
    expect(text).toContain('exact numbers are not specified');
  });
});
