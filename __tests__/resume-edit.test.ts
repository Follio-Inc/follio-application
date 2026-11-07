import { describe, expect, it } from 'vitest';

import {
  applyMessage,
  assistantInstructions,
  selectForApply,
  suggestionMessage,
  toResumeLinesView,
  undoMessage,
  type SuggestResumeEditsInput,
} from '@/lib/ai-connector/resume-edits';
import {
  planApply,
  planRevert,
  readBullets,
  readTarget,
  writeTarget,
  type EditableDocument,
} from '@/lib/resume-edit/document';
import { resumeEditBriefSchema } from '@/lib/resume-edit/requests';
import {
  changeTitle,
  describeBrief,
  fillBlanks,
  groupChanges,
  splitBlanks,
  summarizeReview,
} from '@/lib/resume-edit/review';
import {
  EDIT_PLACEHOLDER,
  explainBrief,
  explainChangeText,
  type ResumeEditBrief,
  type ResumeEditChange,
} from '@/lib/resume-edit/types';
import { diffSide, diffWords, isRewrite } from '@/lib/resume-edit/word-diff';
import {
  buildEditFacts,
  planBatches,
  resolveRef,
  type EditSourceProfile,
} from '@/services/ai/resume-edit/facts';
import {
  blankForeignNumbers,
  groundEdits,
  unsupportedTerms,
} from '@/services/ai/resume-edit/ground';
import { groundAssistantEdits } from '@/services/ai/resume-edit/assistant';
import { buildResumeEditUserPrompt } from '@/services/ai/resume-edit/prompt';

const html =
  '<ul class="rich-text-bullets bullet-style-disc" data-bullet-style="disc">' +
  '<li><p style="text-align: justify">Built the <strong>payments</strong> API in Python</p></li>' +
  '<li><p style="text-align: left">Cut deploy time by 40% with CI caching</p></li>' +
  '</ul>';

const profile: EditSourceProfile = {
  headline: 'Backend Engineer',
  summary: '<p style="text-align: justify">Engineer building payment systems.</p>',
  workExperiences: [
    {
      id: 'exp-acme',
      company: 'Acme',
      role: 'Backend Engineer',
      startDate: new Date('2020-01-01'),
      endDate: null,
      isCurrent: true,
      bullets: [],
      bulletsHtml: html,
      isVisible: true,
    },
    {
      id: 'exp-beta',
      company: 'Beta',
      role: 'Developer',
      startDate: new Date('2017-01-01'),
      endDate: new Date('2019-12-01'),
      isCurrent: false,
      bullets: ['Maintained React dashboards for 12 clients'],
      bulletsHtml: null,
      isVisible: true,
    },
    {
      id: 'exp-hidden',
      company: 'Gamma',
      role: 'Intern',
      startDate: new Date('2016-01-01'),
      endDate: new Date('2016-06-01'),
      isCurrent: false,
      bullets: ['Wrote tests'],
      bulletsHtml: null,
      isVisible: false,
    },
  ],
  skills: [{ name: 'PostgreSQL' }, { name: 'Docker' }],
  educations: [
    { institution: 'State University', degree: 'B.S.', fieldOfStudy: 'Computer Science' },
  ],
  certifications: [],
  projects: [],
};

const facts = buildEditFacts(profile);

const job =
  'Senior Backend Engineer. 5+ years of Python. Kubernetes in production. ' +
  'Experience with payments and PostgreSQL. Strong ownership of reliability and observability.';

function brief(overrides: Partial<ResumeEditBrief> = {}): ResumeEditBrief {
  return {
    jobDescription: null,
    instructions: null,
    presets: ['quantify'],
    scope: { kind: 'all' },
    ...overrides,
  };
}

