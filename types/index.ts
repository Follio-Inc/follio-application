/**
 * Shared Type Definitions
 * Types derived from Prisma schema and used across the application
 */

import type {
  Award,
  Certification,
  ContactInfo,
  DataSource,
  Education,
  Link,
  Profile,
  ProfileSection,
  ProfileStatus,
  Project,
  SectionType,
  Skill,
  SkillGroup,
  User,
  WorkExperience,
} from '@prisma/client';

// ===========================================
// PROFILE TYPES
// ===========================================// ===========================================
// PROFILE TYPES
// ===========================================

/**
 * Full profile with all relations loaded
 */
export interface FullProfile extends Profile {
  contactInfo: ContactInfo | null;
  links: Link[];
  workExperiences: WorkExperience[];
  educations: Education[];
  skills: Skill[];
  skillGroups: (SkillGroup & { skills: Skill[] })[];
  projects: Project[];
  awards: Award[];
  certifications: Certification[];
  sections: ProfileSection[];
}

/**
 * Profile for public viewing (excludes sensitive data)
 */
export interface PublicProfile extends Omit<Profile, 'userId'> {
  contactInfo: PublicContactInfo | null;
  links: Link[];
  workExperiences: WorkExperience[];
  educations: Education[];
  skills: Skill[];
  skillGroups: (SkillGroup & { skills: Skill[] })[];
  projects: Project[];
  awards: Award[];
  certifications: Certification[];
  sections: ProfileSection[];
}

/**
 * Contact info for public viewing
 */
export interface PublicContactInfo {
  email: string | null;
  website: string | null;
  // phone is excluded from public view
}

// ===========================================
// VIEW TYPES
// ===========================================

/**
 * Available profile view types
 */
export type ProfileView = 'resume' | 'portfolio' | 'timeline' | 'recruiter';

/**
 * View configuration
 */
export interface ViewConfig {
  id: ProfileView;
  name: string;
  description: string;
  icon: string;
}

export const PROFILE_VIEWS: ViewConfig[] = [
  {
    id: 'resume',
    name: 'Resume',
    description: 'Traditional resume format',
    icon: 'FileText',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Project-focused showcase',
    icon: 'Briefcase',
  },
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'Chronological journey',
    icon: 'Clock',
  },
  {
    id: 'recruiter',
    name: 'Recruiter',
    description: 'Quick facts & metrics',
    icon: 'Users',
  },
];

// ===========================================
// IMPORT TYPES
// ===========================================

/**
 * GitHub repository data from API
 */
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics: string[];
  created_at: string;
  updated_at: string;
  pushed_at: string;
  private: boolean;
}

/**
 * GitHub user data from API
 */
export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
}

/**
 * Normalized import data ready to merge
 */
export interface NormalizedImportData {
  source: DataSource;
  profile?: Partial<Profile>;
  contactInfo?: Partial<ContactInfo>;
  links?: Partial<Link>[];
  workExperiences?: Partial<WorkExperience>[];
  educations?: Partial<Education>[];
  skills?: Partial<Skill>[];
  projects?: Partial<Project>[];
}

/**
 * Merge operation result
 */
export interface MergeResult {
  success: boolean;
  fieldsUpdated: string[];
  fieldsSkipped: string[];
  conflicts: MergeConflict[];
}

/**
 * Merge conflict for user resolution
 */
export interface MergeConflict {
  field: string;
  currentValue: unknown;
  importedValue: unknown;
  source: DataSource;
}

// ===========================================
// EXPORT TYPES
// ===========================================

/**
 * JSON Resume format (https://jsonresume.org/schema/)
 */
