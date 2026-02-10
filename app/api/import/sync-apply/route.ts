import { db } from '@/lib/db';
import { parseDateFlexible } from '@/lib/utils';
import { auth } from '@clerk/nextjs/server';
import type { DataSource, LinkType } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/import/sync-apply
 *
 * Apply imported data to an existing profile, respecting source priority.
 * - MANUAL edits are NEVER overwritten (highest priority)
 * - Resume data overwrites GitHub/LinkedIn data
 * - New items (experiences, skills, etc.) are appended
 * - Duplicate items are detected and skipped
 *
 * This is used by the Import & Sync page in the builder (post-onboarding).
 */

const VALID_DATA_SOURCES: DataSource[] = ['MANUAL', 'GITHUB', 'RESUME', 'LINKEDIN', 'GENERATED'];
const toDataSource = (source: string | undefined): DataSource => {
  const normalized = source?.toUpperCase();
  if (normalized && VALID_DATA_SOURCES.includes(normalized as DataSource)) {
    return normalized as DataSource;
  }
  return 'MANUAL';
};

const SOURCE_PRIORITY: Record<string, number> = {
  MANUAL: 100,
  RESUME: 80,
  LINKEDIN: 70,
  GITHUB: 60,
  GENERATED: 50,
};

function shouldOverride(existingSource: DataSource, incomingSource: DataSource): boolean {
  const existingPriority = SOURCE_PRIORITY[existingSource] || 0;
  const incomingPriority = SOURCE_PRIORITY[incomingSource] || 0;
  // Only override if incoming has HIGHER priority (not equal - to protect manual edits)
  return incomingPriority > existingPriority;
}

const safeParseDate = (dateStr: string | undefined | null): Date | null => {
  return parseDateFlexible(dateStr);
};

interface SyncProfileData {
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  location?: string;
  avatarUrl?: string;
}

interface SyncExperience {
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  bullets?: string[];
  /** When updating an existing record, the ID of the record to update */
  existingId?: string;
}

interface SyncEducation {
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  existingId?: string;
}

interface SyncProject {
  title: string;
  description?: string;
  technologies?: string[];
  repoUrl?: string;
  liveUrl?: string;
  ghStars?: number;
  ghForks?: number;
  ghLanguage?: string;
  ghPinned?: boolean;
  ghTopics?: string[];
  ghOwner?: string;
  ghRepo?: string;
  existingId?: string;
}

interface SyncRequestBody {
  source: 'RESUME' | 'GITHUB' | 'LINKEDIN';
  profile?: SyncProfileData;
  experiences?: SyncExperience[];
  educations?: SyncEducation[];
  skills?: string[];
  projects?: SyncProject[];
  links?: Array<{ type: string; url: string; label?: string }>;
  contactInfo?: {
    email?: string;
    phone?: string;
    website?: string;
  };
  /** When provided, these profile fields bypass source-priority checks.
   *  Used by the review wizard — the user explicitly chose to accept these values. */
  forceFields?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: SyncRequestBody = await request.json();
    const {
      source: rawSource,
      profile: incomingProfile,
      experiences,
      educations,
      skills,
      projects,
      links,
      contactInfo,
      forceFields,
    } = body;

    if (!rawSource) {
      return NextResponse.json({ error: 'Source is required' }, { status: 400 });
    }

