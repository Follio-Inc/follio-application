import { describe, expect, it } from 'vitest';

import { SuggestResumeEditsSchema } from '@/lib/ai-connector/resume-edits';
import {
  editableDocument,
  insertionIndex,
  locateLine,
  locateProposal,
  planApply,
  planRevert,
  readBullets,
  type EditableDocument,
} from '@/lib/resume-edit/document';
import { buildRedline, redlineListHtml } from '@/lib/resume-edit/redline';
import {
  changeTitle,
  keepAllLabel,
  keepLabel,
  keptLabel,
  summarizeReview,
} from '@/lib/resume-edit/review';
import {
  changeOp,
  EDIT_PLACEHOLDER,
  explainProposal,
  RESUME_EDIT_LIMITS,
  type ResumeEditChange,
} from '@/lib/resume-edit/types';
import {
  buildEditFacts,
  planBatches,
  resolveInsertRef,
  type EditSourceProfile,
} from '@/services/ai/resume-edit/facts';
import { groundEdits } from '@/services/ai/resume-edit/ground';
import { buildResumeEditUserPrompt } from '@/services/ai/resume-edit/prompt';

const P = '<p style="text-align: justify">';
const list = (...lines: string[]) =>
  `<ul class="rich-text-bullets">${lines.map((line) => `<li>${P}${line}</p></li>`).join('')}</ul>`;

const doc: EditableDocument = {
  headline: 'Backend Engineer',
  summary: `${P}Engineer building payment systems.</p>`,
  experiences: [
    {
      id: 'exp-acme',
      bullets: [],
      bulletsHtml: list('Built the payments API', 'Cut deploy time by 40%', 'Ran on-call'),
    },
    { id: 'exp-beta', bullets: ['Maintained dashboards', 'Wrote docs'], bulletsHtml: null },
  ],
};

const acme = (target: EditableDocument) => readBullets(target.experiences[0]!).lines;

function change(overrides: Partial<ResumeEditChange>): ResumeEditChange {
  return {
    id: 'E1.2',
    op: 'rewrite',
    target: { kind: 'bullet', experienceId: 'exp-acme', index: 1 },
    label: 'Engineer · Acme',
    before: 'Cut deploy time by 40%',
    after: 'Cut deploy time by 40% with CI caching',
    reason: 'More specific',
    status: 'proposed',
    ...overrides,
  };
}

const insertFirst = change({
  id: 'E1.0+',
  op: 'insert',
  target: { kind: 'bullet', experienceId: 'exp-acme', index: 0 },
  before: '',
  after: 'Led the billing rewrite',
  anchor: null,
});

const removeOnCall = change({
  id: 'E1.3',
  op: 'delete',
  target: { kind: 'bullet', experienceId: 'exp-acme', index: 2 },
  before: 'Ran on-call',
  after: '',
});

const now = new Date('2026-10-11T09:00:00Z');
const chosen = (...changes: ResumeEditChange[]) =>
  new Map(changes.map((item) => [item.id, item.after]));

describe('locating lines', () => {
  it('finds a line by its text, nearest to the hint when it repeats', () => {
    const lines = ['A', 'B', 'A', 'C'];
    expect(locateLine(lines, 'a', 0)).toBe(0);
    expect(locateLine(lines, 'A', 3)).toBe(2);
    expect(locateLine(lines, 'Z', 0)).toBeNull();
    expect(locateLine(lines, '  ', 0)).toBeNull();
  });

  it('puts a new line after the line it followed, wherever that line is now', () => {
    expect(insertionIndex(['X', 'A', 'B'], 'A', 1)).toBe(2);
    expect(insertionIndex(['A', 'B'], null, 1)).toBe(0);
    expect(insertionIndex(['A', 'B'], 'gone', 9)).toBe(2);
  });

  it('reads a draft profile the way the server reads a stored one', () => {
    expect(
      editableDocument({ headline: undefined, workExperiences: [{ id: 'x', bullets: null }] })
    ).toEqual({
      headline: null,
      summary: null,
      experiences: [{ id: 'x', bullets: [], bulletsHtml: null }],
    });
  });
});

