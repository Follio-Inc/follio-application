import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  EffectList,
  JobGaps,
  JobMatch,
  RequirementList,
  ResumeSkillList,
  SessionScoreBoard,
} from '@/app/(dashboard)/builder/components/ai-edit/ai-edit-scores';
import type { SessionScores } from '@/app/(dashboard)/builder/components/ai-edit/use-edit-scores';
import type { JobFit } from '@/app/(dashboard)/builder/components/ai-edit/use-job-fit';
import type {
  JobRequirementsRead,
  JobRequirementsState,
} from '@/app/(dashboard)/builder/components/ai-edit/use-job-requirements';
import { scoreResume } from '@/lib/resume-edit/scores';
import type { JobRequirement } from '@/services/ai/job-requirements/types';
import type { EditSourceProfile } from '@/services/ai/resume-edit/facts';

const job =
  'Backend Engineer. Python and PostgreSQL in production. Kubernetes and GraphQL experience required.';

function source(bullets: string[]): EditSourceProfile {
  return {
    headline: 'Backend Engineer',
    summary: 'Engineer building payment systems.',
    workExperiences: [
      {
        id: 'exp-acme',
        company: 'Acme',
        role: 'Backend Engineer',
        startDate: new Date('2020-01-01'),
        endDate: null,
        isCurrent: true,
        bullets,
        bulletsHtml: null,
        isVisible: true,
      },
    ],
    skills: [{ name: 'Python' }],
    educations: [],
    certifications: [],
    projects: [],
  };
}

const before = scoreResume(
  source(['Responsible for the payments API', 'Worked on dashboards']),
  job
);
const after = scoreResume(
  source(['Built the payments API on PostgreSQL', 'Cut dashboard load time 40%']),
  job
);

function scores(readyCount: number): SessionScores {
  return { before, now: before, after, readyCount, skillRead: 'ready' };
}

function jobFit(state: JobFit['state'], stale = false): JobFit {
  return { state, previous: null, stale, check: vi.fn() };
}

describe('SessionScoreBoard', () => {
  it('compares the resume before the request with the ready suggestions kept', () => {
    const html = renderToStaticMarkup(<SessionScoreBoard scores={scores(2)} jobFit={null} />);
    expect(html).toContain('Before this request, and with 2 ready suggestions kept');
    expect(html).toContain('Writing');
    expect(html).toContain('Keyword match');
    expect(html).toContain('Action verbs');
    expect(html).toContain(`was ${before.evaluation.writing}`);
    expect(html).toContain('Not on your resume');
    expect(html).toContain('Kubernetes');
  });

  it('shows the recruiter read and offers a re-check once the resume changed', () => {
    const html = renderToStaticMarkup(
      <SessionScoreBoard
        scores={scores(0)}
        jobFit={jobFit(
          {
            status: 'ready',
            read: {
              score: 72,
              summary: 'A backend fit is visible, with Kubernetes missing.',
              notes: [{ label: 'Keywords', note: 'Python is on the page. GraphQL is not.' }],
            },
            text: 'older resume',
          },
          true
        )}
      />
    );
    expect(html).toContain('Before this request, and now');
    expect(html).toContain('Recruiter read');
    expect(html).toContain('72');
    expect(html).toContain('Plausible');
    expect(html).toContain('Re-check');
    expect(html).toContain('Python is on the page.');
  });

  it('says when the recruiter read is on its way or failed', () => {
    expect(
      renderToStaticMarkup(
        <SessionScoreBoard scores={scores(0)} jobFit={jobFit({ status: 'loading' })} />
      )
    ).toContain('Reading as a recruiter');
    const failed = renderToStaticMarkup(
      <SessionScoreBoard
        scores={scores(0)}
        jobFit={jobFit({ status: 'error', message: 'The recruiter read did not come back.' })}
      />
    );
    expect(failed).toContain('The recruiter read did not come back.');
    expect(failed).toContain('Try again');
  });
});