    const source = toDataSource(rawSource);

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        profile: {
          include: {
            contactInfo: true,
            workExperiences: true,
            educations: true,
            skills: true,
            projects: true,
            links: true,
          },
        },
      },
    });

    if (!user?.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const existingProfile = user.profile;
    const results = {
      profileFieldsUpdated: [] as string[],
      profileFieldsSkipped: [] as string[],
      experiencesAdded: 0,
      experiencesUpdated: 0,
      experiencesSkipped: 0,
      educationsAdded: 0,
      educationsUpdated: 0,
      educationsSkipped: 0,
      skillsAdded: 0,
      skillsSkipped: 0,
      projectsAdded: 0,
      projectsUpdated: 0,
      projectsSkipped: 0,
      linksAdded: 0,
      linksSkipped: 0,
    };

    // --- Update profile fields (only if incoming has higher priority) ---
    if (incomingProfile) {
      const profileUpdates: Record<string, unknown> = {};

      const fieldMappings: Array<{
        field: keyof SyncProfileData;
        sourceField: string;
      }> = [
        { field: 'firstName', sourceField: 'firstNameSource' },
        { field: 'lastName', sourceField: 'lastNameSource' },
        { field: 'headline', sourceField: 'headlineSource' },
        { field: 'summary', sourceField: 'summarySource' },
        { field: 'location', sourceField: 'locationSource' },
      ];

      for (const { field, sourceField } of fieldMappings) {
        const incomingValue = incomingProfile[field];
        if (!incomingValue) continue;

        const existingSource = (existingProfile as Record<string, unknown>)[
          sourceField
        ] as DataSource;

        if (!existingProfile[field as keyof typeof existingProfile]) {
          // Field is empty - always fill it
          profileUpdates[field] = incomingValue;
          profileUpdates[sourceField] = source;
          results.profileFieldsUpdated.push(field);
        } else if (forceFields?.includes(field)) {
          // User explicitly chose this value in the review wizard — always write it
          profileUpdates[field] = incomingValue;
          profileUpdates[sourceField] = source;
          results.profileFieldsUpdated.push(field);
        } else if (shouldOverride(existingSource, source)) {
          // Incoming has higher priority - override
          profileUpdates[field] = incomingValue;
          profileUpdates[sourceField] = source;
          results.profileFieldsUpdated.push(field);
        } else {
          results.profileFieldsSkipped.push(field);
        }
      }

      if (Object.keys(profileUpdates).length > 0) {
        await db.profile.update({
          where: { id: existingProfile.id },
          data: profileUpdates,
        });
      }
    }

    // --- Append new / update existing experiences ---
    if (experiences?.length) {
      const existingExps = existingProfile.workExperiences;
      const maxSortOrder =
        existingExps.length > 0 ? Math.max(...existingExps.map((e) => e.sortOrder)) : -1;
      let nextSort = maxSortOrder + 1;

      for (const exp of experiences) {
        // Skip entries missing required fields
        if (!exp.company && !exp.role) continue;

        // If existingId is provided, this is an update to an existing record
        if (exp.existingId) {
          const existingRecord = existingExps.find((e) => e.id === exp.existingId);
          if (existingRecord) {
            await db.workExperience.update({
              where: { id: exp.existingId },
              data: {
                company: exp.company,
                role: exp.role,
                location: exp.location || existingRecord.location,
                startDate: safeParseDate(exp.startDate) || existingRecord.startDate,
                endDate: exp.isCurrent
                  ? null
                  : (safeParseDate(exp.endDate) ?? existingRecord.endDate),
                isCurrent: exp.isCurrent ?? existingRecord.isCurrent,
                description: exp.description ?? existingRecord.description,
                bullets:
                  exp.bullets && exp.bullets.length > 0 ? exp.bullets : existingRecord.bullets,
                source,
              },
            });
            results.experiencesUpdated++;
            continue;
          }
        }

        const isDuplicate = existingExps.some(
          (e) =>
            (e.company || '').toLowerCase().trim() === (exp.company || '').toLowerCase().trim() &&
            (e.role || '').toLowerCase().trim() === (exp.role || '').toLowerCase().trim()
        );

        if (!isDuplicate) {
          await db.workExperience.create({
            data: {
              profileId: existingProfile.id,
              company: exp.company,
              role: exp.role,
              location: exp.location || null,
              startDate: safeParseDate(exp.startDate) || new Date(),
              endDate: exp.isCurrent ? null : safeParseDate(exp.endDate),
              isCurrent: exp.isCurrent || false,
              description: exp.description || null,
              bullets: exp.bullets || [],
              source,
              sortOrder: nextSort++,
            },
          });
          results.experiencesAdded++;
        } else {
          results.experiencesSkipped++;
        }
      }
    }

    // --- Append new / update existing educations ---
    if (educations?.length) {
      const existingEdus = existingProfile.educations;
      const maxSortOrder =
        existingEdus.length > 0 ? Math.max(...existingEdus.map((e) => e.sortOrder)) : -1;
      let nextSort = maxSortOrder + 1;

      for (const edu of educations) {
        // Skip entries missing required fields
        if (!edu.institution) continue;

        // If existingId is provided, this is an update to an existing record
        if (edu.existingId) {
          const existingRecord = existingEdus.find((e) => e.id === edu.existingId);
          if (existingRecord) {
            await db.education.update({
              where: { id: edu.existingId },
              data: {
                institution: edu.institution,
                degree: edu.degree ?? existingRecord.degree,
                fieldOfStudy: edu.fieldOfStudy ?? existingRecord.fieldOfStudy,
                startDate: safeParseDate(edu.startDate) || existingRecord.startDate,
                endDate: safeParseDate(edu.endDate) ?? existingRecord.endDate,
                gpa: edu.gpa ?? existingRecord.gpa,
                source,
              },
            });
            results.educationsUpdated++;
            continue;
          }
        }

        const isDuplicate = existingEdus.some(
          (e) =>
            (e.institution || '').toLowerCase().trim() ===
              (edu.institution || '').toLowerCase().trim() &&
            (e.degree || '').toLowerCase().trim() === (edu.degree || '').toLowerCase().trim()
        );

        if (!isDuplicate) {
          await db.education.create({
            data: {
              profileId: existingProfile.id,
              institution: edu.institution,
              degree: edu.degree || null,
              fieldOfStudy: edu.fieldOfStudy || null,
              startDate: safeParseDate(edu.startDate),
              endDate: safeParseDate(edu.endDate),
              gpa: edu.gpa || null,
              source,
              sortOrder: nextSort++,
            },
          });
          results.educationsAdded++;
        } else {
          results.educationsSkipped++;
        }
      }
    }

    // --- Append new skills (deduplicate by name) ---
    if (skills?.length) {
      const existingSkillNames = new Set(
        existingProfile.skills.map((s) => s.name.toLowerCase().trim())
      );
      const maxSortOrder =
        existingProfile.skills.length > 0
          ? Math.max(...existingProfile.skills.map((s) => s.sortOrder))
          : -1;
      let nextSort = maxSortOrder + 1;

      const newSkills = skills.filter((s) => !existingSkillNames.has(s.toLowerCase().trim()));

      if (newSkills.length > 0) {
        await db.skill.createMany({
          data: newSkills.map((name) => ({
            profileId: existingProfile.id,
            name,
            source,
            sortOrder: nextSort++,
          })),
          skipDuplicates: true,
        });
        results.skillsAdded = newSkills.length;
      }
      results.skillsSkipped = skills.length - newSkills.length;
    }

    // --- Append/update projects ---
    if (projects?.length) {
      const existingProjects = existingProfile.projects;
      const maxSortOrder =
        existingProjects.length > 0 ? Math.max(...existingProjects.map((p) => p.sortOrder)) : -1;
      let nextSort = maxSortOrder + 1;

      for (const proj of projects) {
        // Skip projects without a title
        if (!proj.title && !proj.repoUrl) continue;

        // If existingId is provided, this is an explicit update from the review wizard
        if (proj.existingId) {
          const existingRecord = existingProjects.find((p) => p.id === proj.existingId);
          if (existingRecord) {
            await db.project.update({
              where: { id: proj.existingId },
              data: {
                title: proj.title || existingRecord.title,
                description: proj.description ?? existingRecord.description,
                techStack:
                  proj.technologies && proj.technologies.length > 0
                    ? proj.technologies
                    : existingRecord.techStack,
                repoUrl: proj.repoUrl ?? existingRecord.repoUrl,
                url: proj.liveUrl ?? existingRecord.url,
                source,
              },
            });
            results.projectsUpdated++;
            continue;
          }
        }

        // For GitHub projects, match by repoUrl or owner+repo
        const existingMatch = existingProjects.find((p) => {
          if (proj.repoUrl && p.repoUrl) {
            return p.repoUrl.toLowerCase().trim() === proj.repoUrl.toLowerCase().trim();
          }
          if (proj.ghOwner && proj.ghRepo && p.githubOwner && p.githubRepo) {
            return (
              p.githubOwner.toLowerCase() === proj.ghOwner.toLowerCase() &&
              p.githubRepo.toLowerCase() === proj.ghRepo.toLowerCase()
            );
          }
          return (p.title || '').toLowerCase().trim() === (proj.title || '').toLowerCase().trim();
        });

        if (existingMatch) {
          // Update GitHub metadata if the existing record allows it (not manual)
          if (existingMatch.source !== 'MANUAL' && source === 'GITHUB') {
            await db.project.update({
              where: { id: existingMatch.id },
              data: {
                githubStars: proj.ghStars,
                githubForks: proj.ghForks,
                githubLanguage: proj.ghLanguage,
                githubTopics: proj.ghTopics || [],
                githubPinned: proj.ghPinned || false,
              },
            });
            results.projectsUpdated++;
          } else {
            results.projectsSkipped++;
          }
        } else {
          await db.project.create({
            data: {
              profileId: existingProfile.id,
              title: proj.title,
              description: proj.description || null,
              techStack: proj.technologies || [],
              repoUrl: proj.repoUrl || null,
              url: proj.liveUrl || null,
              source,
              sortOrder: nextSort++,
              isVisible: true,
              showOnPortfolio: true,
              showOnResume: false,
              githubStars: proj.ghStars,
              githubForks: proj.ghForks,
              githubLanguage: proj.ghLanguage,
              githubTopics: proj.ghTopics || [],
              githubOwner: proj.ghOwner,
              githubRepo: proj.ghRepo,
              githubPinned: proj.ghPinned || false,
            },
          });
          results.projectsAdded++;
        }
      }
    }

    // --- Append new links (deduplicate by URL) ---
    if (links?.length) {
      const existingUrls = new Set(
        existingProfile.links.map((l) => (l.url || '').toLowerCase().trim())
      );
      const maxSortOrder =
        existingProfile.links.length > 0
          ? Math.max(...existingProfile.links.map((l) => l.sortOrder))
          : -1;
      let nextSort = maxSortOrder + 1;

      for (const link of links) {
        // Skip links without a URL
        if (!link.url) continue;

        if (!existingUrls.has(link.url.toLowerCase().trim())) {
          const linkType = (link.type || 'OTHER').toUpperCase();
          const validLinkTypes = [
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
          await db.link.create({
            data: {
              profileId: existingProfile.id,
              type: (validLinkTypes.includes(linkType) ? linkType : 'OTHER') as LinkType,
              url: link.url,
              label: link.label || null,
              source,
              sortOrder: nextSort++,
            },
          });
          results.linksAdded++;
        } else {
          results.linksSkipped++;
        }
      }
    }

    // --- Update DataSourceConnection ---
    await db.dataSourceConnection.upsert({
      where: {
        profileId_source: {
          profileId: existingProfile.id,
          source,
        },
      },
      update: {
        lastImportedAt: new Date(),
        lastSyncAt: new Date(),
        status: 'CONNECTED',
        itemsImported:
          results.experiencesAdded +
          results.experiencesUpdated +
          results.educationsAdded +
          results.educationsUpdated +
          results.skillsAdded +
          results.projectsAdded +
          results.projectsUpdated +
          results.linksAdded,
      },
      create: {
        profileId: existingProfile.id,
        source,
        status: 'CONNECTED',
        lastImportedAt: new Date(),
        lastSyncAt: new Date(),
        itemsImported:
          results.experiencesAdded +
          results.experiencesUpdated +
          results.educationsAdded +
          results.educationsUpdated +
          results.skillsAdded +
          results.projectsAdded +
          results.projectsUpdated +
          results.linksAdded,
      },
    });

    return NextResponse.json({
      success: true,
      results,
      message: buildResultMessage(results),
    });
  } catch (error) {
    console.error('Sync apply error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply sync' },
      { status: 500 }
    );
  }
}

