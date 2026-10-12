import { describe, expect, it } from 'vitest';

import { toResumeLinesView } from '@/lib/ai-connector/resume-edits';
import { scoreResume, sessionSources, withDocument } from '@/lib/resume-edit/scores';
import {
  EDIT_PLACEHOLDER,
  type ResumeEditBrief,
  type ResumeEditChange,
} from '@/lib/resume-edit/types';
import {
  changeEffects,
  evaluateJobKeywords,
  evaluateWriting,
  gradeRole,
  keywordsIn,
  lineIssue,
  readJobKeywords,
  readLine,
  resumeText,
} from '@/services/ai/evaluate';
import { buildJobFitUserPrompt, expertBand } from '@/services/ai/judge';
import {
  buildEditFacts,
  planBatches,
  type EditSourceProfile,
} from '@/services/ai/resume-edit/facts';
import { planWriting } from '@/services/ai/resume-edit/plan';
import { selectPlaybooks, WRITING_PLAYBOOKS } from '@/services/ai/resume-edit/playbooks';
import {
  buildResumeEditUserPrompt,
  RESUME_EDIT_SYSTEM_PROMPT,
} from '@/services/ai/resume-edit/prompt';

const profile: EditSourceProfile = {
  headline: 'Backend Engineer',
  summary: 'Engineer building payment systems in Python.',
  workExperiences: [
    {
      id: 'exp-acme',
      company: 'Acme',
      role: 'Backend Engineer',
      startDate: new Date('2020-01-01'),
      endDate: null,
      isCurrent: true,
      bullets: [
        'Responsible for the payments API in Python',
        'Cut deploy time by 40% with CI caching',
        'Built internal tooling for the support team',
        'Built dashboards that successfully helped various teams in order to track releases and incidents across all of the services we owned',
      ],
      bulletsHtml: null,
      isVisible: true,
    },
    {
      id: 'exp-beta',
      company: 'Beta',
      role: 'Developer',
      startDate: new Date('2017-01-01'),
      endDate: new Date('2019-12-01'),
      isCurrent: false,
      bullets: ['Led a team of five on PostgreSQL migrations', 'Worked on React dashboards'],
      bulletsHtml: null,
      isVisible: true,
    },
  ],
  skills: [{ name: 'PostgreSQL' }, { name: 'Docker' }],
  educations: [],
  certifications: [],
  projects: [],
};

const facts = buildEditFacts(profile);

const job =
  'Senior Backend Engineer. 5+ years of Python. Kubernetes in production. ' +
  'Experience with payments, PostgreSQL, and GraphQL APIs. Observability with Datadog.';

function brief(overrides: Partial<ResumeEditBrief> = {}): ResumeEditBrief {
  return {
    jobDescription: null,
    instructions: null,
    presets: [],
    scope: { kind: 'all' },
    ...overrides,
  };
}

describe('readLine', () => {
  it('finds a weak opener and does not mistake "Improved" for "I"', () => {
    expect(readLine('Responsible for the payments API').weakOpener).toBe('Responsible for');
    expect(readLine('Worked on React dashboards').actionOpener).toBe(false);
    expect(readLine('Improved search relevance').weakOpener).toBeNull();
    expect(readLine('Partnered with design').weakOpener).toBeNull();
    expect(readLine('I built the API').weakOpener).toBe('I');
  });

  it('treats regular, irregular, present, and co- verbs as action openers', () => {
    expect(readLine('Migrated billing to Stripe').actionOpener).toBe(true);
    expect(readLine('Led the platform team').actionOpener).toBe(true);
    expect(readLine('Lead the platform team').actionOpener).toBe(true);
    expect(readLine('Co-led the launch').actionOpener).toBe(true);
    expect(readLine('Payments API in Python').actionOpener).toBe(false);
  });

  it('counts digits and number words, but not a blank', () => {
    expect(readLine('Mentored two interns').hasNumber).toBe(true);
    expect(readLine('Cut costs by 30%').hasNumber).toBe(true);
    const blank = readLine(`Cut costs by ${EDIT_PLACEHOLDER}%`);
    expect(blank.hasNumber).toBe(false);
    expect(blank.hasBlank).toBe(true);
  });

  it('tells a stated result from a task, and a result-first line from the rest', () => {
    expect(readLine('Rebuilt the cache, reducing latency').showsResult).toBe(true);
    expect(readLine('Launched a referral program resulting in new signups').showsResult).toBe(true);
    expect(readLine('Saved $2M in cloud spend').showsResult).toBe(true);
    expect(readLine('Built internal tooling').showsResult).toBe(false);
    expect(readLine('Cut setup time by rebuilding onboarding').leadsWithResult).toBe(true);
    expect(readLine('Rebuilt onboarding, which cut setup time').leadsWithResult).toBe(false);
  });

  it('flags filler and long lines', () => {
    const line = readLine(profile.workExperiences[0]?.bullets[3] ?? '');
    expect(line.filler).toEqual(['successfully', 'various', 'in order to']);
    expect(readLine('Built tooling').tooLong).toBe(false);
    expect(readLine(Array.from({ length: 31 }, () => 'word').join(' ')).tooLong).toBe(true);
  });
});

