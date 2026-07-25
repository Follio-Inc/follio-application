import {
  buildOnboardingResumePreviewProfile,
  hasSufficientResumePreviewData,
  isUsingSampleResumePreview,
  resolveResumeTemplatePreviewProfile,
  RESUME_TEMPLATE_SAMPLE_PROFILE,
} from '@/lib/resume/templates';
import type { PublicProfile } from '@/types';
import { describe, expect, it } from 'vitest';

function sparseProfile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    ...RESUME_TEMPLATE_SAMPLE_PROFILE,
    workExperiences: [],
    educations: [],
    skills: [],
    skillGroups: [],
    ...overrides,
  } as PublicProfile;
}

describe('hasSufficientResumePreviewData', () => {
  it('requires experience, education, and at least one skill', () => {
    expect(
      hasSufficientResumePreviewData({
        workExperiences: [{ id: 'w1' }],
        educations: [{ id: 'e1' }],
        skills: [{ id: 's1' }],
      })
    ).toBe(true);

    expect(
      hasSufficientResumePreviewData({
        workExperiences: [{ id: 'w1' }],
        educations: [{ id: 'e1' }],
        skills: [],
        skillGroups: [],
      })
    ).toBe(false);

    expect(
      hasSufficientResumePreviewData({
        workExperiences: [],
        educations: [{ id: 'e1' }],
        skills: [{ id: 's1' }],
      })
    ).toBe(false);

    expect(
      hasSufficientResumePreviewData({
        workExperiences: [{ id: 'w1' }],
        educations: [],
        skills: [{ id: 's1' }],
      })
    ).toBe(false);
  });

  it('accepts onboarding skillGroups.skillsText and experiences alias', () => {
    expect(
      hasSufficientResumePreviewData({
        experiences: [{ id: 'w1' }],
        educations: [{ id: 'e1' }],
        skillGroups: [{ skillsText: 'TypeScript, React' }],
      })
    ).toBe(true);

    expect(
      hasSufficientResumePreviewData({
        experiences: [{ id: 'w1' }],
        educations: [{ id: 'e1' }],
        skillGroups: [{ skillsText: '  ,  ' }],
      })
    ).toBe(false);
  });
});

describe('resolveResumeTemplatePreviewProfile', () => {
  it('always returns user profile for builder policy', () => {
    const sparse = sparseProfile({ firstName: 'Sparse' });
    expect(resolveResumeTemplatePreviewProfile(sparse, 'always-user')).toBe(sparse);
    expect(resolveResumeTemplatePreviewProfile(sparse)).toBe(sparse);
  });

  it('uses sample only for onboarding when sections are incomplete', () => {
    const sparse = sparseProfile({ firstName: 'Sparse' });
    expect(resolveResumeTemplatePreviewProfile(sparse, 'sample-when-sparse')).toBe(
      RESUME_TEMPLATE_SAMPLE_PROFILE
    );
    expect(isUsingSampleResumePreview(sparse, 'sample-when-sparse')).toBe(true);

    const full = RESUME_TEMPLATE_SAMPLE_PROFILE;
    expect(resolveResumeTemplatePreviewProfile(full, 'sample-when-sparse')).toBe(full);
    expect(isUsingSampleResumePreview(full, 'sample-when-sparse')).toBe(false);
  });
});

describe('buildOnboardingResumePreviewProfile', () => {
  it('maps onboarding draft fields into a PublicProfile-shaped preview', () => {
    const profile = buildOnboardingResumePreviewProfile({
      profile: {
        firstName: 'Sam',
        lastName: 'Lee',
        headline: 'Designer',
      },
      experiences: [
        {
          id: 'e1',
          company: 'Acme',
          role: 'Designer',
          startDate: '2020-01',
          isCurrent: true,
          bullets: ['Shipped work'],
        },
      ],
      educations: [
        {
          id: 'ed1',
          institution: 'RISD',
          degree: 'BFA',
          fieldOfStudy: 'Graphic Design',
        },
      ],
      skillGroups: [{ id: 'g1', name: 'Design', skillsText: 'Figma, Typography' }],
      projects: [
        {
          id: 'p1',
          title: 'Poster system',
          isVisible: true,
          showOnResume: true,
        },
      ],
    });

    expect(profile.firstName).toBe('Sam');
    expect(profile.workExperiences).toHaveLength(1);
    expect(profile.workExperiences[0]?.company).toBe('Acme');
    expect(profile.educations[0]?.institution).toBe('RISD');
    expect(profile.skillGroups[0]?.skills.map((s) => s.name)).toEqual(['Figma', 'Typography']);
    expect(profile.skills).toHaveLength(2);
    expect(profile.projects[0]?.title).toBe('Poster system');
    expect(profile.sections.some((s) => s.type === 'EXPERIENCE')).toBe(true);
  });

  it('accepts upload-shaped skills (flat names + skillGroups.skills arrays)', () => {
    const profile = buildOnboardingResumePreviewProfile({
      profile: { firstName: 'Upload' },
      experiences: [{ company: 'Acme', role: 'Eng' }],
      educations: [{ institution: 'MIT' }],
      skills: ['TypeScript', { name: 'React' }],
    });

    expect(profile.skills.map((s) => s.name)).toEqual(['TypeScript', 'React']);
    expect(profile.skillGroups[0]?.name).toBe('Skills');
  });
});

describe('RESUME_TEMPLATE_SAMPLE_PROFILE', () => {
  it('includes body sections so CleanResumeView can render experience, education, and skills', () => {
    const types = new Set(RESUME_TEMPLATE_SAMPLE_PROFILE.sections.map((s) => s.type));
    expect(types.has('EXPERIENCE')).toBe(true);
    expect(types.has('EDUCATION')).toBe(true);
    expect(types.has('SKILLS')).toBe(true);
    expect(types.has('SUMMARY')).toBe(true);
    expect(RESUME_TEMPLATE_SAMPLE_PROFILE.workExperiences.length).toBeGreaterThanOrEqual(2);
    expect(RESUME_TEMPLATE_SAMPLE_PROFILE.educations.length).toBeGreaterThanOrEqual(1);
    expect(
      RESUME_TEMPLATE_SAMPLE_PROFILE.skillGroups.reduce((n, g) => n + g.skills.length, 0)
    ).toBeGreaterThanOrEqual(6);
  });
});