describe('buildEditFacts', () => {
  it('gives each visible role and bullet a short ref', () => {
    expect(facts.experiences.map((item) => item.ref)).toEqual(['E1', 'E2']);
    expect(facts.experiences[0]?.bullets.map((bullet) => bullet.ref)).toEqual(['E1.1', 'E1.2']);
    expect(facts.experiences[0]?.bullets[0]?.text).toBe('Built the payments API in Python');
    expect(facts.summary).toBe('Engineer building payment systems.');
  });

  it('resolves refs to targets and refuses unknown ones', () => {
    expect(resolveRef(facts, 'E2.1')?.target).toEqual({
      kind: 'bullet',
      experienceId: 'exp-beta',
      index: 0,
    });
    expect(resolveRef(facts, 'E9.1')).toBeNull();
    expect(resolveRef(facts, 'X')).toBeNull();
  });

  it('plans one batch for the header and one per role', () => {
    const batches = planBatches(facts, { kind: 'all' });
    expect(batches.map((batch) => batch.refs)).toEqual([['H', 'S'], ['E1.1', 'E1.2'], ['E2.1']]);
    expect(planBatches(facts, { kind: 'experience', experienceId: 'exp-beta' })).toHaveLength(1);
    expect(planBatches(facts, { kind: 'summary' })[0]?.refs).toEqual(['H', 'S']);
  });

  it('marks the job description as a target, not evidence', () => {
    const [batch] = planBatches(facts, { kind: 'all' });
    const prompt = buildResumeEditUserPrompt(facts, batch!, brief({ jobDescription: job }));
    expect(prompt).toContain('it is not evidence about the candidate');
    expect(prompt).toContain('EDITABLE: H, S');
  });
});

describe('blankForeignNumbers', () => {
  it('keeps numbers the source states and blanks the rest', () => {
    const source = 'Cut deploy time by 40% with CI caching';
    expect(blankForeignNumbers('Cut deploys 40% and saved $2M', source)).toBe(
      `Cut deploys 40% and saved $${EDIT_PLACEHOLDER}M`
    );
    expect(blankForeignNumbers('Grew users by 300%', source)).toBe(
      `Grew users by ${EDIT_PLACEHOLDER}%`
    );
  });
});

describe('unsupportedTerms', () => {
  const corpus = 'Built the payments API in Python. PostgreSQL. Docker.';

  it('flags tools the resume never mentions', () => {
    expect(
      unsupportedTerms('Built the payments API in Python on Kubernetes', {
        corpus,
        before: '',
        jobDescription: null,
      })
    ).toEqual(['Kubernetes']);
  });

  it('flags job-posting nouns the resume does not show', () => {
    expect(
      unsupportedTerms('Owned observability for the payments API', {
        corpus,
        before: '',
        jobDescription: job,
      })
    ).toContain('observability');
  });

  it('allows rewording with ordinary verbs and known aliases', () => {
    expect(
      unsupportedTerms('Designed and shipped the payments API in Python with Postgres', {
        corpus,
        before: '',
        jobDescription: job,
      })
    ).toEqual([]);
  });
});

describe('groundEdits', () => {
  const input = {
    facts,
    editableRefs: ['H', 'S', 'E1.1', 'E1.2', 'E2.1'],
    jobDescription: job,
    instructions: 'I led a team of 4 at Acme',
  };

  it('keeps honest rewrites and blanks invented numbers', () => {
    const result = groundEdits(
      {
        changes: [
          {
            ref: 'E1.2',
            text: 'Cut deploy time by 40% across 25 services with CI caching',
            reason: 'Shows scale',
          },
          { ref: 'E2.1', text: '• Maintained React dashboards serving 12 clients', reason: '' },
        ],
      },
      input
    );
    expect(result.dropped).toBe(0);
    expect(result.changes.map((change) => change.after)).toEqual([
      `Cut deploy time by 40% across ${EDIT_PLACEHOLDER} services with CI caching`,
      'Maintained React dashboards serving 12 clients',
    ]);
    expect(result.changes[0]?.target).toEqual({
      kind: 'bullet',
      experienceId: 'exp-acme',
      index: 1,
    });
  });

  it('counts the user’s instructions as facts', () => {
    const result = groundEdits(
      { changes: [{ ref: 'E1.1', text: 'Led a team of 4 to build the payments API in Python' }] },
      input
    );
    expect(result.changes[0]?.after).toBe('Led a team of 4 to build the payments API in Python');
  });

  it('drops changes that add skills or seniority the resume does not show', () => {
    const result = groundEdits(
      {
        changes: [
          { ref: 'E1.1', text: 'Built the payments API in Python on Kubernetes' },
          { ref: 'H', text: 'Senior Backend Engineer' },
        ],
      },
      input
    );
    expect(result.changes).toEqual([]);
    expect(result.dropped).toBe(2);
  });

  it('ignores refs outside the batch, duplicates, no-ops, and junk', () => {
    const result = groundEdits(
      {
        changes: [
          { ref: 'E1.1', text: 'Built the payments API in Python' },
          { ref: 'E3.1', text: 'Wrote tests' },
          { ref: 'S', text: 'Engineer who builds payment systems.' },
          { ref: 'S', text: 'Another summary.' },
          { nope: true },
        ],
      },
      { ...input, editableRefs: ['S', 'E1.1'] }
    );
    expect(result.changes.map((change) => change.id)).toEqual(['S']);
    expect(groundEdits('not json', input)).toEqual({ changes: [], dropped: 0 });
  });
});