describe('skills match', () => {
  const requirements: JobRequirement[] = [
    { term: 'Python', kind: 'tool', importance: 'required', aliases: [] },
    { term: 'PostgreSQL', kind: 'tool', importance: 'required', aliases: [] },
    { term: 'Kubernetes', kind: 'tool', importance: 'required', aliases: ['k8s'] },
    { term: 'GraphQL', kind: 'tool', importance: 'preferred', aliases: [] },
  ];
  const ready = (state: JobRequirementsState): JobRequirementsRead => ({ state, retry: vi.fn() });
  const draft = source(['Responsible for the payments API', 'Worked on dashboards']);

  it('shows the skills match next to the raw keyword match, with each requirement marked', () => {
    const scored = scoreResume(draft, job, requirements);
    const html = renderToStaticMarkup(
      <SessionScoreBoard
        scores={{
          before: scored,
          now: scored,
          after: scoreResume(
            source(['Built the payments API on PostgreSQL', 'Cut dashboard load time 40%']),
            job,
            requirements
          ),
          readyCount: 2,
          skillRead: 'ready',
        }}
        jobFit={null}
        requirements={ready({ status: 'ready', requirements })}
      />
    );
    expect(html).toContain('Skills match');
    // Python only listed before: 1.5 of 7. After, PostgreSQL is shown too: 3.5 of 7.
    expect(html).toContain('50%');
    expect(html).toContain('was 21%');
    expect(html).toContain('Keyword match');
    expect(html).toContain('Nice to have');
    expect(html).toContain('Kubernetes<span class="sr-only">, not on your resume</span>');
    expect(html).toContain('GraphQL<span class="sr-only">, not on your resume</span>');
    expect(html).toContain('Python<span class="sr-only">, only in your skills list</span>');
    expect(html).toContain('Your resume’s skills');
  });

  it('says when the requirements are on their way, and offers a retry when they fail', () => {
    const scored = scoreResume(draft, job);
    const loading = renderToStaticMarkup(
      <JobMatch evaluation={scored.evaluation} requirements={ready({ status: 'loading' })} />
    );
    expect(loading).toContain('Reading the requirements…');
    expect(loading).toContain('Keyword match');
    expect(loading).toContain('Every term in the pasted text');
    expect(loading).not.toContain('Not on your resume');

    const failed = renderToStaticMarkup(
      <JobMatch
        evaluation={scored.evaluation}
        requirements={ready({ status: 'error', message: 'Could not read this posting.' })}
      />
    );
    expect(failed).toContain('Could not read this posting.');
    expect(failed).toContain('Try again');
    expect(failed).toContain('Job keywords missing from your resume');
  });

  it('lists the resume’s own skills and highlights the ones the posting asks for', () => {
    const scored = scoreResume(draft, job, requirements);
    const html = renderToStaticMarkup(
      <ResumeSkillList skills={scored.evaluation.resumeSkills} check={scored.evaluation.skills} />
    );
    expect(html).toContain('Read from your resume and updated as you edit.');
    expect(html).toContain('Python<span class="sr-only">, in this posting</span>');
  });

  it('marks missing, listed, and shown requirements in the list', () => {
    const html = renderToStaticMarkup(
      <RequirementList
        check={{
          score: 50,
          required: { met: 1, total: 2 },
          preferred: { met: 0, total: 0 },
          related: 1,
          listedOnly: 0,
          matches: [
            {
              term: 'Python',
              kind: 'tool',
              importance: 'required',
              match: 'exact',
              evidence: 'shown',
              where: ['experience'],
              via: null,
              skills: ['python'],
            },
            {
              term: 'Vue.js',
              kind: 'tool',
              importance: 'required',
              match: 'related',
              evidence: 'shown',
              where: ['experience'],
              via: 'React',
              skills: ['react'],
            },
            {
              term: 'Go',
              kind: 'tool',
              importance: 'required',
              match: 'missing',
              evidence: 'missing',
              where: [],
              via: null,
              skills: [],
            },
          ],
          summary: 'Required: 1 of 3 on your resume. 1 close match counts for half.',
        }}
      />
    );
    expect(html).toContain('title="In your experience"');
    expect(html).toContain('via React');
    expect(html).toContain('title="Close match: your React"');
    expect(html).toContain('Close match');
    expect(html).not.toContain('Only listed');
    expect(html).toContain('Suggestions never add missing skills');
    expect(html).not.toContain('Nice to have</p>');
  });
});

describe('JobGaps and EffectList', () => {
  it('celebrates full coverage and lists gaps otherwise', () => {
    expect(
      renderToStaticMarkup(
        <JobGaps job={{ coverage: 100, onResume: ['Python'], missing: [], summary: '' }} />
      )
    ).toContain('Every keyword in this posting is already on your resume.');
    expect(
      renderToStaticMarkup(
        <JobGaps
          job={{
            coverage: 50,
            onResume: ['Python'],
            missing: ['Kubernetes'],
            summary: '1 of 2 job keywords are on your resume.',
          }}
        />
      )
    ).toContain('Suggestions never add these.');
  });

  it('marks a loss for screen readers', () => {
    const html = renderToStaticMarkup(
      <EffectList
        effects={[
          { tone: 'gain', label: 'Stronger verb' },
          { tone: 'loss', label: 'Runs long' },
        ]}
      />
    );
    expect(html).toContain('Stronger verb');
    expect(html).toContain('Watch out: </span>Runs long');
  });
});
