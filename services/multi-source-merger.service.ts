/**
 * Multi-Source Data Merger Service
 *
 * Handles merging of data from multiple sources (Signup, Resume, LinkedIn, GitHub, Google)
 * with proper precedence rules and deduplication.
 *
 * Precedence Rules:
 * - For name: Signup > Resume > Google > LinkedIn > GitHub
 *   Note: "Signup" name only exists when user signs up via OAuth (Google, etc.)
 *   For manual email signup, firstName/lastName are empty, so Resume wins.
 * - For email: Signup as primary, all others collected as additionalEmails
 * - For phone: Resume > LinkedIn > GitHub
 * - For other profile fields: Resume > Google > LinkedIn > GitHub (first non-empty wins)
 */

import type { DataSource } from '@prisma/client';

// Source priority (higher = more authoritative)
// NOTE: Must match SOURCE_PRIORITY in merge.service.ts for shared DataSource values
export const SOURCE_PRIORITY: Record<string, number> = {
  SIGNUP: 100, // Highest: user explicitly entered at signup
  MANUAL: 95, // User manually edited (slightly lower than SIGNUP to avoid conflict with merge.service)
  RESUME: 80,
  GOOGLE: 75, // Google provides reliable data
  LINKEDIN: 70,
  GITHUB: 60,
  GENERATED: 50,
  MEDIUM: 45,
  YOUTUBE: 45,
  BLOG: 45,
};

/**
 * Check if a new source should override the current source based on priority.
 * Returns true if:
 * - There is no current value (currentValue is empty/null/undefined)
 * - The new source has higher or equal priority than the current source
 *
 * @param currentSource - The source of the current value (e.g., 'GITHUB', 'LINKEDIN')
 * @param newSource - The source of the new value
 * @param currentValue - The current value (optional, to check if empty)
 * @returns true if the new source should override
 */
export function shouldOverrideSource(
  currentSource: string | null | undefined,
  newSource: string,
  currentValue?: string | null
): boolean {
  // If there's no current value, always allow the update
  if (!currentValue) {
    return true;
  }

  // If there's no current source tracked, allow if we have a value to set
  if (!currentSource) {
    return true;
  }

  const currentPriority = SOURCE_PRIORITY[currentSource.toUpperCase()] || 0;
  const newPriority = SOURCE_PRIORITY[newSource.toUpperCase()] || 0;

  // Allow override if new source has higher or equal priority
  return newPriority >= currentPriority;
}

export type ImportSourceKey = 'signup' | 'resume' | 'linkedin' | 'github' | 'google';

/**
 * Email entry with source tracking
 */
export interface EmailEntry {
  email: string;
  source: DataSource | string;
  isPrimary?: boolean;
}

/**
 * Phone entry with source tracking
 */
export interface PhoneEntry {
  phone: string;
  source: DataSource | string;
}

/**
 * Name entry with source tracking
 */
export interface NameEntry {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  source: DataSource | string;
}

/**
 * Result of multi-source name resolution
 */
export interface ResolvedName {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  source: DataSource | string;
}

/**
 * Result of multi-source email resolution
 */
export interface ResolvedEmails {
  primaryEmail: string;
  primaryEmailSource: DataSource | string;
  additionalEmails: Array<{ email: string; source: string }>;
}

/**
 * Profile data from a single source
 */
export interface SourceProfileData {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  location?: string;
  avatarUrl?: string;
}

/**
 * Contact info from a single source
 */
export interface SourceContactData {
  email?: string;
  phone?: string;
  website?: string;
}

/**
 * Complete data from a source
 */
export interface SourceData {
  source: ImportSourceKey | DataSource | string;
  profile?: SourceProfileData;
  contactInfo?: SourceContactData;
}

/**
 * Resolve name from multiple sources with precedence:
 * Signup > Resume > LinkedIn > GitHub
 */
export function resolveName(sources: NameEntry[]): ResolvedName {
  // Sort by priority (highest first)
  const sorted = [...sources]
    .filter((s) => s.firstName || s.middleName || s.lastName)
    .sort((a, b) => {
      const priorityA = SOURCE_PRIORITY[a.source.toUpperCase()] || 0;
      const priorityB = SOURCE_PRIORITY[b.source.toUpperCase()] || 0;
      return priorityB - priorityA;
    });

  if (sorted.length === 0) {
    return { source: 'MANUAL' };
  }

  // Take the highest priority source that has a name
  const winner = sorted[0];
  return {
    firstName: winner.firstName,
    middleName: winner.middleName,
    lastName: winner.lastName,
    source: winner.source,
  };
}

/**
 * Resolve emails from multiple sources:
 * - Signup email is ALWAYS primary
 * - All other unique emails go to additionalEmails
 */