describe('document targets', () => {
  const doc: EditableDocument = {
    headline: 'Backend Engineer',
    summary: profile.summary,
    experiences: profile.workExperiences.map(({ id, bullets, bulletsHtml }) => ({
      id,
      bullets,
      bulletsHtml,
    })),
  };

  it('replaces one list item and keeps its paragraph style', () => {
    const target = { kind: 'bullet', experienceId: 'exp-acme', index: 1 } as const;
    const next = writeTarget(doc, target, { text: 'Cut deploys 40% & sped up CI' });
    const acme = next?.experiences[0];
    expect(acme?.bulletsHtml).toContain(
      '<li><p style="text-align: left">Cut deploys 40% &amp; sped up CI</p></li>'
    );
    expect(acme?.bulletsHtml).toContain('<strong>payments</strong>');
    expect(acme?.bullets).toHaveLength(2);
    expect(readTarget(next!, target)?.text).toBe('Cut deploys 40% & sped up CI');
  });

  it('writes plain bullets when there is no editor HTML', () => {
    const next = writeTarget(
      doc,
      { kind: 'bullet', experienceId: 'exp-beta', index: 0 },
      { text: 'Ran React dashboards for 12 clients' }
    );
    expect(next?.experiences[1]?.bullets).toEqual(['Ran React dashboards for 12 clients']);
    expect(next?.experiences[1]?.bulletsHtml).toBeNull();
  });

  it('keeps the summary paragraph style', () => {
    const next = writeTarget(doc, { kind: 'summary' }, { text: 'First line.\nSecond line.' });
    expect(next?.summary).toBe(
      '<p style="text-align: justify">First line.</p><p style="text-align: justify">Second line.</p>'
    );
  });

  it('does not edit paragraphs or nested lists', () => {
    expect(
      readBullets({ id: 'x', bullets: [], bulletsHtml: '<p>One paragraph.</p>' }).editable
    ).toBe(false);
  });
});