function buildResultMessage(results: Record<string, unknown>): string {
  const parts: string[] = [];

  const profileUpdated = (results.profileFieldsUpdated as string[])?.length || 0;
  const profileSkipped = (results.profileFieldsSkipped as string[])?.length || 0;
  if (profileUpdated > 0) parts.push(`${profileUpdated} profile fields updated`);
  if (profileSkipped > 0) parts.push(`${profileSkipped} profile fields kept (manually edited)`);

  const expAdded = results.experiencesAdded as number;
  const expUpdated = results.experiencesUpdated as number;
  const expSkipped = results.experiencesSkipped as number;
  if (expAdded > 0) parts.push(`${expAdded} experiences added`);
  if (expUpdated > 0) parts.push(`${expUpdated} experiences updated`);
  if (expSkipped > 0) parts.push(`${expSkipped} duplicate experiences skipped`);

  const eduAdded = results.educationsAdded as number;
  const eduUpdated = results.educationsUpdated as number;
  const eduSkipped = results.educationsSkipped as number;
  if (eduAdded > 0) parts.push(`${eduAdded} educations added`);
  if (eduUpdated > 0) parts.push(`${eduUpdated} educations updated`);
  if (eduSkipped > 0) parts.push(`${eduSkipped} duplicate educations skipped`);

  const skillsAdded = results.skillsAdded as number;
  const skillsSkipped = results.skillsSkipped as number;
  if (skillsAdded > 0) parts.push(`${skillsAdded} skills added`);
  if (skillsSkipped > 0) parts.push(`${skillsSkipped} duplicate skills skipped`);

  const projAdded = results.projectsAdded as number;
  const projUpdated = results.projectsUpdated as number;
  const projSkipped = results.projectsSkipped as number;
  if (projAdded > 0) parts.push(`${projAdded} projects added`);
  if (projUpdated > 0) parts.push(`${projUpdated} projects updated`);
  if (projSkipped > 0) parts.push(`${projSkipped} duplicate projects skipped`);

  const linksAdded = results.linksAdded as number;
  const linksSkipped = results.linksSkipped as number;
  if (linksAdded > 0) parts.push(`${linksAdded} links added`);
  if (linksSkipped > 0) parts.push(`${linksSkipped} duplicate links skipped`);

  if (parts.length === 0) return 'No changes needed - your profile is up to date.';
  return parts.join(', ') + '.';
}
