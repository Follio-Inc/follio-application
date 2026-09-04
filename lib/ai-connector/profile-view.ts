type ProfileLike = {
  handle: string;
  resumeTitle: string;
  firstName: string | null;
  middleName?: string | null;
  lastName: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  contactInfo?: {
    email: string | null;
    phone: string | null;
    website: string | null;
  } | null;
  workExperiences: Array<{
    id: string;
    company: string;
    role: string;
    location: string | null;
    startDate: Date;
    endDate: Date | null;
    isCurrent: boolean;
    bullets: string[];
    isVisible: boolean;
  }>;
  educations: Array<{
    id: string;
    institution: string;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: Date | null;
    endDate: Date | null;
    isCurrent: boolean;
    isVisible: boolean;
  }>;
  skills: Array<{
    id: string;
    name: string;
    isVisible: boolean;
  }>;
  skillGroups?: Array<{
    name: string;
    skills: Array<{ name: string; isVisible: boolean }>;
  }>;
  projects: Array<{
    id: string;
    title: string;
    description: string | null;
    url: string | null;
    techStack: string[];
    highlights: string[];
    isVisible: boolean;
  }>;
};

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function toConnectorProfileView(profile: ProfileLike) {
  const skillNames = [
    ...profile.skills.filter((skill) => skill.isVisible).map((skill) => skill.name),
    ...(profile.skillGroups ?? []).flatMap((group) =>
      group.skills.filter((skill) => skill.isVisible).map((skill) => skill.name)
    ),
  ];

  return {
    handle: profile.handle,
    resumeTitle: profile.resumeTitle,
    name: [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' '),
    headline: profile.headline,
    summary: profile.summary,
    location: profile.location,
    contact: {
      email: profile.contactInfo?.email ?? null,
      phone: profile.contactInfo?.phone ?? null,
      website: profile.contactInfo?.website ?? null,
    },
    experiences: profile.workExperiences
      .filter((item) => item.isVisible)
      .map((item) => ({
        id: item.id,
        company: item.company,
        role: item.role,
        location: item.location,
        startDate: isoDate(item.startDate),
        endDate: isoDate(item.endDate),
        isCurrent: item.isCurrent,
        bullets: item.bullets,
      })),
    education: profile.educations
      .filter((item) => item.isVisible)
      .map((item) => ({
        id: item.id,
        institution: item.institution,
        degree: item.degree,
        fieldOfStudy: item.fieldOfStudy,
        startDate: isoDate(item.startDate),
        endDate: isoDate(item.endDate),
        isCurrent: item.isCurrent,
      })),
    skills: Array.from(new Set(skillNames)),
    projects: profile.projects
      .filter((item) => item.isVisible)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        url: item.url,
        techStack: item.techStack,
        highlights: item.highlights,
      })),
  };
}

export type ConnectorProfileView = ReturnType<typeof toConnectorProfileView>;