describe('planApply and planRevert', () => {
  const doc: EditableDocument = {
    headline: 'Backend Engineer',
    summary: '<p>Engineer building payment systems.</p>',
    experiences: [{ id: 'exp-beta', bullets: ['Maintained React dashboards'], bulletsHtml: null }],
  };
  const change = (overrides: Partial<ResumeEditChange>): ResumeEditChange => ({
    id: 'E1.1',
    target: { kind: 'bullet', experienceId: 'exp-beta', index: 0 },
    label: 'Developer · Beta',
    before: 'Maintained React dashboards',
    after: 'Ran React dashboards',
    reason: 'Stronger verb',
    status: 'proposed',
    ...overrides,
  });
  const now = new Date('2026-10-09T12:00:00Z');

  it('applies chosen changes and records what they replaced', () => {
    const planned = planApply(doc, [change({})], new Map([['E1.1', 'Ran React dashboards']]), now);
    expect(planned.outcomes).toEqual({ 'E1.1': 'applied' });
    expect(planned.doc.experiences[0]?.bullets).toEqual(['Ran React dashboards']);
    expect(planned.changes[0]?.applied).toEqual({
      previousRaw: 'Maintained React dashboards',
      text: 'Ran React dashboards',
      at: now.toISOString(),
    });
  });

  it('skips a line the user changed after the suggestion', () => {
    const edited = {
      ...doc,
      experiences: [{ id: 'exp-beta', bullets: ['My own words'], bulletsHtml: null }],
    };
    const planned = planApply(
      edited,
      [change({})],
      new Map([['E1.1', 'Ran React dashboards']]),
      now
    );
    expect(planned.outcomes).toEqual({ 'E1.1': 'conflicted' });
    expect(planned.doc).toBe(edited);
  });

  it('undoes an applied change, but keeps later edits by the user', () => {
    const applied = planApply(doc, [change({})], new Map([['E1.1', 'Ran React dashboards']]), now);
    const reverted = planRevert(applied.doc, applied.changes, null);
    expect(reverted.outcomes).toEqual({ 'E1.1': 'reverted' });
    expect(reverted.doc.experiences[0]?.bullets).toEqual(['Maintained React dashboards']);

    const userEdited = {
      ...applied.doc,
      experiences: [{ id: 'exp-beta', bullets: ['Rewritten by hand'], bulletsHtml: null }],
    };
    const kept = planRevert(userEdited, applied.changes, null);
    expect(kept.outcomes).toEqual({ 'E1.1': 'kept' });
    expect(kept.doc.experiences[0]?.bullets).toEqual(['Rewritten by hand']);
  });
});

describe('request checks', () => {
  it('needs a job, a quick fix, or instructions', () => {
    expect(explainBrief({ jobDescription: null, instructions: null, presets: [] })).toMatch(
      /job description/
    );
    expect(explainBrief({ jobDescription: 'too short', instructions: null, presets: [] })).toMatch(
      /bit more/
    );
    expect(
      explainBrief({ jobDescription: null, instructions: null, presets: ['concise'] })
    ).toBeNull();
  });

  it('parses a brief and fills defaults', () => {
    const parsed = resumeEditBriefSchema.safeParse({ instructions: '  Add numbers  ' });
    expect(parsed.success && parsed.data).toEqual({
      jobDescription: null,
      instructions: 'Add numbers',
      presets: [],
      scope: { kind: 'all' },
    });
    expect(resumeEditBriefSchema.safeParse({}).success).toBe(false);
  });

  it('will not write a line that still has a blank', () => {
    const target = { kind: 'headline' } as const;
    expect(explainChangeText(target, `Grew revenue ${EDIT_PLACEHOLDER}%`)).toMatch(/real number/);
    expect(explainChangeText(target, '   ')).toMatch(/empty/);
    expect(explainChangeText(target, 'Backend Engineer')).toBeNull();
  });
});

