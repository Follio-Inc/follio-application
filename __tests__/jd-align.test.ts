import { describe, expect, it } from 'vitest';

import { buildThreadPath } from '@/components/jd-align/thread-path';
import { groundAlignment } from '@/services/ai/jd-align/ground';
import { explainAlignInput, JD_ALIGN_LIMITS } from '@/services/ai/jd-align/limits';
import { locateQuote } from '@/services/ai/jd-align/locate';
import { buildJdAlignUserPrompt, JD_ALIGN_SYSTEM_PROMPT } from '@/services/ai/jd-align/prompt';
import { alignmentFits } from '@/services/ai/jd-align/types';

const resume = [
  'Ada Lovelace',
  '8 years of Python building data platforms.',
  'Ran Kubernetes in production for the payments cluster.',
  'Shipped React design systems used by the support org.',
  'B.S. Computer Science, University of London.',
].join('\n');

const job = [
  'Backend Engineer',
  'We are an equal opportunity employer and offer a competitive salary.',
  'Requirements:',
  '5+ years of Python for data platforms.',
  'Experience with Kubernetes in production.',
  'Experience with React.js on the web.',
  'GraphQL APIs for partner integrations.',
  'Java backend services for internal tools.',
  'Excellent communication skills and a team player.',
  "Bachelor's degree in Computer Science.",
].join('\n');

describe('locateQuote', () => {
  it('finds a phrase with different case and spacing', () => {
    const found = locateQuote('5+  years of   Python', '5+ years of Python');
    expect(found?.quote).toBe('5+  years of   Python');
  });

  it('does not match a short word inside a longer one', () => {
    expect(locateQuote('Built Google payments', 'Go')).toBeNull();
    expect(locateQuote('Services in Go and Python', 'Go')?.quote).toBe('Go');
  });

  it('keeps symbols that are part of the name', () => {
    expect(locateQuote('Daily work in C++ and Python', 'C++')?.quote).toBe('C++');
  });
});