export interface JSONResume {
  basics: {
    name: string;
    label?: string;
    image?: string;
    email?: string;
    phone?: string;
    url?: string;
    summary?: string;
    location?: {
      address?: string;
      postalCode?: string;
      city?: string;
      countryCode?: string;
      region?: string;
    };
    profiles?: {
      network: string;
      username?: string;
      url: string;
    }[];
  };
  work?: {
    name: string;
    position: string;
    url?: string;
    startDate: string;
    endDate?: string;
    summary?: string;
    highlights?: string[];
  }[];
  education?: {
    institution: string;
    url?: string;
    area?: string;
    studyType?: string;
    startDate?: string;
    endDate?: string;
    score?: string;
    courses?: string[];
  }[];
  skills?: {
    name: string;
    level?: string;
    keywords?: string[];
  }[];
  projects?: {
    name: string;
    description?: string;
    highlights?: string[];
    keywords?: string[];
    startDate?: string;
    endDate?: string;
    url?: string;
    roles?: string[];
    type?: string;
  }[];
  awards?: {
    title: string;
    date?: string;
    awarder?: string;
    summary?: string;
  }[];
  certificates?: {
    name: string;
    date?: string;
    issuer?: string;
    url?: string;
  }[];
}

// ===========================================
// API RESPONSE TYPES
// ===========================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ===========================================
// SESSION/AUTH TYPES
// ===========================================

export interface SessionUser {
  id: string;
  clerkId: string;
  email: string;
  profile: Profile | null;
}

// Re-export Prisma types for convenience
export type {
  Award,
  Certification,
  ContactInfo,
  CustomContentType,
  DataSource,
  Education,
  Link,
  Profile,
  ProfileSection,
  ProfileStatus,
  Project,
  SectionType,
  Skill,
  SkillGroup,
  User,
  WorkExperience,
};

// Note: SectionType, CustomContentType, ProfileSection are defined locally above

// ===========================================
// SECTION UI TYPES
// ===========================================

/**
 * Section configuration for UI
 */
export interface SectionConfig {
  type: SectionType;
  defaultTitle: string;
  icon: string;
  description: string;
  isRemovable: boolean;
  hasItems: boolean; // Does this section have a list of items (experiences, projects) or just fields (basic info)
}

/**
 * All available section types with their configurations
 */
export const SECTION_CONFIGS: SectionConfig[] = [
  {
    type: 'BASIC_INFO',
    defaultTitle: 'Basic Info',
    icon: 'User',
    description: 'Name, headline, summary',
    isRemovable: false,
    hasItems: false,
  },
  {
    type: 'EXPERIENCE',
    defaultTitle: 'Experience',
    icon: 'Briefcase',
    description: 'Work history',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'EDUCATION',
    defaultTitle: 'Education',
    icon: 'GraduationCap',
    description: 'Schools and degrees',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'SKILLS',
    defaultTitle: 'Skills',
    icon: 'Code',
    description: 'Technical and soft skills',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'PROJECTS',
    defaultTitle: 'Projects',
    icon: 'FolderKanban',
    description: 'Portfolio projects',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'LINKS',
    defaultTitle: 'Links',
    icon: 'Link',
    description: 'Social profiles and websites',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'AWARDS',
    defaultTitle: 'Awards',
    icon: 'Award',
    description: 'Recognition and achievements',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'CERTIFICATIONS',
    defaultTitle: 'Certifications',
    icon: 'BadgeCheck',
    description: 'Professional certifications',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'PUBLICATIONS',
    defaultTitle: 'Publications',
    icon: 'BookOpen',
    description: 'Papers, articles, books',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'VOLUNTEERING',
    defaultTitle: 'Volunteering',
    icon: 'Heart',
    description: 'Community involvement',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'LANGUAGES',
    defaultTitle: 'Languages',
    icon: 'Globe',
    description: 'Languages you speak',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'INTERESTS',
    defaultTitle: 'Interests',
    icon: 'Sparkles',
    description: 'Hobbies and interests',
    isRemovable: true,
    hasItems: true,
  },
  {
    type: 'CUSTOM',
    defaultTitle: 'Custom Section',
    icon: 'LayoutGrid',
    description: 'Create your own section',
    isRemovable: true,
    hasItems: true,
  },
];

/**
 * Custom section content item (for structured custom sections)
 */
export interface CustomSectionItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  url?: string;
  tags?: string[];
}

/**
 * Custom section content structure
 */
export interface CustomSectionContent {
  items?: CustomSectionItem[];
  content?: string; // For freeform content
}