describe('review summary', () => {
  const change = (id: string, overrides: Partial<ResumeEditChange> = {}): ResumeEditChange => ({
    id,
    target: { kind: 'bullet', experienceId: 'exp-beta', index: 0 },
    label: 'Developer · Beta',
    before: 'Maintained React dashboards',
    after: 'Ran React dashboards',
    reason: 'Stronger verb',
    status: 'proposed',
    ...overrides,
  });

  it('counts what is ready, what needs input, and what is done', () => {
    const changes = [
      change('ready'),
      change('blank', { after: `Ran ${EDIT_PLACEHOLDER} dashboards` }),
      change('filled', { after: `Ran ${EDIT_PLACEHOLDER} dashboards` }),
      change('skipped'),
      change('applied', { status: 'applied' }),
      change('rejected', { status: 'rejected' }),
      change('conflicted', { status: 'conflicted' }),
    ];
    const summary = summarizeReview(changes, { filled: 'Ran 12 dashboards' }, new Set(['skipped']));
    expect(summary).toEqual({
      total: 7,
      applied: 1,
      open: 3,
      needsInput: 1,
      skipped: 2,
      readyIds: ['ready', 'filled'],
    });
  });

  it('names and groups changes by where they live', () => {
    const headline = change('h', { target: { kind: 'headline' }, label: 'Headline' });
    const bullet = change('b', { target: { kind: 'bullet', experienceId: 'x', index: 2 } });
    expect(changeTitle(headline)).toBe('Headline');
    expect(changeTitle(bullet)).toBe('Bullet 3');
    expect(
      groupChanges([headline, bullet, change('c')]).map(([label, items]) => [label, items.length])
    ).toEqual([
      ['Headline and summary', 1],
      ['Developer · Beta', 2],
    ]);
  });

  it('fills blanks in place and keeps empty ones blank', () => {
    const template = `Cut costs by ${EDIT_PLACEHOLDER}% across ${EDIT_PLACEHOLDER} teams`;
    expect(splitBlanks(template)).toEqual(['Cut costs by ', '% across ', ' teams']);
    expect(fillBlanks(template, [' 30 ', '4'])).toBe('Cut costs by 30% across 4 teams');
    expect(fillBlanks(template, ['30'])).toBe(`Cut costs by 30% across ${EDIT_PLACEHOLDER} teams`);
    expect(fillBlanks(template, ['', '  '])).toBe(template);
    expect(fillBlanks('No blanks here', ['30'])).toBe('No blanks here');
  });

  it('describes a request in a few words', () => {
    expect(describeBrief(brief({ instructions: 'Sound   more senior', jobDescription: job }))).toBe(
      '“Sound more senior” · Tailored to a job · Add numbers'
    );
    expect(describeBrief(brief({ instructions: 'x'.repeat(80), presets: [] }), 10)).toBe(
      `“${'x'.repeat(10)}…”`
    );
    expect(describeBrief(brief({ presets: [] }))).toBe('AI edits');
    expect(describeBrief(brief({ via: 'Claude', instructions: 'Tighten', presets: [] }))).toBe(
      'From Claude · “Tighten”'
    );
  });
});

