/**
 * Data Merge Service
 *
 * Implements conflict resolution strategies for merging data from multiple sources.
 * Supports manual, resume import, GitHub, LinkedIn, and API sources with configurable
 * priority rules.
 */

import type { DataSource } from '@prisma/client';

import { logger } from '@/lib/logger';

const mergeLogger = logger.child({ source: 'merge-service' });

// Priority order for data sources (higher = more authoritative)
// NOTE: Must match SOURCE_PRIORITY in multi-source-merger.service.ts
const SOURCE_PRIORITY: Record<DataSource, number> = {
  MANUAL: 100, // User edits always win
  RESUME: 80,
  GOOGLE: 75, // Google provides reliable data
  LINKEDIN: 70,
  GITHUB: 60,
  GENERATED: 50,
  MEDIUM: 45,
  YOUTUBE: 45,
  BLOG: 45,
};

// Fields that should never be auto-overwritten
const PROTECTED_FIELDS = ['handle', 'userId', 'id', 'createdAt'];

// Fields where we prefer to append rather than replace
const APPENDABLE_FIELDS = [
  'skills',
  'workExperiences',
  'educations',
  'projects',
  'links',
  'certifications',
  'awards',
];

export type MergeStrategy = 'replace' | 'skip' | 'append' | 'manual';

export interface MergeOptions {
  strategy: MergeStrategy;
  protectManualEdits: boolean;
  deduplicateEntries: boolean;
}

export interface MergeResult<T> {
  merged: T;
  conflicts: MergeConflict[];
  applied: number;
  skipped: number;
}

export interface MergeConflict {
  field: string;
  existingValue: unknown;
  incomingValue: unknown;
  existingSource: DataSource;
  incomingSource: DataSource;
  resolution: 'kept_existing' | 'used_incoming' | 'appended' | 'needs_manual';
}

/**
 * Compare two data sources and determine which should take precedence
 */
export function compareSourcePriority(
  existingSource: DataSource,
  incomingSource: DataSource
): 'existing' | 'incoming' | 'equal' {
  const existingPriority = SOURCE_PRIORITY[existingSource] || 0;
  const incomingPriority = SOURCE_PRIORITY[incomingSource] || 0;

  if (existingPriority > incomingPriority) return 'existing';
  if (incomingPriority > existingPriority) return 'incoming';
  return 'equal';
}

/**
 * Check if two items are duplicates based on key fields
 */
function isDuplicate<T extends Record<string, unknown>>(
  item1: T,
  item2: T,
  keys: (keyof T)[]
): boolean {
  return keys.every((key) => {
    const v1 = item1[key];
    const v2 = item2[key];

    if (typeof v1 === 'string' && typeof v2 === 'string') {
      return v1.toLowerCase().trim() === v2.toLowerCase().trim();
    }
    return v1 === v2;
  });
}

/**
 * Deduplicate an array of items based on key fields
 */
