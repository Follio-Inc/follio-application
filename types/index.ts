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
// RESUME DESIGN TYPES
// ===========================================

/** Font families available for resume rendering */
export type ResumeFontFamily =
  | 'georgia'
  | 'times'
  | 'garamond'
  | 'inter'
  | 'roboto'
  | 'lato'
  | 'merriweather'
  | 'source-sans'
  | 'open-sans'
  | 'raleway'
  | 'instrument-sans'
  | 'dm-sans'
  | 'system'
  | 'great-vibes';

/**
 * Header text alignment when the resume photo is hidden: left | center | right.
 */
export type ResumeHeaderAlignment = 'left' | 'center' | 'right';

/**
 * Header composition when the resume photo is shown.
 * Distinct from text alignment — e.g. `photo-right` keeps name/title left-aligned
 * with the photo pinned to the right of the header row.
 */
export type ResumeHeaderPhotoLayout =
  | 'photo-left'
  | 'photo-right'
  | 'photo-above'
  | 'photo-above-left';

/** Section divider style */
export type ResumeDividerStyle = 'line' | 'double' | 'dotted' | 'dashed' | 'thick' | 'none';

/** Paper density / spacing */
export type ResumeDensity = 'compact' | 'normal' | 'relaxed';

/** Resume color theme — independent of the Follio app theme */
export type ResumeColorTheme = 'light' | 'dark' | 'system';

/** Resume layout kit — presentation only; content is shared across templates */
export type ResumeTemplateId = 'classic' | 'lumen' | 'sleek' | 'studio' | 'atelier';

/**
 * On-screen and PDF page layout.
 * - `continuous` — single scrollable sheet (digital-first)
 * - `a4` — ISO A4 pages with visible breaks
 * - `letter` — US Letter pages with visible breaks
 */
export type ResumePageLayout = 'continuous' | 'a4' | 'letter';

/** Alias used by PDF export — same values as `ResumePageLayout`. */
export type PdfLayout = ResumePageLayout;

/** Text emphasis for a typography role (name, title, headings, body) */
export interface ResumeTextStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export const RESUME_TEXT_STYLE_DEFAULTS: ResumeTextStyle = {
  bold: false,
  italic: false,
  underline: false,
};

/**
 * Resume design settings — stored as JSON on the Profile model.
 * All fields are optional; missing values fall back to defaults.
 * Switching `templateId` never rewrites profile content.
 */
export interface ResumeDesign {
  /** Layout kit id (classic single-column, sidebar two-column, …) */
  templateId?: ResumeTemplateId;
  /** Light / dark / system color theme for the resume document */
  colorTheme?: ResumeColorTheme;
  /** Color for section headings (CSS color, e.g. '#1a1a1a' or '#2563eb') */
  headingColor?: string;
  /** Accent color for divider lines, bullets, etc. */
  accentColor?: string;
  /** Body / content font family (legacy single-font field) */
  fontFamily?: ResumeFontFamily;
  /** Font for the display name; falls back to `fontFamily` when unset */
  nameFontFamily?: ResumeFontFamily;
  /**
   * Font for the professional title under the name (`.resume-headline`).
   * Independent from section headings — falls back to body (or Atelier heading) when unset.
   */
  titleFontFamily?: ResumeFontFamily;
  /** Font for section headings (EXPERIENCE, EDUCATION, …); falls back to system UI when unset */
  headingFontFamily?: ResumeFontFamily;
  /** Font for email / phone / contact block; falls back to system UI (or template default) when unset */
  contactFontFamily?: ResumeFontFamily;
  /**
   * Header text alignment when the photo is off: left / center / right.
   */
  headerAlignment?: ResumeHeaderAlignment;
  /**
   * Header composition when the photo is on.
   * Independent of `headerAlignment` — photo layouts are not text-align aliases.
   */
  headerPhotoLayout?: ResumeHeaderPhotoLayout;
  /** Profile photo size in px (default 80; classic/lumen). Sleek/studio default to 64. */
  photoSize?: number;
  /** Style of the divider line below section headings */
  dividerStyle?: ResumeDividerStyle;
  /** Base body font size in px (default 13) */
  fontSize?: number;
  /** Content density / spacing */
  density?: ResumeDensity;
  /** Name font size in px (default 28) */
  nameFontSize?: number;
  /** Professional title (headline) font size in px (default 15) */
  titleFontSize?: number;
  /** Section heading font size in px (default 12) */
  headingFontSize?: number;
  /** Contact (email / phone) font size in px (default 12) */
  contactFontSize?: number;
  /** Bold / italic / underline for the display name */
  nameStyle?: ResumeTextStyle;
  /** Bold / italic / underline for the professional title under the name */
  titleStyle?: ResumeTextStyle;
  /** Bold / italic / underline for section headings */
  headingStyle?: ResumeTextStyle;
  /** Bold / italic / underline for body text */
  bodyStyle?: ResumeTextStyle;
  /** Bold / italic / underline for contact (email / phone) */
  contactStyle?: ResumeTextStyle;
  /** Apply justified text alignment to all resume content */
  justifyAll?: boolean;
  /**
   * Page layout for the live resume view (and download gating).
   * Continuous resumes may download as continuous, A4, or Letter;
   * A4/Letter resumes download as A4 or Letter only.
   */
  pageLayout?: ResumePageLayout;
}

