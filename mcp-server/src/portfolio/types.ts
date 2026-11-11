/**
 * The portfolio shape this MCP server returns.
 *
 * Field names follow Follio's own data model (Profile, WorkExperience,
 * Education, Project, Skill in prisma/schema.prisma) so that swapping the
 * synthetic fixtures for real data later is a change of source, not of shape.
 *
 * Everything is `readonly`: this server is read-only, and the type says so.
 * Dates are ISO `YYYY-MM-DD` strings rather than `Date` objects so a portfolio
 * survives JSON serialisation onto the wire unchanged.
 */

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'INTERNSHIP' | 'CONTRACT' | 'FREELANCE';

export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';

export interface PortfolioContact {
  readonly email: string;
  readonly website: string | null;
  readonly location: string | null;
}

export interface PortfolioProfile {
  readonly handle: string;
  readonly fullName: string;
  readonly headline: string;
  readonly summary: string;
  readonly totalExperience: string;
  readonly contact: PortfolioContact;
}

export interface PortfolioExperience {
  readonly id: string;
  readonly company: string;
  readonly role: string;
  readonly employmentType: EmploymentType;
  readonly location: string | null;
  readonly startDate: string;
  /** `null` while the role is current. */
  readonly endDate: string | null;
  readonly isCurrent: boolean;
  readonly bullets: readonly string[];
}

export interface PortfolioEducation {
  readonly id: string;
  readonly institution: string;
  readonly degree: string;
  readonly fieldOfStudy: string;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly gpa: string | null;
  readonly honors: readonly string[];
}

export interface PortfolioProject {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly url: string | null;
  readonly repoUrl: string | null;
  readonly techStack: readonly string[];
  readonly highlights: readonly string[];
}

export interface PortfolioSkill {
  readonly name: string;
  readonly level: SkillLevel;
  readonly yearsOfExp: number;
}

export interface PortfolioSkillGroup {
  readonly name: string;
  readonly skills: readonly PortfolioSkill[];
}

export interface PortfolioMeta {
  /**
   * Always `'synthetic-fixture'` today. Kept in the response so a caller can
   * tell demo data from real data without inspecting the values.
   */
  readonly dataSource: 'synthetic-fixture';
  /** Fixed in the fixture, so a response is byte-for-byte reproducible. */
  readonly lastUpdated: string;
}

export interface Portfolio {
  readonly profile: PortfolioProfile;
  readonly experience: readonly PortfolioExperience[];
  readonly education: readonly PortfolioEducation[];
  readonly projects: readonly PortfolioProject[];
  readonly skills: readonly PortfolioSkillGroup[];
  readonly meta: PortfolioMeta;
}
