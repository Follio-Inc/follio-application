/**
 * GitHub Import Service
 *
 * Modular service for importing data from GitHub profiles.
 * Handles normalization, deduplication, and error handling.
 */

import { db } from '@/lib/db';
import {
  fetchGitHubUser,
  normalizeGitHubData,
  type NormalizedGitHubData,
} from '@/services/github.service';
import type { Prisma } from '@prisma/client';
import type { IGitHubImportService, ImportServiceResult, NormalizedImportResult } from './types';

/**
 * Convert GitHub normalized data to standard import result
 */
function toNormalizedResult(data: NormalizedGitHubData): NormalizedImportResult {
  return {
    source: 'GITHUB',
    profile: {
      firstName: data.profile.firstName,
      lastName: data.profile.lastName,
      headline: data.profile.headline,
      summary: data.profile.summary,
      location: data.profile.location,
      avatarUrl: data.profile.avatarUrl,
    },
    contactInfo: data.contactInfo
      ? {
          email: data.contactInfo.email,
        }
      : undefined,
    links: data.links.map((link) => ({
      type: link.type,
      url: link.url,
      label: link.label,
      source: 'GITHUB',
    })),
    projects: data.projects.map((project) => ({
      title: project.title,
      description: project.description,
      shortDesc: project.shortDesc,
      url: project.url,
      repoUrl: project.repoUrl,
      techStack: project.techStack,
      featured: project.featured,
      sortOrder: project.sortOrder,
      source: 'GITHUB',
      ghStars: project.ghStars,
      ghForks: project.ghForks,
      ghLanguage: project.ghLanguage,
    })),
    skills: data.skills.map((skill) => ({
      name: skill.name,
      category: skill.category,
      source: 'GITHUB',
    })),
    experiences: [],
    educations: [],
    certifications: [],
    meta: {
      source: 'GITHUB',
      importedAt: data._meta.fetchedAt,
      rawDataStored: true,
      confidence: 0.9, // GitHub data is generally reliable
    },
    summary: {
      profileFields: Object.values(data.profile).filter(Boolean).length,
      projects: data.projects.length,
      skills: data.skills.length,
      links: data.links.length,
      experiences: 0,
      educations: 0,
      certifications: 0,
    },
  };
}

/**
 * GitHub Import Service Implementation
 */
export class GitHubImportService implements IGitHubImportService {
  /**
   * Import data from a GitHub profile
   */
  async importGitHub(
    username: string,
    accessToken: string | undefined,
    userId: string
  ): Promise<ImportServiceResult> {
    try {
      // Validate username format
      if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)) {
        return {
          success: false,
          error: 'Invalid GitHub username format',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      // Create job for tracking
      const job = await db.importJob.create({
        data: {
          userId,
          source: 'GITHUB',
          status: 'PROCESSING',
          inputType: 'oauth',
          inputData: { username },
          progress: 10,
          currentStep: 'Fetching GitHub profile...',
          startedAt: new Date(),
        },
      });

      try {
        // Update progress
        await db.importJob.update({
          where: { id: job.id },
          data: { progress: 20, currentStep: 'Verifying GitHub user...' },
        });

        // Verify user exists first
        try {
          await fetchGitHubUser(username, accessToken);
        } catch {
          throw new Error(`GitHub user "${username}" not found`);
        }

        await db.importJob.update({
          where: { id: job.id },
          data: { progress: 40, currentStep: 'Fetching repositories...' },
        });

        // Fetch and normalize data
        const githubData = await normalizeGitHubData(username, accessToken);

        await db.importJob.update({
          where: { id: job.id },
          data: { progress: 70, currentStep: 'Normalizing data...' },
        });

        const result = toNormalizedResult(githubData);

        // Get user's profile for storing raw data
        const user = await db.user.findUnique({
          where: { clerkId: userId },
          include: { profile: true },
        });

        if (user?.profile) {
          // Store raw import data
          await db.rawImportPayload.upsert({
            where: {
              profileId_source: {
                profileId: user.profile.id,
                source: 'GITHUB',
              },
            },
            create: {
              profileId: user.profile.id,
              source: 'GITHUB',
              rawData: githubData as unknown as Prisma.InputJsonValue,
              status: 'COMPLETED',
              processedAt: new Date(),
            },
            update: {
              rawData: githubData as unknown as Prisma.InputJsonValue,
              status: 'COMPLETED',
              processedAt: new Date(),
            },
          });

          // Update or create data source connection
          await db.dataSourceConnection.upsert({
            where: {
              profileId_source: {
                profileId: user.profile.id,
                source: 'GITHUB',
              },
            },
            create: {
              profileId: user.profile.id,
              source: 'GITHUB',
              status: 'CONNECTED',
              externalId: username,
              accessToken: accessToken || null,
              lastImportedAt: new Date(),
              itemsImported: result.summary!.projects! + result.summary!.skills!,
              metadata: { username },
            },
            update: {
              status: 'CONNECTED',
              externalId: username,
              accessToken: accessToken || null,
              lastImportedAt: new Date(),
              itemsImported: result.summary!.projects! + result.summary!.skills!,
              importError: null,
              metadata: { username },
            },
          });
        }

        // Update job as completed
        await db.importJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            progress: 100,
            currentStep: 'Import complete',
            result: result as unknown as Prisma.InputJsonValue,
            itemsFound: result.summary!.projects! + result.summary!.skills!,
            completedAt: new Date(),
          },
        });

