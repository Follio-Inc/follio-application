/**
 * Data source type definitions for the unified data sources panel.
 */

import type { DataSource } from '@prisma/client';

// ─── Source Registry ─────────────────────────────────────────────

export type SourceKey = 'resume' | 'github' | 'linkedin' | 'links' | string;

export interface SourceDefinition {
  key: SourceKey;
  label: string;
  description: string;
  /** Lucide icon name */
  icon: string;
  /** Gradient ring & bg classes */
  colorClass: string;
  iconColorClass: string;
  /** Does this source require OAuth connection? */
  requiresOAuth: boolean;
  /** OAuth strategy name (Clerk) */
  oauthStrategy?: string;
  /** Prisma DataSource enum value (if applicable) */
  dataSource?: DataSource;
  /** Is this a built-in source (can't be removed) */
  builtIn: boolean;
  /** Can be dynamically added by users */
  userAddable: boolean;
}

// ─── Built-in sources ────────────────────────────────────────────

export const BUILT_IN_SOURCES: SourceDefinition[] = [
  {
    key: 'resume',
    label: 'Resume',
    description: 'Upload and parse your resume PDF',
    icon: 'FileText',
    colorClass: 'from-orange-500/10 to-red-500/10 ring-orange-500/20',
    iconColorClass: 'text-orange-500',
    requiresOAuth: false,
    dataSource: 'RESUME',
    builtIn: true,
    userAddable: false,
  },
  {
    key: 'github',
    label: 'GitHub',
    description: 'Repositories, skills, and profile data',
    icon: 'Github',
    colorClass:
      'from-gray-500/10 to-slate-500/10 ring-gray-500/20 dark:from-white/10 dark:to-gray-400/10 dark:ring-white/20',
    iconColorClass: 'text-gray-700 dark:text-white',
    requiresOAuth: true,
    oauthStrategy: 'oauth_github',
    dataSource: 'GITHUB',
    builtIn: true,
    userAddable: false,
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    description: 'Experience, education, and profile data',
    icon: 'Linkedin',
    colorClass: 'from-blue-500/10 to-sky-500/10 ring-blue-500/20',
    iconColorClass: 'text-[#0A66C2]',
    requiresOAuth: true,
    oauthStrategy: 'oauth_linkedin_oidc',
    dataSource: 'LINKEDIN',
    builtIn: true,
    userAddable: false,
  },
  {
    key: 'links',
    label: 'Links',
    description: 'External URLs, social profiles, and websites',
    icon: 'Link',
    colorClass: 'from-emerald-500/10 to-teal-500/10 ring-emerald-500/20',
    iconColorClass: 'text-emerald-500',
    requiresOAuth: false,
    builtIn: true,
    userAddable: false,
  },
];

// ─── Addable sources (user can opt-in) ───────────────────────────

export const ADDABLE_SOURCES: SourceDefinition[] = [
  {
    key: 'twitter',
    label: 'X (Twitter)',
    description: 'Import your profile and pinned tweets',
    icon: 'Twitter',
    colorClass: 'from-sky-500/10 to-blue-500/10 ring-sky-500/20',
    iconColorClass: 'text-sky-500',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'instagram',
    label: 'Instagram',
    description: 'Showcase your visual portfolio',
    icon: 'Instagram',
    colorClass: 'from-pink-500/10 to-purple-500/10 ring-pink-500/20',
    iconColorClass: 'text-pink-500',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'medium',
    label: 'Medium',
    description: 'Import your published articles',
    icon: 'BookOpen',
    colorClass: 'from-gray-500/10 to-neutral-500/10 ring-gray-500/20',
    iconColorClass: 'text-gray-700 dark:text-gray-300',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'dribbble',
    label: 'Dribbble',
    description: 'Showcase your design shots',
    icon: 'Palette',
    colorClass: 'from-pink-400/10 to-rose-500/10 ring-pink-400/20',
    iconColorClass: 'text-pink-400',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'youtube',
    label: 'YouTube',
    description: 'Highlight your video content',
    icon: 'Youtube',
    colorClass: 'from-red-500/10 to-red-600/10 ring-red-500/20',
    iconColorClass: 'text-red-500',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'custom-link',
    label: 'Custom Link',
    description: 'Add any URL as a data source',
    icon: 'Globe',
    colorClass: 'from-violet-500/10 to-indigo-500/10 ring-violet-500/20',
    iconColorClass: 'text-violet-500',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────

export function getSourceDefinition(key: string): SourceDefinition | undefined {
  return BUILT_IN_SOURCES.find((s) => s.key === key) || ADDABLE_SOURCES.find((s) => s.key === key);
}

export function getAllSourceDefinitions(): SourceDefinition[] {
  return [...BUILT_IN_SOURCES, ...ADDABLE_SOURCES];
}

// ─── Sync status types ──────────────────────────────────────────

export interface SourceSyncStatus {
  connected: boolean;
  lastImportedAt: string | null;
  itemsImported: number;
  connectionStatus: string | null;
  /** Source-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface SyncStatus {
  sources: {
    github: SourceSyncStatus & {
      oauthUsername: string | null;
      profileUsername: string | null;
      projectCount: number;
      skillCount: number;
    };
    linkedin: SourceSyncStatus & {
      oauthName: string | null;
    };
    resume: {
      hasBeenImported: boolean;
      lastImportedAt: string | null;
      itemsImported: number;
    };
  };
  manualEdits: {
    profileFields: string[];
    profileFieldCount: number;
    experiences: { total: number; manual: number; fromResume: number; fromLinkedIn: number };
    educations: { total: number; manual: number; fromResume: number };
    skills: { total: number; manual: number; fromResume: number; fromGitHub: number };
    projects: { total: number; manual: number; fromResume: number; fromGitHub: number };
    links: { total: number; manual: number };
  };
  hasManualEdits: boolean;
}

export type ImportStatus = 'idle' | 'importing' | 'applying' | 'success' | 'error';

export interface SourceImportState {
  source: SourceKey;
  status: ImportStatus;
  message?: string;
  details?: SyncResultDetails;
}

export interface SyncResultDetails {
  profileFieldsUpdated?: string[];
  profileFieldsSkipped?: string[];
  experiencesAdded?: number;
  experiencesSkipped?: number;
  educationsAdded?: number;
  educationsSkipped?: number;
  skillsAdded?: number;
  skillsSkipped?: number;
  projectsAdded?: number;
  projectsUpdated?: number;
  projectsSkipped?: number;
  linksAdded?: number;
  linksSkipped?: number;
}
