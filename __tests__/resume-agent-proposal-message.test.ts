/**
 * Who the "what next" sentence is written for.
 *
 * `suggestionMessage` is shared resume-edit infrastructure with two callers
 * that have different powers:
 *
 *   - the MCP connector, which really does register `apply_resume_edits`
 *     (lib/mcp/tools.ts) — the original wording is correct for it;
 *   - the Resume Agent, which has no apply tool in either mode — the same
 *     wording named a tool it cannot reach.
 *
 * So the clause is a parameter, not a constant, and these tests pin both
 * sides: the connector keeps its wording, the agent gets review-only wording.
 */

import { describe, expect, it } from 'vitest';

import {
  APPLY_VIA_TOOL,
  BLANKS_NEED_THE_USER,
  RESUBMIT_WITH_FACTS,
  REVIEW_IN_FOLLIO,
  suggestionMessage,
} from '@/lib/ai-connector/resume-edits';
import { resumeAgent, resumeProposeAgent } from '@/services/agents/resume/resume.agent';
import { RESUME_EDIT_AGENT_TOOLS } from '@/services/agents/resume/edit-tools';

const saved = { saved: 2, needsInput: 0, dropped: 0, ignored: 0 };

describe('default wording is unchanged for callers that own an apply tool', () => {
  it('keeps the connector guidance when no nextStep is given', () => {
    const message = suggestionMessage(saved);

    expect(message).toContain(APPLY_VIA_TOOL);
    expect(message).toContain('Call apply_resume_edits only after they confirm');
  });

  it('still reports counts the same way', () => {
    const message = suggestionMessage({ saved: 2, needsInput: 1, dropped: 3, ignored: 1 });

    expect(message).toContain('Saved 2 suggestions. The resume is unchanged.');
    expect(message).toContain('3 rewrites removed');
    expect(message).toContain('1 rewrite ignored');
  });
});