function deduplicateArray<T extends Record<string, unknown>>(items: T[], keys: (keyof T)[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keys
      .map((k) =>
        String(item[k] || '')
          .toLowerCase()
          .trim()
      )
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Merge two scalar values based on source priority
 */
function mergeScalarValue<T>(
  existing: T | null | undefined,
  incoming: T | null | undefined,
  existingSource: DataSource,
  incomingSource: DataSource,
  options: MergeOptions
): { value: T | null | undefined; conflict?: MergeConflict } {
  // If incoming is empty, keep existing
  if (incoming === null || incoming === undefined || incoming === '') {
    return { value: existing };
  }

  // If existing is empty, use incoming
  if (existing === null || existing === undefined || existing === '') {
    return { value: incoming };
  }

  // Both have values - compare priorities
  const priority = compareSourcePriority(existingSource, incomingSource);

  if (options.protectManualEdits && existingSource === 'MANUAL') {
    return {
      value: existing,
      conflict: {
        field: '',
        existingValue: existing,
        incomingValue: incoming,
        existingSource,
        incomingSource,
        resolution: 'kept_existing',
      },
    };
  }

  if (options.strategy === 'skip') {
    return {
      value: existing,
      conflict: {
        field: '',
        existingValue: existing,
        incomingValue: incoming,
        existingSource,
        incomingSource,
        resolution: 'kept_existing',
      },
    };
  }

  if (options.strategy === 'replace' || priority === 'incoming') {
    return {
      value: incoming,
      conflict: {
        field: '',
        existingValue: existing,
        incomingValue: incoming,
        existingSource,
        incomingSource,
        resolution: 'used_incoming',
      },
    };
  }

  return { value: existing };
}

/**
 * Merge profile data from multiple sources
 */
export function mergeProfileData<T extends Record<string, unknown>>(
  existing: T,
  incoming: Partial<T>,
  incomingSource: DataSource,
  options: MergeOptions = {
    strategy: 'replace',
    protectManualEdits: true,
    deduplicateEntries: true,
  }
): MergeResult<T> {
  const conflicts: MergeConflict[] = [];
  let applied = 0;
  let skipped = 0;

  const merged = { ...existing };
  const existingSource = (existing as { source?: DataSource }).source || 'MANUAL';

  for (const [key, incomingValue] of Object.entries(incoming)) {
    // Skip protected fields
    if (PROTECTED_FIELDS.includes(key)) {
      skipped++;
      continue;
    }

    const existingValue = existing[key as keyof T];

    // Handle array fields (appendable)
    if (APPENDABLE_FIELDS.includes(key) && Array.isArray(incomingValue)) {
      if (options.strategy === 'append' && Array.isArray(existingValue)) {
        let combined = [...existingValue, ...incomingValue];

        // Deduplicate based on field type
        if (options.deduplicateEntries) {
          if (key === 'skills') {
            combined = deduplicateArray(combined as Record<string, unknown>[], ['name']);
          } else if (key === 'workExperiences') {
            combined = deduplicateArray(combined as Record<string, unknown>[], ['company', 'role']);
          } else if (key === 'educations') {
            combined = deduplicateArray(combined as Record<string, unknown>[], [
              'institution',
              'degree',
            ]);
          } else if (key === 'links') {
            combined = deduplicateArray(combined as Record<string, unknown>[], ['url']);
          } else if (key === 'projects') {
            combined = deduplicateArray(combined as Record<string, unknown>[], [
              'title',
              'repoUrl',
            ]);
          }
        }

        (merged as Record<string, unknown>)[key] = combined;
        applied++;
        conflicts.push({
          field: key,
          existingValue: existingValue,
          incomingValue: incomingValue,
          existingSource,
          incomingSource,
          resolution: 'appended',
        });
      } else {
        // Replace array
        (merged as Record<string, unknown>)[key] = incomingValue;
        applied++;
      }
      continue;
    }

    // Handle scalar fields
    const result = mergeScalarValue(
      existingValue as unknown,
      incomingValue as unknown,
      existingSource,
      incomingSource,
      options
    );

    (merged as Record<string, unknown>)[key] = result.value;

    if (result.conflict) {
      result.conflict.field = key;
      conflicts.push(result.conflict);

      if (result.conflict.resolution === 'kept_existing') {
        skipped++;
      } else {
        applied++;
      }
    } else if (result.value !== existingValue) {
      applied++;
    }
  }

  return { merged, conflicts, applied, skipped };
}

/**
 * Merge work experiences with smart deduplication.
 * Uses 'company' and 'role' fields (matching the Prisma WorkExperience model).
 */
export function mergeWorkExperiences<
  T extends { company: string; role: string; startDate?: Date | null },
>(existing: T[], incoming: T[], options: { deduplicateByCompanyRole?: boolean } = {}): T[] {
  const { deduplicateByCompanyRole = true } = options;

  if (!deduplicateByCompanyRole) {
    return [...existing, ...incoming];
  }

  const existingKeys = new Set(
    existing.map((e) => `${e.company.toLowerCase()}-${e.role.toLowerCase()}`)
  );

  const newItems = incoming.filter((item) => {
    const key = `${item.company.toLowerCase()}-${item.role.toLowerCase()}`;
    return !existingKeys.has(key);
  });

  return [...existing, ...newItems];
}

/**
 * Merge skills with smart deduplication
 */
export function mergeSkills<T extends { name: string }>(existing: T[], incoming: T[]): T[] {
  const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));
  const newSkills = incoming.filter((s) => !existingNames.has(s.name.toLowerCase()));
  return [...existing, ...newSkills];
}

/**
 * Generate a merge preview without applying changes
 */
export function previewMerge<T extends Record<string, unknown>>(
  existing: T,
  incoming: Partial<T>,
  incomingSource: DataSource
): { field: string; current: unknown; proposed: unknown; action: string }[] {
  const preview: { field: string; current: unknown; proposed: unknown; action: string }[] = [];

  for (const [key, incomingValue] of Object.entries(incoming)) {
    if (PROTECTED_FIELDS.includes(key)) continue;

    const existingValue = existing[key as keyof T];

    if (existingValue === incomingValue) continue;
    if (incomingValue === null || incomingValue === undefined) continue;

    let action = 'replace';
    if (APPENDABLE_FIELDS.includes(key)) action = 'append';
    if (existingValue === null || existingValue === undefined) action = 'set';

    preview.push({
      field: key,
      current: existingValue,
      proposed: incomingValue,
      action,
    });
  }

  return preview;
}
