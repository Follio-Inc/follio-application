/**
 * Shared Type Definitions
 * Types derived from Prisma schema and used across the application
 */

import type {
  Award,
  BlogPost,
  Certification,
  ContactInfo,
  CustomContentType,
  DataSource,
  DataSourceConnection,
  Education,
  ImportJob,
  ImportSessionStatus,
  Link,
  Profile,
  ProfilePhoto,
  ProfileSection,
  ProfileStatus,
  Project,
  SectionType,
  Skill,
  SkillGroup,
  User,
  WorkExperience,
  YouTubeVideo,
} from '@prisma/client';

export type { ContentVisibility } from '@prisma/client';

// ===========================================
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
  blogPosts: BlogPost[];
  youtubeVideos: YouTubeVideo[];
  photos: ProfilePhoto[];
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
  blogPosts: BlogPost[];
  youtubeVideos: YouTubeVideo[];
  photos: ProfilePhoto[];
  sections: ProfileSection[];
}

/**
 * Contact info for public viewing
 */
export interface PublicContactInfo {
  email: string | null;
  phone: string | null;
  website: string | null;
}

// ===========================================
// VIEW TYPES
// ===========================================

/**
 * Portfolio sub-view types (displayed within /u/[handle])
 * Resume is now a separate route: /u/[handle]/resume
 */
export type PortfolioView = 'portfolio' | 'timeline' | 'snapshot';

/**
 * Legacy: kept for backward compat but prefer PortfolioView
 */
export type ProfileView = PortfolioView;

/**
 * View configuration
 */
export interface ViewConfig {
  id: PortfolioView;
  name: string;
  description: string;
  icon: string;
}

export const PORTFOLIO_VIEWS: ViewConfig[] = [
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
    id: 'snapshot',
    name: 'SnapShot',
    description: 'Quick facts & metrics',
    icon: 'Users',
  },
];

/** @deprecated Use PORTFOLIO_VIEWS instead */
export const PROFILE_VIEWS = PORTFOLIO_VIEWS;

// ===========================================
// IMPORT TYPES
// ===========================================

/**
 * GitHub repository data from API.
 * Canonical definition — import from '@/types' everywhere.
 */
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner?: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  languages_url?: string;
  stargazers_count: number;
  forks_count: number;
  watchers_count?: number;
  topics: string[];
  created_at: string;
  updated_at: string;
  pushed_at: string;
  private?: boolean;
  fork?: boolean;
  archived?: boolean;
  license?: {
    key: string;
    name: string;
    spdx_id: string;
  } | null;
}

/**
 * GitHub user data from API.
 * Canonical definition — import from '@/types' everywhere.
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
  public_gists?: number;
  followers: number;
  following: number;
  created_at?: string;
  hireable?: boolean | null;
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
// IMPORT SESSION TYPES
// ===========================================

/**
 * Import session — persists proposed changes from a re-import
 * so users can review at their own pace.
 *
 * Philosophy: "Imports are helpers, not authorities. The Builder is sovereign."
 */
export interface ImportSessionData {
  id: string;
  source: DataSource;
  status: ImportSessionStatus;
  sourceLabel: string | null;
  proposedCount: number;
  parsedData: Record<string, unknown>;
  previewData: Record<string, unknown> | null;
  selections: ImportSelectionState | null;
  edits: ImportEditsState | null;
  appliedCount: number | null;
  appliedAt: string | null;
  createdAt: string;
  expiresAt: string;
}

/**
 * Tracks which proposed items the user has toggled on/off
 */
export interface ImportSelectionState {
  profileFields: Record<string, boolean>;
  experiences: Record<number, boolean>;
  educations: Record<number, boolean>;
  skills: Record<number, boolean>;
  projects: Record<number, boolean>;
  links: Record<number, boolean>;
}

/**
 * Tracks inline edits the user made before applying
 */
export interface ImportEditsState {
  experiences: Record<number, Record<string, unknown>>;
  educations: Record<number, Record<string, unknown>>;
  projects: Record<number, Record<string, unknown>>;
}

/**
 * Proposed change item with action classification
 */
export type ImportAction = 'add' | 'update' | 'skip' | 'fill';

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
  BlogPost,
  Certification,
  ContactInfo,
  CustomContentType,
  DataSource,
  DataSourceConnection,
  Education,
  ImportJob,
  ImportSessionStatus,
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
  YouTubeVideo,
};

// Note: SectionType, CustomContentType, ProfileSection are defined locally above

