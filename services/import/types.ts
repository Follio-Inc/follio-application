/**
 * Import Service Types
 *
 * Defines interfaces for the modular import service layer.
 * Each import source (resume, GitHub, LinkedIn, etc.) implements
 * these interfaces to ensure consistent behavior.
 */

import type { DataSource } from '@prisma/client';

// ===========================================
// NORMALIZED DATA TYPES
// ===========================================

/**
 * Normalized profile data that can be merged into canonical schema
 */
export interface NormalizedProfileData {
  // Basic info
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  location?: string;
  avatarUrl?: string;
}

export interface NormalizedContactInfo {
  email?: string;
  phone?: string;
  website?: string;
}

export interface NormalizedLink {
  type: string;
  url: string;
  label?: string;
  source: DataSource;
}

export interface NormalizedExperience {
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  bullets?: string[];
  tags?: string[];
  source: DataSource;
}

export interface NormalizedProject {
  title: string;
  description?: string;
  shortDesc?: string;
  url?: string;
  repoUrl?: string;
  techStack?: string[];
  featured?: boolean;
  sortOrder?: number;
  source: DataSource;
  // GitHub-specific
  ghStars?: number;
  ghForks?: number;
  ghLanguage?: string;
}

export interface NormalizedEducation {
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  gpa?: string;
  source: DataSource;
}

export interface NormalizedSkill {
  name: string;
  level?: string;
  category?: string;
  source: DataSource;
}

export interface NormalizedCertification {
  name: string;
  issuer: string;
  issueDate?: string;
  expirationDate?: string;
  credentialId?: string;
  credentialUrl?: string;
  source: DataSource;
}

// ===========================================
// IMPORT RESULT TYPES
// ===========================================

/**
 * Field-level confidence for imported data
 */
export interface FieldConfidence {
  field: string;
  confidence: number; // 0-1
  source: DataSource;
}

/**
 * Complete normalized import result from any source
 */
export interface NormalizedImportResult {
  source: DataSource;
  profile?: NormalizedProfileData;
  contactInfo?: NormalizedContactInfo;
  links?: NormalizedLink[];
  experiences?: NormalizedExperience[];
  projects?: NormalizedProject[];
  educations?: NormalizedEducation[];
  skills?: NormalizedSkill[];
  certifications?: NormalizedCertification[];

  // Meta information
  meta: {
    source: DataSource;
    importedAt: Date;
    rawDataStored?: boolean;
    confidence?: number; // Overall confidence 0-1
    fieldConfidences?: FieldConfidence[];
  };

  // Summary for user feedback
  summary: {
    profileFields?: number;
    experiences?: number;
    projects?: number;
    educations?: number;
    skills?: number;
    links?: number;
    certifications?: number;
  };
}

// ===========================================
// SERVICE INTERFACES
// ===========================================

/**
 * Common result type for all import operations
 */
export interface ImportServiceResult<T = NormalizedImportResult> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;

  // For async processing
  jobId?: string;
  status?: 'completed' | 'processing' | 'failed';
}

/**
 * Resume import service interface
 */
export interface IResumeImportService {
  /**
   * Parse and normalize a resume file
   * @param file - Resume file buffer
   * @param mimeType - File MIME type (pdf, docx, txt)
   * @param userId - User ID for storage/logging
   */
  importResume(file: Buffer, mimeType: string, userId: string): Promise<ImportServiceResult>;

  /**
   * Parse resume from plain text
   */
  importResumeText(text: string, userId: string): Promise<ImportServiceResult>;

  /**
   * Get the status of an async import job
   */
  getJobStatus(jobId: string): Promise<ImportServiceResult>;
}

/**
 * GitHub import service interface
 */
export interface IGitHubImportService {
  /**
   * Import data from a GitHub profile
   * @param username - GitHub username
   * @param accessToken - OAuth access token (optional, for private repos)
   * @param userId - User ID for storage/logging
   */
  importGitHub(
    username: string,
    accessToken: string | undefined,
    userId: string
  ): Promise<ImportServiceResult>;

  /**
   * Refresh/re-import data from GitHub
   */
  refreshGitHub(
    username: string,
    accessToken: string | undefined,
    userId: string
  ): Promise<ImportServiceResult>;
}

/**
 * LinkedIn import service interface (placeholder)
 */
export interface ILinkedInImportService {
  /**
   * Import data from LinkedIn
   * Currently a placeholder - returns "coming soon" status
   */
  importLinkedIn(accessToken: string, userId: string): Promise<ImportServiceResult>;

  /**
   * Check if LinkedIn import is available
   */
  isAvailable(): boolean;
}

/**
 * Manual links import service interface
 */
export interface ILinksImportService {
  /**
   * Validate and normalize manually added links
   */
  importLinks(
    links: Array<{ url: string; label?: string }>,
    userId: string
  ): Promise<ImportServiceResult>;

  /**
   * Auto-detect link type from URL
   */
  detectLinkType(url: string): string;
}

// ===========================================
// MERGE TYPES
// ===========================================

/**
 * Options for merging imported data
 */
export interface MergeOptions {
  /** How to handle conflicts */
  strategy: 'replace' | 'skip' | 'append' | 'manual';
  /** Protect fields edited by user */
  protectManualEdits: boolean;
  /** Remove duplicate entries */
  deduplicateEntries: boolean;
  /** Source of incoming data */
  incomingSource: DataSource;
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  success: boolean;
  fieldsUpdated: string[];
  fieldsSkipped: string[];
  itemsAdded: {
    experiences: number;
    projects: number;
    skills: number;
    educations: number;
    links: number;
  };
  conflicts: Array<{
    field: string;
    existingValue: unknown;
    incomingValue: unknown;
    resolution: 'kept_existing' | 'used_incoming' | 'appended' | 'needs_manual';
  }>;
}

// ===========================================
// JOB TYPES
// ===========================================

/**
 * Import job status for async processing
 */
export interface ImportJobStatus {
  id: string;
  source: DataSource;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  currentStep?: string;
  result?: NormalizedImportResult;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Create a new import job
 */
export interface CreateImportJob {
  userId: string;
  source: DataSource;
  inputType: 'file' | 'oauth' | 'text' | 'url';
  inputData?: unknown;
}