describe('keeping and undoing new and removed bullets', () => {
  it('adds a bullet in the style of its neighbours, and removes one', () => {
    const planned = planApply(
      doc,
      [insertFirst, removeOnCall],
      chosen(insertFirst, removeOnCall),
      now
    );
    expect(planned.outcomes).toEqual({ 'E1.0+': 'applied', 'E1.3': 'applied' });
    expect(acme(planned.doc)).toEqual([
      'Led the billing rewrite',
      'Built the payments API',
      'Cut deploy time by 40%',
    ]);
    expect(planned.doc.experiences[0]?.bulletsHtml).toContain(
      `<li>${P}Led the billing rewrite</p></li>`
    );
    expect(planned.changes[1]?.applied).toMatchObject({
      previousRaw: `${P}Ran on-call</p>`,
      anchor: 'Cut deploy time by 40%',
    });
  });

  it('keeps a rewrite on the right line after earlier lines moved', () => {
    const first = planApply(doc, [insertFirst], chosen(insertFirst), now);
    const rewrite = change({});
    const second = planApply(first.doc, [rewrite], chosen(rewrite), now);
    expect(second.outcomes).toEqual({ 'E1.2': 'applied' });
    expect(acme(second.doc)).toEqual([
      'Led the billing rewrite',
      'Built the payments API',
      'Cut deploy time by 40% with CI caching',
      'Ran on-call',
    ]);
  });

  it('undoes in any order: a removed bullet returns after the line it followed', () => {
    const planned = planApply(
      doc,
      [insertFirst, removeOnCall],
      chosen(insertFirst, removeOnCall),
      now
    );
    const restored = planRevert(planned.doc, planned.changes, new Set(['E1.3']));
    expect(restored.outcomes).toEqual({ 'E1.3': 'reverted' });
    expect(acme(restored.doc)).toEqual([
      'Led the billing rewrite',
      'Built the payments API',
      'Cut deploy time by 40%',
      'Ran on-call',
    ]);
    const all = planRevert(restored.doc, restored.changes, null);
    expect(all.outcomes).toEqual({ 'E1.0+': 'reverted' });
    expect(acme(all.doc)).toEqual(acme(doc));
  });

  it('leaves a new bullet alone on undo once the user has reworded it', () => {
    const planned = planApply(doc, [insertFirst], chosen(insertFirst), now);
    const edited: EditableDocument = {
      ...planned.doc,
      experiences: [
        {
          ...planned.doc.experiences[0]!,
          bulletsHtml: list('Led the billing rewrite in Go', 'Built the payments API'),
        },
        planned.doc.experiences[1]!,
      ],
    };
    const undone = planRevert(edited, planned.changes, null);
    expect(undone.outcomes).toEqual({ 'E1.0+': 'kept' });
  });

  it('works on plain bullets without editor HTML', () => {
    const removeDocs = change({
      id: 'E2.2',
      op: 'delete',
      target: { kind: 'bullet', experienceId: 'exp-beta', index: 1 },
      before: 'Wrote docs',
      after: '',
    });
    const planned = planApply(doc, [removeDocs], chosen(removeDocs), now);
    expect(planned.doc.experiences[1]?.bullets).toEqual(['Maintained dashboards']);
    expect(planRevert(planned.doc, planned.changes, null).doc.experiences[1]?.bullets).toEqual([
      'Maintained dashboards',
      'Wrote docs',
    ]);
  });

  it('treats sessions saved before edit kinds existed as rewrites', () => {
    const legacy = change({ op: undefined });
    expect(changeOp(legacy)).toBe('rewrite');
    expect(locateProposal(doc, legacy)).toMatchObject({ index: 1 });
  });

  it('can always keep a removal; there is no text to check', () => {
    expect(explainProposal(removeOnCall, '')).toBeNull();
    expect(explainProposal(insertFirst, `Led ${EDIT_PLACEHOLDER} launches`)).not.toBeNull();
  });
});