describe('the Resume Agent gets wording it can act on', () => {
  it('never tells the agent to call a tool it does not have', () => {
    const message = suggestionMessage({ ...saved, nextStep: REVIEW_IN_FOLLIO });

    expect(message).not.toContain('apply_resume_edits');
    expect(message).not.toMatch(/call .*apply/i);
  });

  it('says the suggestions are pending the user’s review', () => {
    expect(REVIEW_IN_FOLLIO).toMatch(/pending the user’s review/i);
    expect(REVIEW_IN_FOLLIO).toMatch(/cannot apply them/i);
  });

  it('points at the existing builder review controls', () => {
    expect(REVIEW_IN_FOLLIO).toContain('Builder, Edit with AI');
    expect(REVIEW_IN_FOLLIO).toMatch(/approve, edit or reject/i);
    expect(REVIEW_IN_FOLLIO).toMatch(/undone/i);
  });

  it('keeps the saved count and the unchanged-resume promise', () => {
    const message = suggestionMessage({ ...saved, nextStep: REVIEW_IN_FOLLIO });

    expect(message).toContain('Saved 2 suggestions. The resume is unchanged.');
  });

  it('adds no next-step clause when nothing was saved', () => {
    const message = suggestionMessage({
      saved: 0,
      needsInput: 0,
      dropped: 2,
      ignored: 0,
      nextStep: REVIEW_IN_FOLLIO,
    });

    expect(message).toContain('No suggestions were saved. The resume is unchanged.');
    expect(message).not.toContain(REVIEW_IN_FOLLIO);
    expect(message).not.toContain('apply_resume_edits');
  });

  it('is wired into the propose tool, not just available', async () => {
    const source = await import('node:fs').then(({ readFileSync }) =>
      readFileSync('services/agents/resume/edit-tools.ts', 'utf8')
    );

    // Every suggestionMessage call in the agent overrides the default.
    const calls = source.match(/suggestionMessage\(\{/g) ?? [];
    const overrides = source.match(/nextStep: REVIEW_IN_FOLLIO/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(overrides).toHaveLength(calls.length);
    expect(source).not.toContain('APPLY_VIA_TOOL');
  });
});

describe('the tool list is untouched', () => {
  it('still exposes exactly the read and propose tools', () => {
    expect(RESUME_EDIT_AGENT_TOOLS.map((tool) => tool.name)).toEqual([
      'read_resume_lines',
      'propose_resume_edits',
    ]);
  });

  it('registers nothing that could apply an edit', () => {
    for (const tool of RESUME_EDIT_AGENT_TOOLS) {
      expect(tool.name).not.toMatch(/apply|revert|delete|publish/i);
    }
  });
});

describe('propose instructions discourage inflated wording', () => {
  const text = String(resumeProposeAgent.instructions);

  it('names the intensifiers that pad a line that already has a figure', () => {
    for (const word of ['significantly', 'dramatically', 'substantially', 'greatly']) {
      expect(text.toLowerCase()).toContain(word);
    }
  });

  it('explains why the number is enough on its own', () => {
    expect(text).toMatch(/let the figure carry the weight/i);
    expect(text).toMatch(/the number is the evidence/i);
  });

  it('asks for a rewrite only when it gains something', () => {
    expect(text).toMatch(/only when it gains something/i);
    expect(text).toMatch(/reshuffles the same words, leave the line alone/i);
  });

  it('keeps the earlier grounding rules intact', () => {
    expect(text).toMatch(/never add an outcome the resume does not already state/i);
    expect(text).toMatch(/exact numbers are not specified/i);
    expect(text).toMatch(/call propose_resume_edits at most once/i);
  });

  it('still tells the model it cannot apply anything', () => {
    expect(text).toMatch(/cannot apply, approve, revert or delete anything/i);
  });

  it('leaves analyze mode alone', () => {
    const analyze = String(resumeAgent.instructions);

    expect(analyze).not.toMatch(/significantly/i);
    expect(analyze).toContain('read-only');
  });
});

describe('missing-number guidance matches what the caller can do', () => {
  const blanked = { saved: 1, needsInput: 2, dropped: 0, ignored: 0 };

  it('keeps the userFacts route for MCP, which really has that field', () => {
    const message = suggestionMessage(blanked);

    expect(message).toContain(RESUBMIT_WITH_FACTS);
    expect(message).toContain('userFacts');
  });

  it('states the blank the same way for both callers', () => {
    const forMcp = suggestionMessage(blanked);
    const forAgent = suggestionMessage({ ...blanked, blankStep: BLANKS_NEED_THE_USER });

    for (const message of [forMcp, forAgent]) {
      expect(message).toContain('2 lines had a number the user never stated, now shown as [__]');
    }
  });

  it('never tells the Resume Agent to use a field its tool does not accept', () => {
    const message = suggestionMessage({
      ...blanked,
      nextStep: REVIEW_IN_FOLLIO,
      blankStep: BLANKS_NEED_THE_USER,
    });

    expect(message).not.toContain('userFacts');
    expect(message).not.toContain('apply_resume_edits');
  });

  it('tells the agent the blank is the user’s to fill during review', () => {
    expect(BLANKS_NEED_THE_USER).toMatch(/cannot fill a blank in/i);
    expect(BLANKS_NEED_THE_USER).toMatch(/needs a real number/i);
    expect(BLANKS_NEED_THE_USER).toMatch(/type into the blank themselves/i);
    expect(BLANKS_NEED_THE_USER).toMatch(/review it in Follio/i);
    expect(BLANKS_NEED_THE_USER).not.toMatch(/userFacts|apply_resume_edits/i);
  });

  it('says nothing about blanks when there are none', () => {
    const message = suggestionMessage({
      saved: 1,
      needsInput: 0,
      dropped: 0,
      ignored: 0,
      nextStep: REVIEW_IN_FOLLIO,
      blankStep: BLANKS_NEED_THE_USER,
    });

    expect(message).not.toContain('[__]');
    expect(message).not.toContain(BLANKS_NEED_THE_USER);
  });

  it('still warns about blanks even when nothing was saved', () => {
    const message = suggestionMessage({
      saved: 0,
      needsInput: 1,
      dropped: 0,
      ignored: 0,
      blankStep: BLANKS_NEED_THE_USER,
    });

    expect(message).toContain('1 line had a number the user never stated');
    expect(message).toContain(BLANKS_NEED_THE_USER);
    // No next-step clause, because nothing is pending review.
    expect(message).not.toContain(REVIEW_IN_FOLLIO);
  });

  it('is wired into every propose call site, not just available', async () => {
    const source = await import('node:fs').then(({ readFileSync }) =>
      readFileSync('services/agents/resume/edit-tools.ts', 'utf8')
    );
    const calls = source.match(/suggestionMessage\(\{/g) ?? [];
    const overrides = source.match(/blankStep: BLANKS_NEED_THE_USER/g) ?? [];

    expect(calls.length).toBeGreaterThan(0);
    expect(overrides).toHaveLength(calls.length);
    expect(source).not.toContain('RESUBMIT_WITH_FACTS');
  });

  it('leaves the propose tool schema without a userFacts field', async () => {
    const { proposeResumeEditsInputSchema } = await import('@/services/agents/resume/edit-tools');

    expect(Object.keys(proposeResumeEditsInputSchema.shape).sort()).toEqual([
      'changes',
      'request',
      'resumeId',
    ]);
  });
});