        // Log the import
        await db.importLog.create({
          data: {
            userId: user?.id || '',
            source: 'GITHUB',
            status: 'COMPLETED',
            itemsFound: result.summary!.projects! + result.summary!.skills!,
            metadata: { username },
          },
        });

        return {
          success: true,
          data: result,
          jobId: job.id,
          status: 'completed',
        };
      } catch (importError) {
        // Update job as failed
        await db.importJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error:
              importError instanceof Error ? importError.message : 'Failed to import from GitHub',
            completedAt: new Date(),
          },
        });

        // Update connection status
        const user = await db.user.findUnique({
          where: { clerkId: userId },
          include: { profile: true },
        });

        if (user?.profile) {
          await db.dataSourceConnection.upsert({
            where: {
              profileId_source: {
                profileId: user.profile.id,
                source: 'GITHUB',
              },
            },
            create: {
              profileId: user.profile.id,
              source: 'GITHUB',
              status: 'ERROR',
              importError: importError instanceof Error ? importError.message : 'Import failed',
            },
            update: {
              status: 'ERROR',
              importError: importError instanceof Error ? importError.message : 'Import failed',
            },
          });
        }

        throw importError;
      }
    } catch (error) {
      console.error('GitHub import error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to import from GitHub';
      const isNotFound = errorMessage.includes('not found');

      return {
        success: false,
        error: errorMessage,
        errorCode: isNotFound ? 'NOT_FOUND' : 'IMPORT_ERROR',
      };
    }
  }

  /**
   * Refresh/re-import data from GitHub
   */
  async refreshGitHub(
    username: string,
    accessToken: string | undefined,
    userId: string
  ): Promise<ImportServiceResult> {
    // Re-import is the same as import for GitHub
    return this.importGitHub(username, accessToken, userId);
  }
}

// Export singleton instance
export const githubImportService = new GitHubImportService();

/**
 * Save GitHub data directly to user's profile
 * Used when importing from Builder with saveToProfile=true
 */