describe('grounding new and removed bullets', () => {
  const profile: EditSourceProfile = {
    headline: 'Backend Engineer',
    summary: null,
    workExperiences: [
      {
        id: 'exp-acme',
        company: 'Acme',
        role: 'Engineer',
        startDate: '2020-01-01',
        endDate: null,
        isCurrent: true,
        bullets: [],
        bulletsHtml: list('Built the payments API', 'Cut deploy time by 40%', 'Ran on-call'),
        isVisible: true,
      },
    ],
    skills: [],
    educations: [],
    certifications: [],
    projects: [],
  };
  const facts = buildEditFacts(profile);
  const input = {
    facts,
    editableRefs: ['E1.1', 'E1.2', 'E1.3'],
    jobDescription: null,
    instructions: null,
  };

  it('resolves add-after refs to a slot and the line it follows', () => {
    expect(resolveInsertRef(facts, 'E1.2+')).toMatchObject({
      after: 'E1.2',
      anchor: 'Cut deploy time by 40%',
      target: { kind: 'bullet', experienceId: 'exp-acme', index: 2 },
    });
    expect(resolveInsertRef(facts, 'E1.0+')).toMatchObject({ anchor: null });
    expect(resolveInsertRef(facts, 'E1.9+')).toBeNull();
    expect(resolveInsertRef(facts, 'E1.2')).toBeNull();
  });

  it('adds grounded bullets, up to the limit per role, never a copy of an existing one', () => {
    const result = groundEdits(
      {
        changes: [
          { ref: 'E1.0+', text: 'Owned the payments API on-call rotation' },
          { ref: 'E1.1+', text: 'Cut deploy time by 40%' },
          { ref: 'E1.2+', text: 'Built deploy tooling for the payments API' },
          { ref: 'E1.3+', text: 'Ran the payments API on-call' },
        ],
      },
      input
    );
    expect(result.changes.map((item) => [item.id, changeOp(item)])).toEqual([
      ['E1.0+', 'insert'],
      ['E1.2+', 'insert'],
    ]);
    expect(result.changes).toHaveLength(RESUME_EDIT_LIMITS.maxNewBulletsPerRole);
    expect(result.changes[1]).toMatchObject({ before: '', anchor: 'Cut deploy time by 40%' });
  });

  it('drops a new bullet that claims a tool the resume never shows', () => {
    const result = groundEdits(
      { changes: [{ ref: 'E1.1+', text: 'Moved the payments API to Kubernetes' }] },
      input
    );
    expect(result).toEqual({ changes: [], dropped: 1 });
  });

  it('removes bullets but always leaves a role its minimum', () => {
    const result = groundEdits(
      {
        changes: [
          { ref: 'E1.3', remove: true },
          { ref: 'E1.2', remove: true },
        ],
      },
      input
    );
    expect(result.changes.map((item) => [item.id, changeOp(item), item.before])).toEqual([
      ['E1.3', 'delete', 'Ran on-call'],
    ]);
  });

  it('lists where the model may add bullets', () => {
    const batch = planBatches(facts, { kind: 'all' }).find((item) => item.experience);
    const prompt = buildResumeEditUserPrompt(facts, batch!, {
      jobDescription: null,
      instructions: null,
      presets: ['outcomes'],
      scope: { kind: 'all' },
    });
    expect(prompt).toContain('ADD AFTER: E1.0+, E1.1+, E1.2+, E1.3+');
  });
});

describe('assistant line edits', () => {
  const parse = (changes: unknown[]) =>
    SuggestResumeEditsSchema.safeParse({ request: 'Tighten my bullets', changes });

  it('accepts rewrites, add-after refs, and removals', () => {
    expect(
      parse([
        { ref: 'E1.1', text: 'Built it' },
        { ref: 'E1.1+', text: 'New line' },
        { ref: 'E1.2', remove: true },
      ]).success
    ).toBe(true);
  });

  it('refuses a missing text, and removing anything but a bullet', () => {
    expect(parse([{ ref: 'E1.1' }]).success).toBe(false);
    expect(parse([{ ref: 'S', remove: true }]).success).toBe(false);
    expect(parse([{ ref: 'E1.0', remove: true }]).success).toBe(false);
  });
});

describe('review wording', () => {
  it('says Remove for removals and names new bullets', () => {
    expect(keepLabel(removeOnCall)).toBe('Remove');
    expect(keptLabel(removeOnCall)).toBe('Removed');
    expect(keepLabel(change({}))).toBe('Keep');
    expect(changeTitle(insertFirst)).toBe('New bullet');
  });

  it('counts only ready suggestions in Keep all', () => {
    const blank = change({ id: 'E1.1', after: `Built ${EDIT_PLACEHOLDER} APIs` });
    const review = summarizeReview([change({}), blank, removeOnCall], {}, new Set());
    expect(keepAllLabel(review)).toBe('Keep 2 ready');
    expect(keepAllLabel(summarizeReview([change({})], {}, new Set()))).toBe('Keep all 1');
  });
});