export function resolveEmails(signupEmail: string, sourceEmails: EmailEntry[]): ResolvedEmails {
  const additionalEmails: Array<{ email: string; source: string }> = [];
  const seenEmails = new Set<string>();

  // Signup email is always primary and tracked
  seenEmails.add(signupEmail.toLowerCase());

  // Collect all unique emails from other sources
  for (const entry of sourceEmails) {
    if (!entry.email) continue;

    const normalizedEmail = entry.email.toLowerCase().trim();

    // Skip if it's the same as signup email or already seen
    if (seenEmails.has(normalizedEmail)) continue;

    seenEmails.add(normalizedEmail);
    additionalEmails.push({
      email: entry.email, // Keep original case
      source: String(entry.source).toUpperCase(),
    });
  }

  return {
    primaryEmail: signupEmail,
    primaryEmailSource: 'MANUAL', // Signup = MANUAL source
    additionalEmails,
  };
}

/**
 * Resolve phone from multiple sources with precedence:
 * Resume > LinkedIn > GitHub
 */
export function resolvePhone(sources: PhoneEntry[]): PhoneEntry | null {
  // Sort by priority (highest first)
  const sorted = [...sources]
    .filter((s) => s.phone && s.phone.trim())
    .sort((a, b) => {
      const priorityA = SOURCE_PRIORITY[a.source.toUpperCase()] || 0;
      const priorityB = SOURCE_PRIORITY[b.source.toUpperCase()] || 0;
      return priorityB - priorityA;
    });

  return sorted.length > 0 ? sorted[0] : null;
}

/**
 * Resolve a single field from multiple sources
 * Takes the first non-empty value based on priority
 */
export function resolveField<T>(sources: Array<{ value: T | null | undefined; source: string }>): {
  value: T | undefined;
  source: string;
} {
  const sorted = [...sources]
    .filter((s) => s.value !== null && s.value !== undefined && s.value !== '')
    .sort((a, b) => {
      const priorityA = SOURCE_PRIORITY[a.source.toUpperCase()] || 0;
      const priorityB = SOURCE_PRIORITY[b.source.toUpperCase()] || 0;
      return priorityB - priorityA;
    });

  if (sorted.length === 0) {
    return { value: undefined, source: 'MANUAL' };
  }

  return { value: sorted[0].value!, source: sorted[0].source };
}

/**
 * Merge profile data from multiple sources
 */
export function mergeProfileFromSources(
  sources: SourceData[],
  signupData?: { firstName?: string; middleName?: string; lastName?: string; email: string }
): {
  profile: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
    avatarUrl?: string;
    firstNameSource: string;
    middleNameSource: string;
    lastNameSource: string;
    headlineSource: string;
    summarySource: string;
    locationSource: string;
    avatarUrlSource: string;
  };
  emails: ResolvedEmails;
  phone?: { phone: string; countryCode?: string | null; number?: string; source: string };
  website?: { website: string; source: string };
} {
  // Build name entries
  const nameEntries: NameEntry[] = [];

  // Add signup name if provided (highest priority)
  if (signupData?.firstName || signupData?.middleName || signupData?.lastName) {
    nameEntries.push({
      firstName: signupData.firstName,
      middleName: signupData.middleName,
      lastName: signupData.lastName,
      source: 'SIGNUP',
    });
  }

  // Add names from other sources
  for (const source of sources) {
    if (source.profile?.firstName || source.profile?.middleName || source.profile?.lastName) {
      nameEntries.push({
        firstName: source.profile.firstName,
        middleName: source.profile.middleName,
        lastName: source.profile.lastName,
        source: String(source.source).toUpperCase(),
      });
    }
  }

  // Resolve name
  const resolvedName = resolveName(nameEntries);

  // Build email entries
  const emailEntries: EmailEntry[] = [];
  for (const source of sources) {
    if (source.contactInfo?.email) {
      emailEntries.push({
        email: source.contactInfo.email,
        source: String(source.source).toUpperCase(),
      });
    }
  }

  // Resolve emails (signup email is always primary)
  const resolvedEmails = resolveEmails(signupData?.email || '', emailEntries);

  // Build phone entries
  const phoneEntries: PhoneEntry[] = [];
  for (const source of sources) {
    if (source.contactInfo?.phone) {
      phoneEntries.push({
        phone: source.contactInfo.phone,
        source: String(source.source).toUpperCase(),
      });
    }
  }

  // Resolve phone
  const resolvedPhone = resolvePhone(phoneEntries);

  // Resolve other profile fields
  const headlineResult = resolveField(
    sources.map((s) => ({ value: s.profile?.headline, source: String(s.source) }))
  );
  const summaryResult = resolveField(
    sources.map((s) => ({ value: s.profile?.summary, source: String(s.source) }))
  );
  const locationResult = resolveField(
    sources.map((s) => ({ value: s.profile?.location, source: String(s.source) }))
  );
  const avatarUrlResult = resolveField(
    sources.map((s) => ({ value: s.profile?.avatarUrl, source: String(s.source) }))
  );
  const websiteResult = resolveField(
    sources.map((s) => ({ value: s.contactInfo?.website, source: String(s.source) }))
  );

  return {
    profile: {
      firstName: resolvedName.firstName,
      middleName: resolvedName.middleName,
      lastName: resolvedName.lastName,
      headline: headlineResult.value,
      summary: summaryResult.value,
      location: locationResult.value,
      avatarUrl: avatarUrlResult.value,
      firstNameSource: String(resolvedName.source).toUpperCase(),
      middleNameSource: String(resolvedName.source).toUpperCase(),
      lastNameSource: String(resolvedName.source).toUpperCase(),
      headlineSource: headlineResult.source.toUpperCase(),
      summarySource: summaryResult.source.toUpperCase(),
      locationSource: locationResult.source.toUpperCase(),
      avatarUrlSource: avatarUrlResult.source.toUpperCase(),
    },
    emails: resolvedEmails,
    phone: resolvedPhone
      ? { phone: resolvedPhone.phone, source: resolvedPhone.source.toUpperCase() }
      : undefined,
    website: websiteResult.value
      ? { website: websiteResult.value, source: websiteResult.source.toUpperCase() }
      : undefined,
  };
}

