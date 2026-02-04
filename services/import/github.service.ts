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
