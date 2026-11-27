import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MatchMetrics } from '@/components/jd-align/match-metrics';
import { matchKeywords } from '@/services/ai/evaluate/keywords';
import { parseExpertRead } from '@/services/ai/judge/job-fit';

describe('matchKeywords', () => {
  it('counts job keywords that appear on the resume and keeps document order', () => {
    const keywords = matchKeywords(
      'Python services.\nRan k8s in production.',
      'Python services.\nKubernetes clusters.\nGraphQL gateway.'
    );

    expect(keywords.presentOnResume).toEqual(['Python', 'Kubernetes']);
    expect(keywords.missingFromResume).toEqual(['GraphQL']);
    expect(keywords.jobCoverage).toBe(67);
  });

  it('does not treat JavaScript as Java', () => {
    const keywords = matchKeywords('JavaScript and React.', 'Java backend services.');

    expect(keywords.missingFromResume).toContain('Java');
    expect(keywords.presentOnResume).not.toContain('Java');
    expect(keywords.onlyOnResume).toEqual(expect.arrayContaining(['JavaScript', 'React']));
  });

  it('treats React.js and React as the same keyword', () => {
    const keywords = matchKeywords(
      'Shipped React design systems.',
      'Experience with React.js on the web.'
    );

    expect(keywords.presentOnResume).toContain('React.js');
    expect(keywords.missingFromResume).not.toContain('React.js');
  });

  it('treats k8s as Kubernetes from either side', () => {
    const fromResume = matchKeywords('k8s in production.', 'Kubernetes in production.');
    expect(fromResume.presentInJob.map((term) => term.toLowerCase())).toContain('k8s');

    const fromJob = matchKeywords('Kubernetes in production.', 'k8s in production.');
    expect(fromJob.presentOnResume.map((term) => term.toLowerCase())).toContain('k8s');
    expect(fromJob.missingFromResume).toEqual([]);
  });

  it('counts C++ when both sides name it', () => {
    const keywords = matchKeywords('Daily work in C++.', 'Daily work in C++ and Python.');
    expect(keywords.presentInJob).toContain('C++');
  });

  it('lists resume keywords that the job never asks for', () => {
    const keywords = matchKeywords('Figma libraries and Python.', 'Python services.');

    expect(keywords.presentInJob).toContain('Python');
    expect(keywords.onlyOnResume).toContain('Figma');
    expect(keywords.resumeCoverage).toBe(50);
  });

  it('ignores boilerplate and the word experience', () => {
    const keywords = matchKeywords(
      'I enjoy working with people across the company.',
      'We are an equal opportunity employer and offer a competitive salary. Excellent communication skills. Experience with a team player.'
    );

    expect(keywords.jobCoverage).toBeNull();
    expect(keywords.presentOnResume).toEqual([]);
    expect(keywords.missingFromResume).toEqual([]);
  });

  it('counts a repeated domain word that is not in the skill list', () => {
    const keywords = matchKeywords(
      'Led payments for the checkout team.',
      'Own payments risk. Partner with payments operations.'
    );

    expect(keywords.presentOnResume.map((term) => term.toLowerCase())).toContain('payments');
  });

  it('returns null coverage when a side has no keywords', () => {
    const keywords = matchKeywords('Python services.', '');
    expect(keywords.jobCoverage).toBeNull();
    expect(keywords.resumeCoverage).toBe(0);
  });
});

describe('parseExpertRead', () => {
  const notes = [
    { label: 'What else matters', note: 'The scope is staff-level and the gap is GraphQL.' },
    { label: 'Keywords', note: 'Python and Kubernetes are written plainly. GraphQL is not.' },
    { label: 'Top of the resume', note: 'The first lines already read as a backend engineer.' },
  ];

  it('keeps a usable read and orders the recruiter lenses', () => {
    const expert = parseExpertRead({
      score: 72.4,
      summary: 'A backend fit is visible, with GraphQL missing.',
      notes,
    });

    expect(expert?.score).toBe(72);
    expect(expert?.notes.map((note) => note.label)).toEqual([
      'Top of the resume',
      'Keywords',
      'What else matters',
    ]);
  });

  it('accepts a numeric string and drops a score outside 0 to 100', () => {
    expect(
      parseExpertRead({
        score: '81',
        summary: 'A recruiter would keep reading this resume.',
        notes: [{ label: 'Keywords', note: 'The posting words are on the page.' }],
      })?.score
    ).toBe(81);
    expect(
      parseExpertRead({
        score: 140,
        summary: 'A recruiter would keep reading this resume.',
        notes,
      })
    ).toBeNull();
  });

  it('rejects a summary that does not say anything', () => {
    expect(parseExpertRead({ score: 50, summary: 'Too short', notes })).toBeNull();
    expect(parseExpertRead({ score: 50, summary: '   ', notes })).toBeNull();
  });
});

describe('MatchMetrics', () => {
  it('shows job keyword coverage and an expert read', () => {
    const html = renderToStaticMarkup(
      <MatchMetrics
        keywords={{
          jobCoverage: 67,
          resumeCoverage: 100,
          presentOnResume: ['Python', 'Kubernetes'],
          missingFromResume: ['GraphQL'],
          presentInJob: ['Python'],
          onlyOnResume: [],
        }}
        expert={{
          score: 81,
          summary: 'A recruiter would see a backend fit, with GraphQL missing.',
          notes: [
            {
              label: 'Top of the resume',
              note: 'The first role already reads as backend.',
            },
          ],
        }}
      />
    );

    expect(html).toContain('ATS keywords');
    expect(html).toContain('67');
    expect(html).toContain('2 of 3 job keywords are on the resume.');
    expect(html).toContain('GraphQL');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Expert read');
    expect(html).toContain('Plausible');
    expect(html).toContain('Top of the resume');
  });

  it('says when the recruiter read did not come back', () => {
    const html = renderToStaticMarkup(
      <MatchMetrics
        keywords={{
          jobCoverage: null,
          resumeCoverage: null,
          presentOnResume: [],
          missingFromResume: [],
          presentInJob: [],
          onlyOnResume: [],
        }}
        expert={null}
      />
    );

    expect(html).toContain('No distinct keywords in the job description.');
    expect(html).toContain('The recruiter read did not come back.');
  });
});
