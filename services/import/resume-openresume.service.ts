/**
 * Resume Import Service using OpenResume Parser
 *
 * Uses the OpenResume-style parser for robust PDF extraction.
 * Handles partial data gracefully - even if some fields are missing,
 * we save what we have so users can edit later.
 */

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { parseResumeFromPdfBuffer, type ParsedResume } from '@/lib/resume-parser';
import { parseDateFlexible } from '@/lib/utils';
import { LinkType, Prisma } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface NormalizedResumeData {
  profile: {
    firstName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
  };
  contactInfo?: {
    email?: string;
    phone?: string;
  };
  experiences: Array<{
    company: string;
    role: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    bullets?: string[];
  }>;
  educations: Array<{
    institution: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
  }>;
  projects: Array<{
    name: string;
    description?: string;
    url?: string;
    technologies?: string[];
    startDate?: string;
    endDate?: string;
  }>;
  skills: string[];
  links: Array<{
    type: string;
    url: string;
    label?: string;
  }>;
  certifications: Array<{
    name: string;
    issuer?: string;
    date?: string;
  }>;
  meta: {
    confidence: number;
    parseMethod: string;
    importedAt: Date;
  };
}

export interface ImportResult {
  success: boolean;
  data?: NormalizedResumeData;
  error?: string;
  message?: string;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Sanitize text - remove null bytes and control characters
 */
function sanitize(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  return (
    text
      .replace(/\0/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .trim() || undefined
  );
}

/**
 * Safely parse a date string, returning undefined if invalid
 */
function parseDateSafe(dateStr: string | undefined | null): Date | undefined {
  if (!dateStr) return undefined;
  // Use the shared flexible parser so month-precision dates are anchored to
  // UTC (timezone-invariant), matching how they are formatted on display.
  return parseDateFlexible(dateStr) ?? undefined;
}

/**
 * Map string link type to Prisma LinkType enum
 */
function mapLinkType(type: string): LinkType {
  const typeUpper = type?.toUpperCase() || 'OTHER';
  const validTypes: LinkType[] = [
    'GITHUB',
    'LINKEDIN',
    'TWITTER',
    'PORTFOLIO',
    'BLOG',
    'DRIBBBLE',
    'BEHANCE',
    'YOUTUBE',
    'OTHER',
  ];
  return validTypes.includes(typeUpper as LinkType) ? (typeUpper as LinkType) : LinkType.OTHER;
}

/**
 * Detect link type from URL
 */
function detectLinkType(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('linkedin.com')) return 'linkedin';
  if (lowerUrl.includes('github.com')) return 'github';
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'twitter';
  if (lowerUrl.includes('dribbble.com')) return 'dribbble';
  if (lowerUrl.includes('behance.net')) return 'behance';
  if (lowerUrl.includes('medium.com')) return 'medium';
  if (lowerUrl.includes('dev.to')) return 'devto';
  if (lowerUrl.includes('stackoverflow.com')) return 'stackoverflow';
  if (lowerUrl.includes('youtube.com')) return 'youtube';
  return 'website';
}

/**
 * Normalize link URL - ensure it starts with https://
 */
function normalizeUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

// ============================================================================
// MAIN NORMALIZATION
// ============================================================================

/**
 * Normalize parsed resume data into our application format.
 * Handles partial data gracefully - we include whatever is available.
 */
export function normalizeResumeData(parsed: ParsedResume): NormalizedResumeData {
  const normalized: NormalizedResumeData = {
    profile: {},
    experiences: [],
    educations: [],
    projects: [],
    skills: [],
    links: [],
    certifications: [],
    meta: {
      confidence: parsed.confidence,
      parseMethod: parsed.parseMethod,
      importedAt: new Date(),
    },
  };

  // Profile - include whatever we have
  if (parsed.firstName) normalized.profile.firstName = sanitize(parsed.firstName);
  if (parsed.lastName) normalized.profile.lastName = sanitize(parsed.lastName);
  if (parsed.headline) normalized.profile.headline = sanitize(parsed.headline);
  if (parsed.summary) normalized.profile.summary = sanitize(parsed.summary);
  if (parsed.location) normalized.profile.location = sanitize(parsed.location);

  // Contact info
  if (parsed.email || parsed.phone) {
    normalized.contactInfo = {
      email: sanitize(parsed.email),
      phone: sanitize(parsed.phone),
    };
  }

  // Work experiences - include even if partially complete
  for (const exp of parsed.workExperiences || []) {
    // Need at least a company OR title to be useful
    if (!exp.company && !exp.title) continue;

    normalized.experiences.push({
      company: sanitize(exp.company) || 'Unknown Company',
      role: sanitize(exp.title) || 'Unknown Role',
      location: sanitize(exp.location),
      startDate: sanitize(exp.startDate),
      endDate: sanitize(exp.endDate),
      isCurrent: exp.isCurrent,
      bullets: exp.description
        ?.split('\n')
        .map((b) => sanitize(b))
        .filter((b): b is string => !!b),
    });
  }

  // Educations - include even if partially complete
  for (const edu of parsed.educations || []) {
    // Need at least an institution OR degree to be useful
    if (!edu.institution && !edu.degree) continue;

    normalized.educations.push({
      institution: sanitize(edu.institution) || 'Unknown Institution',
      degree: sanitize(edu.degree),
      fieldOfStudy: sanitize(edu.field),
      startDate: sanitize(edu.startDate),
      endDate: sanitize(edu.endDate),
      gpa: sanitize(edu.gpa),
    });
  }

  // Projects - include even if partially complete
  for (const proj of parsed.projects || []) {
    // Need at least a name to be useful
    if (!proj.name) continue;

    normalized.projects.push({
      name: sanitize(proj.name) || 'Untitled Project',
      description: sanitize(proj.description),
      url: proj.url ? normalizeUrl(proj.url) : undefined,
      startDate: sanitize(proj.startDate),
      endDate: sanitize(proj.endDate),
    });
  }

  // Skills
  normalized.skills = (parsed.skills || [])
    .map((s) => sanitize(s))
    .filter((s): s is string => !!s && s.length > 0);

  // Links
  for (const link of parsed.links || []) {
    if (!link) continue;
    const url = normalizeUrl(link);
    normalized.links.push({
      type: detectLinkType(url),
      url,
      label: detectLinkType(url),
    });
  }

  // Certifications
  for (const cert of parsed.certifications || []) {
    if (!cert.name) continue;
    normalized.certifications.push({
      name: sanitize(cert.name) || 'Unknown Certification',
      issuer: sanitize(cert.issuer),
      date: sanitize(cert.date),
    });
  }

  return normalized;
}

// ============================================================================
// MAIN IMPORT FUNCTION
// ============================================================================

/**
 * Parse and import a resume PDF
 */
export async function importResumeFromPdf(buffer: Buffer, userId: string): Promise<ImportResult> {
  try {
    console.log('[Resume Import] Starting OpenResume parser...');

    // Parse the PDF
    const parsed = await parseResumeFromPdfBuffer(buffer);

    console.log('[Resume Import] Parsing complete, normalizing data...');

    // Normalize the data
    const normalized = normalizeResumeData(parsed);

    console.log('[Resume Import] Normalized data:');
    console.log(`  - Profile fields: ${Object.keys(normalized.profile).length}`);
    console.log(`  - Experiences: ${normalized.experiences.length}`);
    console.log(`  - Educations: ${normalized.educations.length}`);
    console.log(`  - Projects: ${normalized.projects.length}`);
    console.log(`  - Skills: ${normalized.skills.length}`);
    console.log(`  - Links: ${normalized.links.length}`);
    console.log(`  - Confidence: ${normalized.meta.confidence}`);

    // Store raw import data for debugging
    try {
      const context = await resolveActiveProfileContext(userId).catch(() => null);

      if (context?.profileId) {
        await db.rawImportPayload.create({
          data: {
            profileId: context.profileId,
            source: 'RESUME',
            rawData: {
              parsed: parsed as unknown as Prisma.InputJsonValue,
              normalized: normalized as unknown as Prisma.InputJsonValue,
            },
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        });
      }
    } catch (dbError) {
      console.error('[Resume Import] Failed to store raw data:', dbError);
      // Don't fail the import if we can't store debug data
    }

    return {
      success: true,
      data: normalized,
      message: `Resume parsed with ${Math.round(normalized.meta.confidence * 100)}% confidence`,
    };
  } catch (error) {
    console.error('[Resume Import] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse resume',
    };
  }
}

/**
 * Save imported resume data to user profile
 * Handles partial data - only updates fields that have values
 */
export async function saveResumeDataToProfile(
  userId: string,
  data: NormalizedResumeData
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    let profileId = (await resolveActiveProfileContext(userId).catch(() => null))?.profileId;
    if (!profileId) {
      const newProfile = await db.profile.create({
        data: {
          userId: user.id,
          resumeTitle: 'Imported Resume',
          handle: `user-${user.id.slice(0, 8)}`,
          firstName: data.profile.firstName,
          lastName: data.profile.lastName,
        },
      });

      await db.user.update({
        where: { id: user.id },
        data: {
          profile: {
            connect: { id: newProfile.id },
          },
        },
      });

      profileId = newProfile.id;
    }

    // Update profile with available data
    const profileUpdate: Prisma.ProfileUpdateInput = {};
    if (data.profile.firstName) {
      profileUpdate.firstName = data.profile.firstName;
      profileUpdate.firstNameSource = 'RESUME';
    }
    if (data.profile.lastName) {
      profileUpdate.lastName = data.profile.lastName;
      profileUpdate.lastNameSource = 'RESUME';
    }
    if (data.profile.headline) {
      profileUpdate.headline = data.profile.headline;
      profileUpdate.headlineSource = 'RESUME';
    }
    if (data.profile.summary) {
      profileUpdate.summary = data.profile.summary;
      profileUpdate.summarySource = 'RESUME';
    }
    if (data.profile.location) {
      profileUpdate.location = data.profile.location;
      profileUpdate.locationSource = 'RESUME';
    }

    // Only update profile if we have something to update
    if (Object.keys(profileUpdate).length > 0) {
      await db.profile.update({
        where: { id: profileId },
        data: profileUpdate,
      });
    }

    // Update or create contact info
    if (data.contactInfo?.email || data.contactInfo?.phone) {
      await db.contactInfo.upsert({
        where: { profileId },
        create: {
          profileId,
          email: data.contactInfo.email,
          emailSource: 'RESUME',
          phone: data.contactInfo.phone,
          phoneSource: 'RESUME',
        },
        update: {
          ...(data.contactInfo.email && {
            email: data.contactInfo.email,
            emailSource: 'RESUME' as const,
          }),
          ...(data.contactInfo.phone && {
            phone: data.contactInfo.phone,
            phoneSource: 'RESUME' as const,
          }),
        },
      });
    }

    // Add work experiences - even partial ones
    for (const exp of data.experiences) {
      await db.workExperience.create({
        data: {
          profileId,
          company: exp.company,
          role: exp.role,
          location: exp.location,
          startDate: parseDateSafe(exp.startDate) || new Date(),
          endDate: parseDateSafe(exp.endDate),
          isCurrent: exp.isCurrent || false,
          bullets: exp.bullets || [],
          source: 'RESUME',
        },
      });
    }

    // Add educations - even partial ones
    for (const edu of data.educations) {
      await db.education.create({
        data: {
          profileId,
          institution: edu.institution,
          degree: edu.degree,
          fieldOfStudy: edu.fieldOfStudy,
          startDate: parseDateSafe(edu.startDate),
          endDate: parseDateSafe(edu.endDate),
          gpa: edu.gpa,
          source: 'RESUME',
        },
      });
    }

    // Add projects - even partial ones
    for (const proj of data.projects) {
      await db.project.create({
        data: {
          profileId,
          title: proj.name,
          description: proj.description,
          url: proj.url,
          techStack: proj.technologies || [],
          startDate: parseDateSafe(proj.startDate),
          endDate: parseDateSafe(proj.endDate),
          source: 'RESUME',
        },
      });
    }

    // Add skills
    for (const skillName of data.skills) {
      // Check if skill already exists
      const existing = await db.skill.findFirst({
        where: { profileId, name: skillName },
      });
      if (!existing) {
        await db.skill.create({
          data: {
            profileId,
            name: skillName,
            source: 'RESUME',
          },
        });
      }
    }

    // Add links
    for (const link of data.links) {
      // Check if link already exists
      const existing = await db.link.findFirst({
        where: { profileId, url: link.url },
      });
      if (!existing) {
        const linkType = mapLinkType(link.type);
        await db.link.create({
          data: {
            profileId,
            type: linkType,
            url: link.url,
            label: link.label,
            source: 'RESUME',
          },
        });
      }
    }

    // Add certifications
    for (const cert of data.certifications) {
      await db.certification.create({
        data: {
          profileId,
          name: cert.name,
          issuer: cert.issuer || 'Unknown',
          issueDate: parseDateSafe(cert.date),
          source: 'RESUME',
        },
      });
    }

    console.log('[Resume Import] Data saved to profile successfully');
    return { success: true };
  } catch (error) {
    console.error('[Resume Import] Error saving to profile:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save data',
    };
  }
}