describe('assistant line edits', () => {
  const request = (overrides: Partial<SuggestResumeEditsInput> = {}): SuggestResumeEditsInput => ({
    request: 'Tighten my bullets',
    changes: [],
    ...overrides,
  });

  it('shows every role, with refs only on lines that can be rewritten', () => {
    const view = toResumeLinesView(facts);
    expect(view.headline).toEqual({ ref: 'H', text: 'Backend Engineer' });
    expect(view.roles.map((role) => role.ref)).toEqual(['E1', 'E2']);
    expect(view.roles[1]).toMatchObject({
      role: 'Developer · Beta',
      bullets: [{ ref: 'E2.1', text: 'Maintained React dashboards for 12 clients' }],
    });
  });

  it('grounds rewrites the same way as in-app suggestions', () => {
    const input = request({
      userFacts: 'I cut cloud costs by 30%',
      changes: [
        { ref: 'E1.2', text: 'Cut deploy time 40% and cloud costs 30% with CI caching' },
        { ref: 'E2.1', text: 'Maintained React dashboards for 50 clients' },
        { ref: 'E1.1', text: 'Built the payments API in Python on Kubernetes' },
        { ref: 'E9.1', text: 'Not a real line' },
        { ref: 'E1.2', text: 'Duplicate of an earlier ref' },
      ],
    });
    const result = groundAssistantEdits(facts, {
      changes: input.changes,
      instructions: assistantInstructions(input),
      jobDescription: null,
    });
    // E2.1 swaps the stated "12 clients" for an unstated number, so it would lose a real figure.
    expect(result.changes.map((change) => [change.id, change.after])).toEqual([
      ['E1.2', 'Cut deploy time 40% and cloud costs 30% with CI caching'],
    ]);
    expect(result.dropped).toBe(1);
    expect(result.ignored).toBe(3);
  });

  it('ignores a rewrite that loses a number the line already states', () => {
    const result = groundAssistantEdits(facts, {
      changes: [
        { ref: 'E1.2', text: 'Cut deploy time with CI caching' },
        { ref: 'E2.1', text: 'Maintained React dashboards for 12 enterprise clients' },
      ],
      instructions: 'Tighten',
      jobDescription: null,
    });
    expect(result.changes.map((change) => change.id)).toEqual(['E2.1']);
  });

  it('applies only open suggestions without blanks', () => {
    const base = {
      target: { kind: 'headline' } as const,
      label: 'Headline',
      before: 'Engineer',
      reason: 'Clearer',
    };
    const changes: ResumeEditChange[] = [
      { ...base, id: 'H', after: 'Backend Engineer', status: 'proposed' },
      { ...base, id: 'S', after: `Grew revenue ${EDIT_PLACEHOLDER}%`, status: 'proposed' },
      { ...base, id: 'E1.1', after: 'Done', status: 'applied' },
    ];
    const all = selectForApply(changes, undefined);
    expect(all.ready.map((change) => change.id)).toEqual(['H']);
    expect(all.needsInput.map((change) => change.id)).toEqual(['S']);
    expect(all.unavailable).toEqual([]);

    const picked = selectForApply(changes, ['E1.1', 'E9.9', 'H', 'H']);
    expect(picked.ready.map((change) => change.id)).toEqual(['H']);
    expect(picked.unavailable).toEqual(['E1.1', 'E9.9']);
  });

  it('tells the assistant what happened and what to do next', () => {
    expect(suggestionMessage({ saved: 2, needsInput: 1, dropped: 0, ignored: 0 })).toMatch(
      /^Saved 2 suggestions\. The resume is unchanged\. 1 line had a number .* only after they confirm/
    );
    expect(suggestionMessage({ saved: 0, needsInput: 0, dropped: 1, ignored: 0 })).toBe(
      'No suggestions were saved. The resume is unchanged. 1 rewrite removed for adding tools, names, titles, or numbers the resume and the user do not show. Ask the user before claiming them.'
    );
    expect(applyMessage({ applied: 0, conflicted: 0, needsInput: 0, unavailable: 2 })).toBe(
      'Nothing was applied. 2 changes were already applied, undone, skipped, or not in this session.'
    );
    expect(undoMessage({ reverted: 1, kept: 1 })).toBe(
      'Undid 1 change. Those lines read as they did before. 1 line was edited since and kept as the user left it.'
    );
  });
});

describe('diffWords', () => {
  it('marks removed and added words', () => {
    expect(diffWords('Maintained React dashboards', 'Ran React dashboards')).toEqual([
      { kind: 'removed', text: 'Maintained' },
      { kind: 'added', text: 'Ran' },
      { kind: 'same', text: ' React dashboards' },
    ]);
  });

  it('shows each side with spaces joining neighbouring changes', () => {
    const parts = diffWords('Was in charge of the React dashboards', 'Owned React dashboards');
    expect(diffSide(parts, 'before')).toEqual([
      { kind: 'removed', text: 'Was in charge of the' },
      { kind: 'same', text: ' React dashboards' },
    ]);
    expect(diffSide(parts, 'after')).toEqual([
      { kind: 'added', text: 'Owned' },
      { kind: 'same', text: ' React dashboards' },
    ]);
    expect(
      diffSide(
        [
          { kind: 'added', text: 'Led' },
          { kind: 'removed', text: 'Worked' },
          { kind: 'same', text: ' ' },
          { kind: 'added', text: 'the' },
          { kind: 'same', text: ' billing ' },
          { kind: 'added', text: 'move' },
        ],
        'after'
      )
    ).toEqual([
      { kind: 'added', text: 'Led the' },
      { kind: 'same', text: ' billing ' },
      { kind: 'added', text: 'move' },
    ]);
  });

  it('treats a line that keeps little of the original as a rewrite', () => {
    expect(
      isRewrite(diffWords('Built internal dashboards', 'Built internal dashboards for 3 teams'))
    ).toBe(false);
    expect(isRewrite(diffWords('Worked on billing', 'Led the payments migration end to end'))).toBe(
      true
    );
    expect(isRewrite(diffWords('', ''))).toBe(false);
  });
});
