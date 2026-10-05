import { describe, expect, it } from 'vitest';

import { resumeParseAgent } from '@/services/agents/resume-parse';
import {
  applyFollioVoiceToNormalized,
  buildFollioVoiceUserPrompt,
  sanitizeFollioVoiceDraft,
} from '@/services/agents/resume-parse';
import type { NormalizedResumeData } from '@/services/import/resume-ai.service';

function normalized(overrides: Partial<NormalizedResumeData> = {}): NormalizedResumeData {
  return {
    profile: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      headline: 'Mathematician | Writer | Seeking roles',
      summary: 'Results-driven professional seeking a challenging role. Wrote the first algorithm.',
    },
    experiences: [
      {
        company: 'Analytical Engine',
        role: 'Chief visionary',
        isCurrent: true,
        bullets: ['Shipped the compiler', 'Responsible for various duties'],
      },
    ],
    educations: [],
    projects: [],
    skills: ['Mathematics', 'Poetry'],
    links: [],
    certifications: [],
    meta: {
      confidence: 0.9,
      parseMethod: 'ai',
      model: 'test',
      importedAt: new Date('2020-01-01'),
      processingTimeMs: 1,
    },
    ...overrides,
  };
}

describe('resume-parse Follio rewrite', () => {
  it('runs rewrite-for-follio after normalize', () => {
    expect(resumeParseAgent.steps.map((step) => step.id)).toEqual([
      'parse-resume-ai',
      'normalize-resume',
      'rewrite-for-follio',
      'optional-save',
    ]);
  });

  it('grounds the prompt in extracted résumé facts', () => {
    const prompt = buildFollioVoiceUserPrompt(normalized());
    expect(prompt).toContain('Ada Lovelace');
    expect(prompt).toContain('Analytical Engine');
    expect(prompt).toContain('Shipped the compiler');
    expect(prompt).toContain('Mathematics');
    expect(prompt).toContain('Summary status: present');
    expect(prompt).toContain('preserve verbatim');
  });

  it('does not generate a replacement about when the résumé has a summary', () => {
    const draft = sanitizeFollioVoiceDraft(
      {
        headline: 'Engineer | React | Node | AWS | Kubernetes | Docker',
        about: null,
      },
      normalized()
    );

    expect(draft.headline).toBe('Engineer');
    expect(draft.about).toBeNull();
  });

  it('keeps an extracted summary verbatim', () => {
    const next = applyFollioVoiceToNormalized(normalized(), {
      headline: 'Mathematician and writer',
      about: 'A rewritten summary that must not be used.',
    });

    expect(next.profile.headline).toBe('Mathematician and writer');
    expect(next.profile.summary).toBe(
      'Results-driven professional seeking a challenging role. Wrote the first algorithm.'
    );
    expect(next.experiences[0]?.bullets).toEqual([
      'Shipped the compiler',
      'Responsible for various duties',
    ]);
  });

  it('uses generated about copy only when extraction found no summary', () => {
    const source = normalized({
      profile: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        headline: 'Mathematician',
      },
    });
    const next = applyFollioVoiceToNormalized(source, {
      headline: 'Mathematician',
      about: 'Mathematician who published the first algorithm.',
    });

    expect(buildFollioVoiceUserPrompt(source)).toContain('Summary status: missing');
    expect(next.profile.summary).toBe('Mathematician who published the first algorithm.');
  });
});