describe('gradeRole and lineIssue', () => {
  it('flags an opener the role already used', () => {
    const graded = gradeRole(['Built the API', 'Built dashboards', 'Shipped billing']);
    expect(graded.map((line) => line.repeatsOpener)).toEqual([false, true, false]);
    expect(lineIssue('verbs', graded[1]!)).toBe('repeats “built” in this role');
  });

  it('names what each check needs', () => {
    const [weak] = gradeRole(['Responsible for the payments API']);
    expect(lineIssue('verbs', weak!)).toBe('opens with “Responsible for”');
    expect(lineIssue('quantify', weak!)).toBe('no number');
    expect(lineIssue('outcomes', weak!)).toBe('no result stated');
    expect(lineIssue('concise', weak!)).toBe('filler “Responsible for”');
    expect(lineIssue('concise', gradeRole(['Built the payments API'])[0]!)).toBeNull();
  });
});

describe('evaluateWriting', () => {
  const result = evaluateWriting(facts);
  const byId = Object.fromEntries(result.checks.map((check) => [check.id, check]));

  it('scores every bullet against the four checks, in quick-fix order', () => {
    expect(result.bulletCount).toBe(6);
    expect(result.checks.map((check) => check.id)).toEqual([
      'quantify',
      'concise',
      'verbs',
      'outcomes',
    ]);
  });

  it('scales each score to the share a strong resume reaches', () => {
    // 2 of 6 have a number; the target is 60%, so 2 / (6 * 0.6) = 56.
    expect(byId.quantify).toMatchObject({ passed: 2, total: 6, score: 56 });
    expect(byId.quantify?.summary).toBe('2 of 6 bullets have a number.');
    // Weak opener, a repeated "Built", and "Worked on" fail.
    expect(byId.verbs).toMatchObject({ passed: 3, score: 50 });
    expect(byId.verbs?.summary).toBe('3 bullets open weakly or repeat a verb.');
    // "Responsible for" and the filler-heavy dashboards line.
    expect(byId.concise?.passed).toBe(4);
    expect(byId.outcomes).toMatchObject({ passed: 1, score: 33 });
  });

  it('lists the first failing lines with their ref and role', () => {
    expect(byId.verbs?.issues[0]).toEqual({
      ref: 'E1.1',
      where: 'Backend Engineer · Acme',
      text: 'Responsible for the payments API in Python',
      issue: 'Opens with “Responsible for”',
    });
  });

  it('averages the checks into one writing score', () => {
    const scores = result.checks.map((check) => check.score ?? 0);
    expect(result.writing).toBe(
      Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
    );
  });

  it('has no score for a resume without bullets', () => {
    const empty = evaluateWriting(buildEditFacts({ ...profile, workExperiences: [] }));
    expect(empty.writing).toBeNull();
    expect(empty.checks.every((check) => check.score === null)).toBe(true);
  });
});

describe('evaluateJobKeywords', () => {
  it('needs a real posting', () => {
    expect(evaluateJobKeywords(facts, null)).toBeNull();
    expect(evaluateJobKeywords(facts, 'Python role')).toBeNull();
  });

  it('splits the posting into keywords the resume shows and gaps', () => {
    const check = evaluateJobKeywords(facts, job);
    expect(check?.onResume).toEqual(expect.arrayContaining(['Python', 'PostgreSQL']));
    expect(check?.missing).toEqual(expect.arrayContaining(['Kubernetes', 'GraphQL']));
    expect(check?.summary).toMatch(/^\d+ of \d+ job keywords are on your resume\.$/);
  });
});