describe('groundAlignment', () => {
  const model = {
    roleHint: 'Backend Engineer',
    aspects: [
      {
        label: 'Equal opportunity',
        jdQuote: 'equal opportunity employer',
        status: 'missing',
        note: 'Legal boilerplate.',
        resumeQuotes: [],
      },
      {
        label: 'Communication',
        jdQuote: 'Excellent communication skills',
        status: 'missing',
        note: 'Soft skill.',
        resumeQuotes: [],
      },
      {
        label: 'Python',
        jdQuote: '5+ years of Python for data platforms.',
        status: 'matched',
        note: 'The resume states eight years of Python on data platforms.',
        resumeQuotes: ['8 years of Python building data platforms.'],
      },
      {
        label: 'Kubernetes',
        jdQuote: 'Kubernetes in production',
        status: 'matched',
        note: 'Production Kubernetes is on the resume.',
        resumeQuotes: ['Ran Kubernetes in production for the payments cluster.'],
      },
      {
        label: 'React',
        jdQuote: 'Experience with React.js on the web.',
        status: 'matched',
        note: 'The resume ships React.',
        resumeQuotes: ['Shipped React design systems used by the support org.'],
      },
      {
        label: 'GraphQL',
        jdQuote: 'GraphQL APIs for partner integrations.',
        status: 'matched',
        note: 'Claimed without support.',
        resumeQuotes: ['8 years of Python building data platforms.'],
      },
      {
        label: 'Java',
        jdQuote: 'Java backend services for internal tools.',
        status: 'matched',
        note: 'JavaScript is not Java.',
        resumeQuotes: ['Shipped React design systems used by the support org.'],
      },
      {
        label: 'Computer Science',
        jdQuote: "Bachelor's degree in Computer Science.",
        status: 'matched',
        note: 'The degree is on the resume.',
        resumeQuotes: ['B.S. Computer Science, University of London.'],
      },
      {
        label: 'Rust',
        jdQuote: 'Rust systems programming',
        status: 'missing',
        note: 'Not in the posting.',
        resumeQuotes: [],
      },
    ],
  };

  const grounded = groundAlignment(model, resume, job);

  it('marks supported requirements in document order and drops the rest', () => {
    expect(grounded.roleHint).toBe('Backend Engineer');
    expect(grounded.aspects.map((aspect) => aspect.label)).toEqual([
      'Python',
      'Kubernetes',
      'React',
      'GraphQL',
      'Java',
      'Computer Science',
    ]);
    expect(grounded.matchedCount).toBe(4);
    expect(grounded.missingCount).toBe(2);
  });

  it('uses the document’s own words for every highlight', () => {
    for (const aspect of grounded.aspects) {
      expect(job.slice(aspect.start, aspect.end)).toBe(aspect.quote);
      for (const evidence of aspect.evidence) {
        expect(resume.slice(evidence.start, evidence.end)).toBe(evidence.quote);
      }
    }
    expect(alignmentFits(grounded, resume, job)).toBe(true);
  });

  it('turns a matched claim with no real support into a missing mark', () => {
    const graphql = grounded.aspects.find((aspect) => aspect.label === 'GraphQL');
    const java = grounded.aspects.find((aspect) => aspect.label === 'Java');
    expect(graphql?.status).toBe('missing');
    expect(graphql?.evidence).toEqual([]);
    expect(graphql?.note).toBe('Not written on your resume.');
    expect(java?.status).toBe('missing');
  });

  it('keeps the longer of two overlapping marks', () => {
    const overlapped = groundAlignment(
      {
        aspects: [
          {
            label: 'Kubernetes',
            jdQuote: 'Kubernetes',
            status: 'matched',
            resumeQuotes: ['Ran Kubernetes in production for the payments cluster.'],
          },
          {
            label: 'Kubernetes',
            jdQuote: 'Kubernetes in production',
            status: 'matched',
            resumeQuotes: ['Ran Kubernetes in production for the payments cluster.'],
          },
        ],
      },
      resume,
      job
    );
    expect(overlapped.aspects).toHaveLength(1);
    expect(overlapped.aspects[0]?.quote).toBe('Kubernetes in production');
  });

  it('caps a long posting without dropping every missing requirement', () => {
    const lines = Array.from({ length: 14 }, (_, index) => {
      const name = `Toolaa${String(index + 1).padStart(2, '0')}`;
      return `Experience with ${name} in production.`;
    });
    const longJob = lines.join('\n');
    const longResume = lines
      .slice(0, 10)
      .map((line) => line.replace('Experience with', 'Shipped'))
      .join('\n');
    const aspects = lines.map((line, index) => ({
      label: `Toolaa${String(index + 1).padStart(2, '0')}`,
      jdQuote: line,
      status: index < 10 ? 'matched' : 'missing',
      resumeQuotes: index < 10 ? [line.replace('Experience with', 'Shipped')] : [],
    }));
    const capped = groundAlignment({ aspects }, longResume, longJob);
    expect(capped.aspects.length).toBe(JD_ALIGN_LIMITS.maxAspects);
    expect(capped.aspects.some((aspect) => aspect.status === 'missing')).toBe(true);
    expect(capped.aspects.some((aspect) => aspect.status === 'matched')).toBe(true);
    const starts = capped.aspects.map((aspect) => aspect.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe('explainAlignInput', () => {
  it('asks for both sides before a match can run', () => {
    expect(explainAlignInput('', '')).toMatch(/resume and a job description/i);
    expect(explainAlignInput('x'.repeat(50), '')).toMatch(/job description/i);
    expect(explainAlignInput('x'.repeat(50), 'y'.repeat(50))).toBeNull();
  });
});

describe('jd align prompt', () => {
  it('tells the model that quotes are copied verbatim', () => {
    expect(JD_ALIGN_SYSTEM_PROMPT).toMatch(/verbatim/);
    const prompt = buildJdAlignUserPrompt('Resume body', 'Job body');
    expect(prompt).toContain('Resume body');
    expect(prompt).toContain('Job body');
  });
});

describe('buildThreadPath', () => {
  it('bows across a side-by-side gap', () => {
    const path = buildThreadPath({ x: 20, y: 40 }, { x: 180, y: 90 });
    expect(path.startsWith('M 20 40 C')).toBe(true);
    expect(path.endsWith('180 90')).toBe(true);
  });

  it('bows through a stacked gap', () => {
    const path = buildThreadPath({ x: 80, y: 20 }, { x: 90, y: 200 });
    expect(path).toContain('C 80');
    expect(path.endsWith('90 200')).toBe(true);
  });
});
