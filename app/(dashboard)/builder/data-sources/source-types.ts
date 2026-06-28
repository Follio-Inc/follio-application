/**
 * Data source type definitions for the unified data sources panel.
 */

import type { DataSource } from '@prisma/client';

// ─── Source Registry ─────────────────────────────────────────────

export type SourceKey = 'resume' | 'github' | 'linkedin' | 'google' | 'links' | string;

export interface SourceDefinition {
  key: SourceKey;
  label: string;
  description: string;
  /** Lucide icon name */
  icon: string;
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
  /** Stored fetch info for refreshing (endpoint, body) */
  fetchInfo?: {
    endpoint: string;
    body: Record<string, unknown>;
  };
}

// ─── Built-in sources ────────────────────────────────────────────

export const BUILT_IN_SOURCES: SourceDefinition[] = [
  {
    key: 'resume',
    label: 'Resume',
    description: 'Upload and parse your resume PDF',
    icon: 'FileText',
    iconColorClass: 'text-muted-foreground',
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
    iconColorClass: 'text-foreground',
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
    iconColorClass: 'text-foreground',
    requiresOAuth: true,
    oauthStrategy: 'oauth_linkedin_oidc',
    dataSource: 'LINKEDIN',
    builtIn: true,
    userAddable: false,
  },
  {
    key: 'google',
    label: 'Google',
    description: 'Profile info and email from Google',
    icon: 'Google',
    iconColorClass: 'text-foreground',
    requiresOAuth: true,
    oauthStrategy: 'oauth_google',
    dataSource: 'GOOGLE',
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
    iconColorClass: 'text-foreground',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'instagram',
    label: 'Instagram',
    description: 'Showcase your visual portfolio',
    icon: 'Instagram',
    iconColorClass: 'text-foreground',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'medium',
    label: 'Medium',
    description: 'Import your published articles',
    icon: 'BookOpen',
    iconColorClass: 'text-muted-foreground',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'dribbble',
    label: 'Dribbble',
    description: 'Showcase your design shots',
    icon: 'Palette',
    iconColorClass: 'text-foreground',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'youtube',
    label: 'YouTube',
    description: 'Highlight your video content',
    icon: 'Youtube',
    iconColorClass: 'text-foreground',
    requiresOAuth: false,
    builtIn: false,
    userAddable: true,
  },
  {
    key: 'custom-link',
    label: 'Custom Link',
    description: 'Add any URL as a data source',
    icon: 'Globe',
    iconColorClass: 'text-foreground',
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
      avatarUrl: string | null;
      emailAddress: string | null;
      profileUsername: string | null;
      projectCount: number;
      skillCount: number;
    };
    linkedin: SourceSyncStatus & {
      oauthName: string | null;
      avatarUrl: string | null;
      emailAddress: string | null;
    };
    google: SourceSyncStatus & {
      oauthName: string | null;
      avatarUrl: string | null;
      emailAddress: string | null;
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