describe('resumeText', () => {
  it('reads top to bottom: headline, summary, roles, skills', () => {
    const text = resumeText(facts);
    expect(text.startsWith('Backend Engineer\nEngineer building payment systems in Python.')).toBe(
      true
    );
    expect(text).toContain('- Cut deploy time by 40% with CI caching');
    expect(text).toContain('Skills: PostgreSQL, Docker');
  });
});

describe('changeEffects', () => {
  const keywords = readJobKeywords(job);

  it('names what a rewrite improves', () => {
    const labels = changeEffects({
      op: 'rewrite',
      isBullet: true,
      before: 'Responsible for the payments API in Python',
      after: 'Built the payments API in Python, cutting checkout errors 30%',
      jobKeywords: keywords,
    }).map((effect) => effect.label);
    expect(labels).toEqual(['Adds a number', 'Stronger verb', 'Says what changed', 'Less filler']);
  });

  it('warns when a rewrite drops a number or runs long', () => {
    const effects = changeEffects({
      op: 'rewrite',
      isBullet: true,
      before: 'Cut deploy time by 40% with CI caching',
      after: Array.from({ length: 32 }, () => 'cut').join(' '),
    });
    expect(
      effects.filter((effect) => effect.tone === 'loss').map((effect) => effect.label)
    ).toEqual(['Drops a number', 'Runs long']);
  });

  it('counts words saved and job keywords brought in', () => {
    const labels = changeEffects({
      op: 'rewrite',
      isBullet: true,
      before: 'Was responsible for successfully working on various payments services every day',
      after: 'Owned payments services on PostgreSQL',
      jobKeywords: keywords,
    }).map((effect) => effect.label);
    expect(labels).toContain('6 fewer words');
    expect(labels).toContain('Uses “PostgreSQL”');
  });

  it('says nothing about a removal', () => {
    expect(
      changeEffects({ op: 'delete', isBullet: true, before: 'Wrote tests', after: '' })
    ).toEqual([]);
  });

  it('matches keywords by their written equivalents', () => {
    expect(keywordsIn('Ran Postgres and k8s', readJobKeywords(job))).toEqual(
      expect.arrayContaining(['PostgreSQL', 'Kubernetes'])
    );
  });
});

describe('writing playbooks', () => {
  it('runs in a resume writer’s order: tailor, outcomes, numbers, verbs, tighten', () => {
    expect(WRITING_PLAYBOOKS.map((playbook) => playbook.id)).toEqual([
      'tailor',
      'outcomes',
      'quantify',
      'verbs',
      'concise',
    ]);
  });

  it('selects only what the request asked for, tailoring only with a posting', () => {
    expect(
      selectPlaybooks(brief({ presets: ['concise', 'quantify'] })).map((playbook) => playbook.id)
    ).toEqual(['quantify', 'concise']);
    expect(
      selectPlaybooks(brief({ jobDescription: job, presets: ['verbs'] })).map(
        (playbook) => playbook.id
      )
    ).toEqual(['tailor', 'verbs']);
    expect(selectPlaybooks(brief({ instructions: 'Sound more senior' }))).toEqual([]);
  });
});

describe('planWriting', () => {
  it('works out the job keywords once for every batch', () => {
    const plan = planWriting(facts, brief({ jobDescription: job }));
    expect(plan.job?.onResume).toContain('Python');
    expect(plan.job?.missing).toContain('Kubernetes');
    expect(planWriting(facts, brief({ presets: ['verbs'] })).job).toBeNull();
  });
});