// ===========================================
// SECTION UI TYPES
// ===========================================

/**
 * Section configuration for UI
 */
export type SectionCategory = 'header' | 'body';

export interface SectionConfig {
  type: SectionType;
  defaultTitle: string;
  icon: string;
  description: string;
  isRemovable: boolean;
  hasItems: boolean; // Does this section have a list of items (experiences, projects) or just fields (basic info)
  category: SectionCategory; // Whether this section belongs to the Header or Body group
}

/**
 * All available section types with their configurations
 */
export const SECTION_CONFIGS: SectionConfig[] = [
  {
    type: 'BASIC_INFO',
    defaultTitle: 'Basic Info',
    icon: 'User',
    description: 'Name, headline',
    isRemovable: false,
    hasItems: false,
    category: 'header',
  },
  {
    type: 'SUMMARY',
    defaultTitle: 'Summary',
    icon: 'FileText',
    description: 'Professional summary or about section',
    isRemovable: true,
    hasItems: false,
    category: 'body',
  },
  {
    type: 'EXPERIENCE',
    defaultTitle: 'Experience',
    icon: 'Briefcase',
    description: 'Work history',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'EDUCATION',
    defaultTitle: 'Education',
    icon: 'GraduationCap',
    description: 'Schools and degrees',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'SKILLS',
    defaultTitle: 'Skills',
    icon: 'Code',
    description: 'Technical and soft skills',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'PROJECTS',
    defaultTitle: 'Projects',
    icon: 'FolderKanban',
    description: 'Portfolio projects',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'LINKS',
    defaultTitle: 'Links',
    icon: 'Link',
    description: 'Social profiles and websites',
    isRemovable: true,
    hasItems: true,
    category: 'header',
  },
  {
    type: 'AWARDS',
    defaultTitle: 'Awards',
    icon: 'Award',
    description: 'Recognition and achievements',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'CERTIFICATIONS',
    defaultTitle: 'Certifications',
    icon: 'BadgeCheck',
    description: 'Professional certifications',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'PUBLICATIONS',
    defaultTitle: 'Publications',
    icon: 'BookOpen',
    description: 'Papers, articles, books',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'VOLUNTEERING',
    defaultTitle: 'Volunteering',
    icon: 'Heart',
    description: 'Community involvement',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'LANGUAGES',
    defaultTitle: 'Languages',
    icon: 'Globe',
    description: 'Languages you speak',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'INTERESTS',
    defaultTitle: 'Interests',
    icon: 'Sparkles',
    description: 'Hobbies and interests',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
  {
    type: 'CUSTOM',
    defaultTitle: 'Custom Section',
    icon: 'LayoutGrid',
    description: 'Create your own section',
    isRemovable: true,
    hasItems: true,
    category: 'body',
  },
];

/**
 * Section types that belong to the "Header" category in the builder sidebar.
 * Everything else is considered "Body".
 */
export const HEADER_SECTION_TYPES: SectionType[] = ['BASIC_INFO', 'CONTACT', 'LINKS'];

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
  isVisible?: boolean;
}

/**
 * Custom section content structure
 */
export interface CustomSectionContent {
  items?: CustomSectionItem[];
  content?: string; // For freeform content
}

/**
 * Volunteering experience item
 */
export interface VolunteeringItem {
  id: string;
  organization: string;
  role: string;
  cause?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  url?: string;
  isVisible?: boolean;
}

/**
 * Volunteering section content
 */
export interface VolunteeringSectionContent {
  items: VolunteeringItem[];
}

/**
 * Language proficiency item
 */
export interface LanguageItem {
  id: string;
  language: string;
  proficiency: 'NATIVE' | 'FLUENT' | 'ADVANCED' | 'INTERMEDIATE' | 'BASIC';
  isVisible?: boolean;
}

/**
 * Languages section content
 */
export interface LanguagesSectionContent {
  items: LanguageItem[];
}

/**
 * Publication item
 */
export interface PublicationItem {
  id: string;
  title: string;
  publisher?: string;
  authors?: string;
  date?: string;
  description?: string;
  url?: string;
  doi?: string;
  isVisible?: boolean;
}

/**
 * Publications section content
 */
export interface PublicationsSectionContent {
  items: PublicationItem[];
}

/**
 * Interest item
 */
export interface InterestItem {
  id: string;
  name: string;
  category?: string;
  isVisible?: boolean;
}

/**
 * Interests section content
 */
export interface InterestsSectionContent {
  items: InterestItem[];
}