describe('drawing suggestions into the resume', () => {
  const texts = {};
  const none = new Set<string>();

  it('marks a rewrite whole, with only its new words in green', () => {
    const redline = buildRedline(doc, [change({})], { texts, skipped: none });
    const role = redline.roles.get('exp-acme')!;
    expect(role.lines.get(1)).toEqual({
      id: 'E1.2',
      kind: 'modified',
      html: '<mark class="redline redline--modified">Cut deploy time by 40%<ins class="redline-ins"> with CI caching</ins></mark>',
    });
    expect(redline.placed).toEqual(['E1.2']);
  });

  it('draws new and removed bullets into the list the resume renders', () => {
    const redline = buildRedline(doc, [insertFirst, removeOnCall], { texts, skipped: none });
    const html = redlineListHtml(doc.experiences[0]!.bulletsHtml!, redline.roles.get('exp-acme')!);
    expect(html).toBe(
      '<ul class="rich-text-bullets">' +
        `<li data-edit-id="E1.0+" data-edit-kind="added">${P}<ins class="redline redline--added">Led the billing rewrite</ins></p></li>` +
        `<li>${P}Built the payments API</p></li>` +
        `<li>${P}Cut deploy time by 40%</p></li>` +
        `<li data-edit-id="E1.3" data-edit-kind="removed">${P}<del class="redline redline--removed">Ran on-call</del></p></li>` +
        '</ul>'
    );
  });

  it('shows what the user typed, escaped, with blanks called out', () => {
    const redline = buildRedline(doc, [insertFirst], {
      texts: { 'E1.0+': `Led <b>${EDIT_PLACEHOLDER}</b> launches` },
      skipped: none,
    });
    expect(redline.roles.get('exp-acme')?.inserts.get(0)?.[0]?.html).toBe(
      `<ins class="redline redline--added">Led &lt;b&gt;<span class="redline-blank">${EDIT_PLACEHOLDER}</span>&lt;/b&gt; launches</ins>`
    );
  });

  it('skips settled and skipped suggestions, and leaves stale ones to the panel', () => {
    const stale = change({ id: 'E1.1', before: 'Wrote the old API', after: 'Wrote the new API' });
    const redline = buildRedline(doc, [change({ status: 'applied' }), removeOnCall, stale], {
      texts,
      skipped: new Set(['E1.3']),
    });
    expect(redline.placed).toEqual([]);
    expect(redline.unplaced).toEqual(['E1.1']);
  });

  it('marks the headline and each summary paragraph, keeping only the alignment', () => {
    const redline = buildRedline(
      { ...doc, summary: '<p style="text-align: justify" onclick="x()">Engineer.</p>' },
      [
        change({
          id: 'H',
          target: { kind: 'headline' },
          before: 'Backend Engineer',
          after: 'Backend Engineer for payments',
        }),
        change({
          id: 'S',
          target: { kind: 'summary' },
          before: 'Engineer.',
          after: 'Engineer.\nShips payments.',
        }),
      ],
      { texts, skipped: none }
    );
    expect(redline.headline?.html).toBe(
      '<mark class="redline redline--modified">Backend Engineer<ins class="redline-ins"> for payments</ins></mark>'
    );
    expect(redline.summary?.html).toBe(
      `${P}<mark class="redline redline--modified">Engineer.</mark></p>` +
        `${P}<mark class="redline redline--modified"><ins class="redline-ins">Ships payments.</ins></mark></p>`
    );
  });

  it('starts a list for a role that has no bullets yet', () => {
    const redline = buildRedline(
      { ...doc, experiences: [{ id: 'exp-acme', bullets: [], bulletsHtml: '<ul></ul>' }] },
      [insertFirst],
      { texts, skipped: none }
    );
    expect(redlineListHtml('', redline.roles.get('exp-acme')!)).toContain(
      '<ul class="resume-bullets"><li data-edit-id="E1.0+"'
    );
  });
});