export async function saveGitHubToProfile(
  userId: string,
  data: NormalizedGitHubData
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[GitHub Save] Saving to profile for user:', userId);

    // Get user by Clerk ID
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      return { success: false, error: 'Profile not found' };
    }

    const profileId = user.profile.id;

    // Update profile with GitHub data if not already set
    const profileUpdate: Partial<{
      firstName: string;
      lastName: string;
      headline: string;
      summary: string;
      location: string;
      avatarUrl: string;
    }> = {};

    if (!user.profile.firstName && data.profile.firstName) {
      profileUpdate.firstName = data.profile.firstName;
    }
    if (!user.profile.lastName && data.profile.lastName) {
      profileUpdate.lastName = data.profile.lastName;
    }
    if (!user.profile.headline && data.profile.headline) {
      profileUpdate.headline = data.profile.headline;
    }
    if (!user.profile.summary && data.profile.summary) {
      profileUpdate.summary = data.profile.summary;
    }
    if (!user.profile.location && data.profile.location) {
      profileUpdate.location = data.profile.location;
    }
    if (!user.profile.avatarUrl && data.profile.avatarUrl) {
      profileUpdate.avatarUrl = data.profile.avatarUrl;
    }

    if (Object.keys(profileUpdate).length > 0) {
      await db.profile.update({
        where: { id: profileId },
        data: profileUpdate,
      });
    }

    // Add projects (dedupe by repoUrl or title)
    const existingProjects = await db.project.findMany({
      where: { profileId },
      select: { repoUrl: true, title: true },
    });
    const existingProjectKeys = new Set(
      existingProjects.map((p) => p.repoUrl || p.title.toLowerCase())
    );

    for (const project of data.projects) {
      const key = project.repoUrl || project.title.toLowerCase();
      if (!existingProjectKeys.has(key)) {
        await db.project.create({
          data: {
            profileId,
            title: project.title,
            description: project.description,
            shortDesc: project.shortDesc,
            url: project.url,
            repoUrl: project.repoUrl,
            techStack: project.techStack || [],
            featured: project.featured || false,
            githubStars: project.ghStars,
            githubForks: project.ghForks,
            githubLanguage: project.ghLanguage,
            source: 'GITHUB',
          },
        });
        existingProjectKeys.add(key);
      }
    }

    // Add skills (dedupe by name)
    const existingSkills = await db.skill.findMany({
      where: { profileId },
      select: { name: true },
    });
    const existingSkillNames = new Set(existingSkills.map((s) => s.name.toLowerCase()));

    for (const skill of data.skills) {
      if (!existingSkillNames.has(skill.name.toLowerCase())) {
        await db.skill.create({
          data: {
            profileId,
            name: skill.name,
            source: 'GITHUB',
          },
        });
        existingSkillNames.add(skill.name.toLowerCase());
      }
    }

    // Add links (dedupe by URL)
    const existingLinks = await db.link.findMany({
      where: { profileId },
      select: { url: true },
    });
    const existingLinkUrls = new Set(existingLinks.map((l) => l.url.toLowerCase()));

    for (const link of data.links) {
      if (!existingLinkUrls.has(link.url.toLowerCase())) {
        // Map link type to valid LinkType enum
        const upperType = link.type.toUpperCase();
        let linkType: 'GITHUB' | 'LINKEDIN' | 'TWITTER' | 'PORTFOLIO' | 'BLOG' | 'OTHER' = 'OTHER';
        if (upperType === 'GITHUB') linkType = 'GITHUB';
        else if (upperType === 'LINKEDIN') linkType = 'LINKEDIN';
        else if (upperType === 'TWITTER') linkType = 'TWITTER';
        else if (upperType === 'WEBSITE' || upperType === 'PORTFOLIO') linkType = 'PORTFOLIO';
        else if (upperType === 'BLOG') linkType = 'BLOG';

        await db.link.create({
          data: {
            profileId,
            type: linkType,
            url: link.url,
            label: link.label,
            source: 'GITHUB',
          },
        });
        existingLinkUrls.add(link.url.toLowerCase());
      }
    }

    console.log('[GitHub Save] Successfully saved to profile');
    return { success: true };
  } catch (error) {
    console.error('[GitHub Save] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save GitHub data to profile',
    };
  }
}
