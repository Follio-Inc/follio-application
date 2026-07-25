import {
  buildOnboardingResumePreviewProfile,
  buildSparseResumePreviewProfile,
  hasSufficientResumePreviewData,
  isUsingSampleResumePreview,
  resolveResumeTemplatePreviewProfile,
  RESUME_TEMPLATE_SAMPLE_PROFILE,
  TEMPLATE_PREVIEW_IN_BUILDER,
  TEMPLATE_PREVIEW_ON_CREATE,
} from '@/lib/resume/templates';
import type { PublicProfile } from '@/types';
import { describe, expect, it } from 'vitest';

function sparseProfile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    ...RESUME_TEMPLATE_SAMPLE_PROFILE,
    firstName: null,
    lastName: null,
    contactInfo: { email: null, phone: null, website: null },
    workExperiences: [],
    educations: [],
    skills: [],
    skillGroups: [],
    ...overrides,
  } as PublicProfile;
}

const fullEnough = {
  firstName: 'Sam',
  lastName: 'Lee',
  contactInfo: { email: 'sam@example.com', phone: null, website: null },
  workExperiences: [{ id: 'w1' }],
  educations: [{ id: 'e1' }],
  skills: [{ id: 's1' }],
};

describe('hasSufficientResumePreviewData', () => {
  it('requires name, email, experience, education, and at least one skill', () => {
    expect(hasSufficientResumePreviewData(fullEnough)).toBe(true);

    expect(
      hasSufficientResumePreviewData({
        ...fullEnough,
        firstName: null,
        lastName: null,
      })
    ).toBe(false);

    expect(
      hasSufficientResumePreviewData({
        ...fullEnough,
        contactInfo: { email: null },
      })
    ).toBe(false);

    expect(
      hasSufficientResumePreviewData({
        ...fullEnough,
        workExperiences: [],
        experiences: [],
      })
    ).toBe(false);

    expect(
      hasSufficientResumePreviewData({
        ...fullEnough,
        educations: [],
      })
    ).toBe(false);

    expect(
      hasSufficientResumePreviewData({
        ...fullEnough,
        skills: [],
        skillGroups: [],
      })
    ).toBe(false);
  });

  it('accepts onboarding skillGroups.skillsText and experiences alias', () => {
    expect(
      hasSufficientResumePreviewData({
        firstName: 'Sam',
        email: 'sam@example.com',
        experiences: [{ id: 'w1' }],
        educations: [{ id: 'e1' }],
        skillGroups: [{ skillsText: 'TypeScript, React' }],
      })
    ).toBe(true);

    expect(
      hasSufficientResumePreviewData({
        firstName: 'Sam',
        email: 'sam@example.com',
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
    expect(resolveResumeTemplatePreviewProfile(sparse, TEMPLATE_PREVIEW_IN_BUILDER)).toBe(sparse);
    expect(resolveResumeTemplatePreviewProfile(sparse)).toBe(sparse);
  });

  it('uses sample on create when identity or sections are incomplete', () => {
    const sparse = sparseProfile({ firstName: 'Sparse' });
    expect(resolveResumeTemplatePreviewProfile(sparse, TEMPLATE_PREVIEW_ON_CREATE)).toBe(
      RESUME_TEMPLATE_SAMPLE_PROFILE
    );
    expect(isUsingSampleResumePreview(sparse, TEMPLATE_PREVIEW_ON_CREATE)).toBe(true);

    const full = RESUME_TEMPLATE_SAMPLE_PROFILE;
    expect(resolveResumeTemplatePreviewProfile(full, TEMPLATE_PREVIEW_ON_CREATE)).toBe(full);
    expect(isUsingSampleResumePreview(full, TEMPLATE_PREVIEW_ON_CREATE)).toBe(false);
  });

  it('blank sparse stub resolves to sample under creation policy', () => {
    const blank = buildSparseResumePreviewProfile();
    expect(hasSufficientResumePreviewData(blank)).toBe(false);
    expect(resolveResumeTemplatePreviewProfile(blank, TEMPLATE_PREVIEW_ON_CREATE)).toBe(
      RESUME_TEMPLATE_SAMPLE_PROFILE
    );
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
      contactInfo: { email: 'sam@example.com' },
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
    expect(profile.contactInfo?.email).toBe('sam@example.com');
    expect(profile.workExperiences).toHaveLength(1);
    expect(profile.workExperiences[0]?.company).toBe('Acme');
    expect(profile.educations[0]?.institution).toBe('RISD');
    expect(profile.skillGroups[0]?.skills.map((s) => s.name)).toEqual(['Figma', 'Typography']);
    expect(profile.skills).toHaveLength(2);
    expect(profile.projects[0]?.title).toBe('Poster system');
    expect(profile.sections.some((s) => s.type === 'EXPERIENCE')).toBe(true);
    expect(hasSufficientResumePreviewData(profile)).toBe(true);
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
    expect(hasSufficientResumePreviewData(RESUME_TEMPLATE_SAMPLE_PROFILE)).toBe(true);
  });
});