/**
 * Collect all unique emails from imported data
 * Used during onboarding to gather emails from all sources
 */
export function collectAllEmails(
  signupEmail: string,
  importedData: Record<string, unknown>
): ResolvedEmails {
  const emailEntries: EmailEntry[] = [];

  // Process resume data
  const resumeData = importedData.resume as Record<string, unknown> | undefined;
  if (resumeData) {
    const contactInfo = resumeData.contactInfo as Record<string, unknown> | undefined;
    if (contactInfo?.email) {
      emailEntries.push({
        email: contactInfo.email as string,
        source: 'RESUME',
      });
    }
  }

  // Process LinkedIn data
  const linkedinData = importedData.linkedin as Record<string, unknown> | undefined;
  if (linkedinData) {
    // LinkedIn can have email at different places
    const contactInfo = linkedinData.contactInfo as Record<string, unknown> | undefined;
    if (contactInfo?.email) {
      emailEntries.push({
        email: contactInfo.email as string,
        source: 'LINKEDIN',
      });
    }
    // Also check root level email (from OAuth)
    if (linkedinData.email && typeof linkedinData.email === 'string') {
      emailEntries.push({
        email: linkedinData.email,
        source: 'LINKEDIN',
      });
    }
  }

  // Process GitHub data
  const githubData = importedData.github as Record<string, unknown> | undefined;
  if (githubData) {
    const contactInfo = githubData.contactInfo as Record<string, unknown> | undefined;
    if (contactInfo?.email) {
      emailEntries.push({
        email: contactInfo.email as string,
        source: 'GITHUB',
      });
    }
    // Also check root level email
    if (githubData.email && typeof githubData.email === 'string') {
      emailEntries.push({
        email: githubData.email,
        source: 'GITHUB',
      });
    }
  }

  return resolveEmails(signupEmail, emailEntries);
}

/**
 * Collect all unique phones from imported data
 */
export function collectAllPhones(importedData: Record<string, unknown>): PhoneEntry | null {
  const phoneEntries: PhoneEntry[] = [];

  // Process resume data
  const resumeData = importedData.resume as Record<string, unknown> | undefined;
  if (resumeData) {
    const contactInfo = resumeData.contactInfo as Record<string, unknown> | undefined;
    if (contactInfo?.phone) {
      phoneEntries.push({
        phone: contactInfo.phone as string,
        source: 'RESUME',
      });
    }
  }

  // Process LinkedIn data (rarely has phone)
  const linkedinData = importedData.linkedin as Record<string, unknown> | undefined;
  if (linkedinData) {
    const contactInfo = linkedinData.contactInfo as Record<string, unknown> | undefined;
    if (contactInfo?.phone) {
      phoneEntries.push({
        phone: contactInfo.phone as string,
        source: 'LINKEDIN',
      });
    }
  }

  return resolvePhone(phoneEntries);
}

/**
 * Resolve signup name from Clerk user data
 */
export function getSignupName(clerkUser: {
  firstName?: string | null;
  lastName?: string | null;
}): { firstName?: string; lastName?: string } | null {
  const firstName = clerkUser.firstName || undefined;
  const lastName = clerkUser.lastName || undefined;

  if (!firstName && !lastName) {
    return null;
  }

  return { firstName, lastName };
}