/** Default design settings applied when no custom design is configured */
export const RESUME_DESIGN_DEFAULTS: Required<ResumeDesign> = {
  /** Resume defaults to light paper — independent of the Follio app theme */
  templateId: 'classic',
  colorTheme: 'light',
  headingColor: '#000000',
  accentColor: '#000000',
  fontFamily: 'georgia',
  nameFontFamily: 'georgia',
  titleFontFamily: 'georgia',
  headingFontFamily: 'system',
  contactFontFamily: 'system',
  headerAlignment: 'center',
  headerPhotoLayout: 'photo-left',
  photoSize: 80,
  dividerStyle: 'line',
  fontSize: 13,
  density: 'normal',
  nameFontSize: 28,
  titleFontSize: 15,
  headingFontSize: 12,
  contactFontSize: 12,
  nameStyle: { bold: true, italic: false, underline: false },
  titleStyle: { bold: false, italic: true, underline: false },
  headingStyle: { bold: true, italic: false, underline: false },
  bodyStyle: { bold: false, italic: false, underline: false },
  contactStyle: { bold: false, italic: false, underline: false },
  justifyAll: false,
  pageLayout: 'continuous',
};

/** Ordered allowlist for resume font pickers */
export const RESUME_FONT_OPTIONS: ResumeFontFamily[] = [
  'georgia',
  'times',
  'garamond',
  'merriweather',
  'inter',
  'roboto',
  'lato',
  'source-sans',
  'open-sans',
  'raleway',
  'instrument-sans',
  'dm-sans',
  'system',
  'great-vibes',
];

/** Maps font family identifiers to CSS font-family values */
export const RESUME_FONT_MAP: Record<ResumeFontFamily, string> = {
  georgia: "'Georgia', 'Times New Roman', Times, serif",
  times: "'Times New Roman', Times, serif",
  garamond: "'EB Garamond', 'Garamond', 'Georgia', serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  roboto: "'Roboto', -apple-system, 'Segoe UI', sans-serif",
  lato: "'Lato', -apple-system, 'Segoe UI', sans-serif",
  merriweather: "'Merriweather', 'Georgia', serif",
  'source-sans': "'Source Sans 3', -apple-system, 'Segoe UI', sans-serif",
  'open-sans': "'Open Sans', -apple-system, 'Segoe UI', sans-serif",
  raleway: "'Raleway', -apple-system, 'Segoe UI', sans-serif",
  'instrument-sans': "'Instrument Sans', -apple-system, 'Segoe UI', sans-serif",
  'dm-sans': "'DM Sans', -apple-system, 'Segoe UI', sans-serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  'great-vibes': "'Great Vibes', 'Segoe Script', cursive",
};

/** Human-readable labels for font families */
export const RESUME_FONT_LABELS: Record<ResumeFontFamily, string> = {
  georgia: 'Georgia',
  times: 'Times New Roman',
  garamond: 'EB Garamond',
  inter: 'Inter',
  roboto: 'Roboto',
  lato: 'Lato',
  merriweather: 'Merriweather',
  'source-sans': 'Source Sans',
  'open-sans': 'Open Sans',
  raleway: 'Raleway',
  'instrument-sans': 'Instrument Sans',
  'dm-sans': 'DM Sans',
  system: 'System UI',
  'great-vibes': 'Great Vibes',
};

// ===========================================
// PROFILE TYPES
// ===========================================

/**
 * Public site view mode.
 *
 * A profile renders as one of two views:
 *  - `portfolio` — Visual showcase, deeper read.
 *  - `resume`    — Traditional ATS-friendly document.
 */
export type PortfolioView = 'portfolio' | 'resume';

/**
 * Full profile with all relations loaded
 */
export interface FullProfile extends Omit<Profile, 'resumeDesign'> {
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
  /** Resume design settings (JSON column, may be null) */
  resumeDesign: ResumeDesign | null;
}

/**
 * Profile for public viewing (excludes sensitive data)
 */
export interface PublicProfile extends Omit<Profile, 'userId' | 'resumeDesign'> {
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
  /** Resume design settings (JSON column, may be null) */
  resumeDesign: ResumeDesign | null;
}

/**
 * Contact info for public viewing
 */
export interface PublicContactInfo {
  email: string | null;
  phone: string | null;
  website: string | null;
  headerFieldsOrder?: string[] | null;
}

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
    defaultTitle: 'Header',
    icon: 'User',
    description: 'Name, headline, contact details',
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
export const HEADER_SECTION_TYPES: SectionType[] = ['BASIC_INFO', 'LINKS'];

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
