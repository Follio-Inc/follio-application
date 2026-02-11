import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import type { DataSource } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/import/sync-preview
 *
 * Dry-run merge preview: compares incoming parsed data against the existing profile
 * and returns a categorized diff showing what would be added, updated, or skipped.
 * Nothing is written to the database.
 */

const VALID_DATA_SOURCES: DataSource[] = ['MANUAL', 'GITHUB', 'RESUME', 'LINKEDIN', 'GENERATED'];
const toDataSource = (source: string | undefined): DataSource => {
  const normalized = source?.toUpperCase();
  if (normalized && VALID_DATA_SOURCES.includes(normalized as DataSource)) {
    return normalized as DataSource;
  }
  return 'MANUAL';
};

// ─── Types ────────────────────────────────────────────────────────

interface SyncProfileData {
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  location?: string;
}

interface SyncExperience {
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  bullets?: string[];
}

interface SyncEducation {
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

interface SyncProject {
  title: string;
  description?: string;
  technologies?: string[];
  repoUrl?: string;
  liveUrl?: string;
}

interface SyncLink {
  type: string;
  url: string;
  label?: string;
}

interface SyncRequestBody {
  source: 'RESUME' | 'GITHUB' | 'LINKEDIN';
  profile?: SyncProfileData;
  experiences?: SyncExperience[];
  educations?: SyncEducation[];
  skills?: string[];
  projects?: SyncProject[];
  links?: SyncLink[];
  contactInfo?: {
    email?: string;
    phone?: string;
    website?: string;
  };
}

// ─── Preview Result Types ─────────────────────────────────────────

export interface ProfileFieldPreview {
  field: string;
  label: string;
  currentValue: string | null;
  incomingValue: string;
  currentSource: string | null;
  action: 'update' | 'fill' | 'same';
  reason?: string;
}

export interface ItemPreview<T> {
  item: T;
  action: 'add' | 'skip' | 'update';
  reason?: string;
  /** For skip/update, the existing item it matched */
  existingMatch?: Record<string, unknown>;
}

export interface MergePreviewResult {
  source: string;
  profileFields: ProfileFieldPreview[];
  experiences: ItemPreview<SyncExperience>[];
  educations: ItemPreview<SyncEducation>[];
  skills: ItemPreview<{ name: string }>[];
  projects: ItemPreview<SyncProject>[];
  links: ItemPreview<SyncLink>[];
  summary: {
    profileFieldsToUpdate: number;
    profileFieldsToFill: number;
    profileFieldsSame: number;
    experiencesToAdd: number;
    experiencesDuplicate: number;
    experiencesToUpdate: number;
    educationsToAdd: number;
    educationsDuplicate: number;
    educationsToUpdate: number;
    skillsToAdd: number;
    skillsDuplicate: number;
    projectsToAdd: number;
    projectsDuplicate: number;
    projectsToUpdate: number;
    linksToAdd: number;
    linksDuplicate: number;
    totalNew: number;
    totalSkipped: number;
  };
}

// ─── Route Handler ────────────────────────────────────────────────

/** Normalize a string for comparison */
const norm = (val: string | null | undefined): string => (val || '').toLowerCase().trim();

/** Normalize a Date to a comparable string (YYYY-MM-DD) */
const normDate = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : '');

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
    } = body;

    if (!rawSource) {
      return NextResponse.json({ error: 'Source is required' }, { status: 400 });
    }

    // Validate source (side-effect only — ensures valid DataSource)
    toDataSource(rawSource);

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
    const preview: MergePreviewResult = {
      source: rawSource,
      profileFields: [],
      experiences: [],
      educations: [],
      skills: [],
      projects: [],
      links: [],
      summary: {
        profileFieldsToUpdate: 0,
        profileFieldsToFill: 0,
        profileFieldsSame: 0,
        experiencesToAdd: 0,
        experiencesDuplicate: 0,
        experiencesToUpdate: 0,
        educationsToAdd: 0,
        educationsDuplicate: 0,
        educationsToUpdate: 0,
        skillsToAdd: 0,
        skillsDuplicate: 0,
        projectsToAdd: 0,
        projectsDuplicate: 0,
        projectsToUpdate: 0,
        linksToAdd: 0,
        linksDuplicate: 0,
        totalNew: 0,
        totalSkipped: 0,
      },
    };

    // --- Preview profile field changes ---
    if (incomingProfile) {
      const fieldMappings: Array<{
        field: keyof SyncProfileData;
        sourceField: string;
        label: string;
      }> = [
        { field: 'firstName', sourceField: 'firstNameSource', label: 'First Name' },
        { field: 'lastName', sourceField: 'lastNameSource', label: 'Last Name' },
        { field: 'headline', sourceField: 'headlineSource', label: 'Headline' },
        { field: 'summary', sourceField: 'summarySource', label: 'Summary' },
        { field: 'location', sourceField: 'locationSource', label: 'Location' },
      ];

      for (const { field, sourceField, label } of fieldMappings) {
        const incomingValue = incomingProfile[field];
        if (!incomingValue) continue;

        const existingValue = existingProfile[field as keyof typeof existingProfile] as
          | string
          | null;
        const existingSource = (existingProfile as Record<string, unknown>)[
          sourceField
        ] as DataSource | null;

        let action: 'update' | 'fill' | 'same';
        let reason: string | undefined;

        if (!existingValue) {
          action = 'fill';
          reason = 'Field is currently empty';
          preview.summary.profileFieldsToFill++;
        } else if (existingValue.trim().toLowerCase() === incomingValue.trim().toLowerCase()) {
          action = 'same';
          reason = 'Values are identical';
          preview.summary.profileFieldsSame++;
        } else {
          action = 'update';
          reason = 'Resume has a different value — you decide which to keep';
          preview.summary.profileFieldsToUpdate++;
        }

        preview.profileFields.push({
          field,
          label,
          currentValue: existingValue,
          incomingValue,
          currentSource: existingSource,
          action,
          reason,
        });
      }
    }

    // --- Preview experiences ---
    if (experiences?.length) {
      for (const exp of experiences) {
        if (!exp.company && !exp.role) continue;

        const match = existingProfile.workExperiences.find(
          (e) =>
            (e.company || '').toLowerCase().trim() === (exp.company || '').toLowerCase().trim() &&
            (e.role || '').toLowerCase().trim() === (exp.role || '').toLowerCase().trim()
        );

        if (match) {
          // Check if any fields differ between incoming and existing
          const changedFields: string[] = [];
          const existingMatchData: Record<string, unknown> = {
            id: match.id,
            company: match.company,
            role: match.role,
            location: match.location || null,
            startDate: match.startDate ? match.startDate.toISOString().slice(0, 10) : null,
            endDate: match.endDate ? match.endDate.toISOString().slice(0, 10) : null,
            isCurrent: match.isCurrent,
            description: match.description || null,
          };

          // Compare location
          if (norm(exp.location) !== norm(match.location)) changedFields.push('location');
          // Compare isCurrent
          if ((exp.isCurrent ?? false) !== match.isCurrent) changedFields.push('isCurrent');
          // Compare endDate (especially important: Present → actual date)
          if (!exp.isCurrent && exp.endDate && !match.endDate) changedFields.push('endDate');
          else if (!exp.isCurrent && !exp.endDate && match.endDate) changedFields.push('endDate');
          else if (exp.endDate && match.endDate && norm(exp.endDate) !== normDate(match.endDate))
            changedFields.push('endDate');
          // Compare startDate
          if (exp.startDate && match.startDate && norm(exp.startDate) !== normDate(match.startDate))
            changedFields.push('startDate');
          else if (exp.startDate && !match.startDate) changedFields.push('startDate');
          // Compare bullets
          const expBullets = (exp.bullets || []).join('|');
          const matchBullets = (match.bullets || []).join('|');
          if (expBullets !== matchBullets) changedFields.push('bullets');

          if (changedFields.length > 0) {
            preview.experiences.push({
              item: exp,
              action: 'update',
              reason: `Updated fields: ${changedFields.join(', ')}`,
              existingMatch: existingMatchData,
            });
            preview.summary.experiencesToUpdate++;
          } else {
            preview.experiences.push({
              item: exp,
              action: 'skip',
              reason: 'Duplicate: matching company and role, no changes detected',
              existingMatch: existingMatchData,
            });
            preview.summary.experiencesDuplicate++;
          }
        } else {
          preview.experiences.push({ item: exp, action: 'add' });
          preview.summary.experiencesToAdd++;
        }
      }
    }

    // --- Preview educations ---
    if (educations?.length) {
      for (const edu of educations) {
        if (!edu.institution) continue;

        const match = existingProfile.educations.find(
          (e) =>
            (e.institution || '').toLowerCase().trim() ===
              (edu.institution || '').toLowerCase().trim() &&
            (e.degree || '').toLowerCase().trim() === (edu.degree || '').toLowerCase().trim()
        );

        if (match) {
          const changedFields: string[] = [];
          const existingMatchData: Record<string, unknown> = {
            id: match.id,
            institution: match.institution,
            degree: match.degree || null,
            fieldOfStudy: match.fieldOfStudy || null,
            startDate: match.startDate ? match.startDate.toISOString().slice(0, 10) : null,
            endDate: match.endDate ? match.endDate.toISOString().slice(0, 10) : null,
            gpa: match.gpa || null,
          };

          if (norm(edu.fieldOfStudy) !== norm(match.fieldOfStudy))
            changedFields.push('fieldOfStudy');
          if (edu.startDate && match.startDate && norm(edu.startDate) !== normDate(match.startDate))
            changedFields.push('startDate');
          else if (edu.startDate && !match.startDate) changedFields.push('startDate');
          if (edu.endDate && match.endDate && norm(edu.endDate) !== normDate(match.endDate))
            changedFields.push('endDate');
          else if (edu.endDate && !match.endDate) changedFields.push('endDate');
          if (norm(edu.gpa) !== norm(match.gpa)) changedFields.push('gpa');

          if (changedFields.length > 0) {
            preview.educations.push({
              item: edu,
              action: 'update',
              reason: `Updated fields: ${changedFields.join(', ')}`,
              existingMatch: existingMatchData,
            });
            preview.summary.educationsToUpdate++;
          } else {
            preview.educations.push({
              item: edu,
              action: 'skip',
              reason: 'Duplicate: matching institution and degree, no changes detected',
              existingMatch: existingMatchData,
            });
            preview.summary.educationsDuplicate++;
          }
        } else {
          preview.educations.push({ item: edu, action: 'add' });
          preview.summary.educationsToAdd++;
        }
      }
    }

    // --- Preview skills ---
    if (skills?.length) {
      const existingSkillNames = new Set(
        existingProfile.skills.map((s) => s.name.toLowerCase().trim())
      );

      for (const skillName of skills) {
        if (existingSkillNames.has(skillName.toLowerCase().trim())) {
          preview.skills.push({
            item: { name: skillName },
            action: 'skip',
            reason: 'Already exists in your skills',
          });
          preview.summary.skillsDuplicate++;
        } else {
          preview.skills.push({ item: { name: skillName }, action: 'add' });
          preview.summary.skillsToAdd++;
        }
      }
    }

    // --- Preview projects ---
    if (projects?.length) {
      for (const proj of projects) {
        if (!proj.title && !proj.repoUrl) continue;

        const existingMatch = existingProfile.projects.find((p) => {
          if (proj.repoUrl && p.repoUrl) {
            return p.repoUrl.toLowerCase().trim() === proj.repoUrl.toLowerCase().trim();
          }
          return (p.title || '').toLowerCase().trim() === (proj.title || '').toLowerCase().trim();
        });

        if (existingMatch) {
          const changedFields: string[] = [];
          const existingMatchData: Record<string, unknown> = {
            id: existingMatch.id,
            title: existingMatch.title,
            description: existingMatch.description || null,
            repoUrl: existingMatch.repoUrl || null,
            liveUrl: existingMatch.url || null,
          };

          if (norm(proj.description) !== norm(existingMatch.description))
            changedFields.push('description');
          if (norm(proj.liveUrl) !== norm(existingMatch.url)) changedFields.push('liveUrl');
          if (norm(proj.repoUrl) !== norm(existingMatch.repoUrl)) changedFields.push('repoUrl');

          if (changedFields.length > 0) {
            preview.projects.push({
              item: proj,
              action: 'update',
              reason: `Updated fields: ${changedFields.join(', ')}`,
              existingMatch: existingMatchData,
            });
            preview.summary.projectsToUpdate++;
          } else {
            preview.projects.push({
              item: proj,
              action: 'skip',
              reason: 'Duplicate: matching project, no changes detected',
              existingMatch: existingMatchData,
            });
            preview.summary.projectsDuplicate++;
          }
        } else {
          preview.projects.push({ item: proj, action: 'add' });
          preview.summary.projectsToAdd++;
        }
      }
    }

    // --- Preview links ---
    if (links?.length) {
      const existingUrls = new Set(
        existingProfile.links.map((l) => (l.url || '').toLowerCase().trim())
      );

      for (const link of links) {
        if (!link.url) continue;

        if (existingUrls.has(link.url.toLowerCase().trim())) {
          preview.links.push({
            item: link,
            action: 'skip',
            reason: 'Duplicate: this URL already exists in your links',
          });
          preview.summary.linksDuplicate++;
        } else {
          preview.links.push({ item: link, action: 'add' });
          preview.summary.linksToAdd++;
        }
      }
    }

    // --- Compute totals ---
    preview.summary.totalNew =
      preview.summary.profileFieldsToUpdate +
      preview.summary.profileFieldsToFill +
      preview.summary.experiencesToAdd +
      preview.summary.experiencesToUpdate +
      preview.summary.educationsToAdd +
      preview.summary.educationsToUpdate +
      preview.summary.skillsToAdd +
      preview.summary.projectsToAdd +
      preview.summary.projectsToUpdate +
      preview.summary.linksToAdd;

    preview.summary.totalSkipped =
      preview.summary.profileFieldsSame +
      preview.summary.experiencesDuplicate +
      preview.summary.educationsDuplicate +
      preview.summary.skillsDuplicate +
      preview.summary.projectsDuplicate +
      preview.summary.linksDuplicate;

    return NextResponse.json({
      success: true,
      preview,
    });
  } catch (error) {
    console.error('Sync preview error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate merge preview' },
      { status: 500 }
    );
  }
}