describe('resume edit prompt', () => {
  const [, acme] = planBatches(facts, { kind: 'all' });

  it('works as a resume writer: grade, apply playbooks in order, then check', () => {
    expect(RESUME_EDIT_SYSTEM_PROMPT).toContain('professional resume writer');
    expect(RESUME_EDIT_SYSTEM_PROMPT).toContain('Apply the PLAYBOOKS in the order given');
    expect(RESUME_EDIT_SYSTEM_PROMPT).toContain('never raise seniority or ownership');
  });

  it('sends the selected playbooks in order and grades each editable line', () => {
    const prompt = buildResumeEditUserPrompt(
      facts,
      acme!,
      brief({ presets: ['concise', 'verbs', 'quantify'] })
    );
    const order = ['2. Stronger verbs', '1. Add numbers', '3. Tighten'].map((name) =>
      prompt.indexOf(name)
    );
    expect(order.every((index) => index > 0)).toBe(true);
    expect(order[1]).toBeLessThan(order[0]!);
    expect(order[0]).toBeLessThan(order[2]!);
    expect(prompt).toContain(
      '  [E1.1] Responsible for the payments API in Python\n      notes: no number; filler “Responsible for”; opens with “Responsible for”'
    );
    expect(prompt).toContain('  [E1.2] Cut deploy time by 40% with CI caching\n  [E1.3]');
    expect(prompt).toContain('repeats “built” in this role');
    expect(prompt).toContain('OPENERS IN USE (other roles): Led');
  });

  it('adds the job plan when tailoring', () => {
    const prompt = buildResumeEditUserPrompt(facts, acme!, brief({ jobDescription: job }));
    expect(prompt).toContain('1. Tailor to the job');
    expect(prompt).toMatch(/On the resume already\.[^\n]*Python/);
    expect(prompt).toMatch(/Not on the resume\. Gaps; never add these: [^\n]*Kubernetes/);
    expect(prompt).not.toContain('notes:');
  });

  it('leaves out playbooks when the user only gave instructions', () => {
    const prompt = buildResumeEditUserPrompt(
      facts,
      acme!,
      brief({ instructions: 'Mention I cut cloud costs by 30%' })
    );
    expect(prompt).not.toContain('PLAYBOOKS');
    expect(prompt).not.toContain('JOB PLAN');
  });
});

describe('panel scores', () => {
  const rewrite: ResumeEditChange = {
    id: 'E1.1',
    op: 'rewrite',
    target: { kind: 'bullet', experienceId: 'exp-acme', index: 0 },
    label: 'Backend Engineer · Acme',
    before: 'Responsible for the payments API in Python',
    after: 'Built the payments API in Python',
    reason: 'Stronger verb',
    status: 'proposed',
  };

  it('projects ready suggestions with the same plan apply uses', () => {
    const { before, after } = sessionSources(
      profile,
      [rewrite],
      new Map([['E1.1', rewrite.after]])
    );
    expect(before).toBe(profile);
    expect(after.workExperiences[0]?.bullets[0]).toBe('Built the payments API in Python');
    const was = scoreResume(before, null).evaluation;
    const next = scoreResume(after, null).evaluation;
    expect(next.writing!).toBeGreaterThan(was.writing!);
  });

  it('rebuilds the resume before this request by undoing what was kept', () => {
    const kept = withDocument(profile, {
      headline: profile.headline,
      summary: profile.summary,
      experiences: profile.workExperiences.map((item) => ({
        id: item.id,
        bullets:
          item.id === 'exp-acme'
            ? ['Built the payments API in Python', ...item.bullets.slice(1)]
            : item.bullets,
        bulletsHtml: null,
      })),
    });
    const applied: ResumeEditChange = {
      ...rewrite,
      status: 'applied',
      applied: {
        previousRaw: rewrite.before,
        text: rewrite.after,
        at: '2026-10-11T00:00:00.000Z',
      },
    };
    const { before } = sessionSources(kept, [applied], new Map());
    expect(before.workExperiences[0]?.bullets[0]).toBe(rewrite.before);
  });
});

describe('connected assistants', () => {
  it('get the same playbooks and the writing checks with get_resume_lines', () => {
    const view = toResumeLinesView(facts);
    expect(view.writingGuide.playbooks.map((playbook) => playbook.name)).toEqual(
      WRITING_PLAYBOOKS.map((playbook) => playbook.name)
    );
    expect(view.scores.checks.map((check) => check.check)).toEqual([
      'Numbers',
      'Concise',
      'Action verbs',
      'Outcomes',
    ]);
    expect(view.scores.checks[2]?.lines[0]).toEqual({
      ref: 'E1.1',
      issue: 'Opens with “Responsible for”',
    });
  });
});

describe('judge', () => {
  it('reads both texts with clear boundaries', () => {
    expect(buildJobFitUserPrompt(' Resume ', ' Job ')).toBe(
      'RESUME\n"""\nResume\n"""\n\nJOB DESCRIPTION\n"""\nJob\n"""'
    );
  });

  it('bands a score the same way on every screen', () => {
    expect([90, 70, 45, 10].map(expertBand)).toEqual(['Strong', 'Plausible', 'Partial', 'Weak']);
  });
});
