/**
 * Enhanced GitHub Import Service
 *
 * Uses the enhanced GitHub service to fetch comprehensive data including:
 * - Pinned repositories
 * - README content
 * - Organization memberships
 * - Language statistics
 *
 * Saves data to the new GitHubProfile model and enhanced Project fields.
 */

import { db } from '@/lib/db';
import {
  fetchGitHubUser,
  getEnhancedGitHubData,
  type NormalizedEnhancedGitHubData,
} from '@/services/github-enhanced.service';
import { shouldOverrideSource } from '@/services/multi-source-merger.service';
import { DataSource, type Prisma } from '@prisma/client';
import type { ImportServiceResult, NormalizedImportResult } from './types';

/**
 * Smart defaults for GitHub project visibility
 * Determines what projects should be visible by default based on quality signals
 */
interface ProjectVisibilityDefaults {
  isVisible: boolean;
  showOnPortfolio: boolean;
  showOnResume: boolean;
  showStats: boolean;
  showReadme: boolean;
}

interface ProjectDataForDefaults {
  title: string;
  description?: string | null;
  ghPinned?: boolean;
  ghStars?: number | null;
  ghForks?: number | null;
  ghLanguage?: string | null;
  repoUrl?: string | null;
}

/**
 * Determine smart visibility defaults for a GitHub project
 * Uses quality signals to hide low-value repos automatically
 */
function getSmartProjectDefaults(project: ProjectDataForDefaults): ProjectVisibilityDefaults {
  const title = project.title.toLowerCase();
  const description = project.description?.toLowerCase() || '';
  const stars = project.ghStars || 0;
  const isPinned = project.ghPinned || false;

  // Patterns that indicate low-quality or uninteresting repos
  const lowQualityPatterns = [
    /^test$/,
    /^testing$/,
    /^my-?first/,
    /^hello-?world/,
    /^learn/,
    /^tutorial/,
    /^practice/,
    /^playground/,
    /^experiment/,
    /^sandbox/,
    /^temp$/,
    /^tmp$/,
    /^scratch/,
    /^demo$/,
    /^example$/,
    /^sample$/,
    /^dotfiles$/,
    /^config$/,
    /^\.[a-z]+$/, // Hidden folders like .vim, .emacs
  ];

  // Check for fork indicator in URL (user forked repos typically have same name)
  const isFork = project.repoUrl?.includes('/fork/') || false;

  // Determine if this is a low-quality project
  const isLowQuality =
    isFork ||
    lowQualityPatterns.some((pattern) => pattern.test(title)) ||
    (!description && stars < 1 && !isPinned);

  // High-quality projects: pinned OR >5 stars OR has meaningful description
  const isHighQuality = isPinned || stars >= 5 || (description && description.length > 30);

  return {
    // Completely hide low-quality repos
    isVisible: !isLowQuality,

    // Show on portfolio: everything visible + high-quality gets extra treatment
    showOnPortfolio: !isLowQuality,

    // Show on resume: only high-quality projects or repos with 2+ stars
    showOnResume: isHighQuality || stars >= 2,

    // Show stats: only if they're impressive (3+ stars/forks)
    showStats: stars >= 3 || (project.ghForks || 0) >= 2,

    // Show README: only for pinned repos (user explicitly featured these)
    showReadme: isPinned,
  };
}

/**
 * Convert enhanced GitHub data to standard import result
 */
function toNormalizedResult(data: NormalizedEnhancedGitHubData): NormalizedImportResult {
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
      ghTopics: project.ghTopics,
      ghOwner: project.ghOwner,
      ghRepo: project.ghRepo,
      ghReadme: project.ghReadme,
      ghPinned: project.ghPinned,
      ghLastPush: project.ghLastPush,
      ghLicense: project.ghLicense,
      ghWatchers: project.ghWatchers,
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
      confidence: 0.95, // Enhanced data is more reliable
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
 * Enhanced GitHub Import Service
 */
export class EnhancedGitHubImportService {
  /**
   * Import comprehensive data from a GitHub profile
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

      // Get user by Clerk ID to get database user ID
      const user = await db.user.findUnique({
        where: { clerkId: userId },
        include: { profile: true },
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          errorCode: 'NOT_FOUND',
        };
      }

      // Create job for tracking (use database user ID, not Clerk ID)
      const job = await db.importJob.create({
        data: {
          userId: user.id,
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
          data: { progress: 15, currentStep: 'Verifying GitHub user...' },
        });

        // Verify user exists first
        try {
          await fetchGitHubUser(username, accessToken);
        } catch {
          throw new Error(`GitHub user "${username}" not found`);
        }

        await db.importJob.update({
          where: { id: job.id },
          data: { progress: 25, currentStep: 'Fetching repositories and pinned items...' },
        });

        // Fetch enhanced data (includes pinned repos, organizations, READMEs)
        const githubData = await getEnhancedGitHubData(username, accessToken);

        await db.importJob.update({
          where: { id: job.id },
          data: { progress: 60, currentStep: 'Processing language statistics...' },
        });

        const result = toNormalizedResult(githubData);

        await db.importJob.update({
          where: { id: job.id },
          data: { progress: 70, currentStep: 'Saving to profile...' },
        });

        // User already fetched at start of function
        if (user.profile) {
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

          await db.importJob.update({
            where: { id: job.id },
            data: { progress: 80, currentStep: 'Updating GitHub profile...' },
          });

          // Save or update GitHubProfile
          await db.gitHubProfile.upsert({
            where: { profileId: user.profile.id },
            create: {
              profileId: user.profile.id,
              username: githubData.githubProfile.username,
              githubId: githubData.githubProfile.githubId,
              avatarUrl: githubData.githubProfile.avatarUrl,
              htmlUrl: githubData.githubProfile.htmlUrl,
              bio: githubData.githubProfile.bio,
              company: githubData.githubProfile.company,
              blog: githubData.githubProfile.blog,
              location: githubData.githubProfile.location,
              hireable: githubData.githubProfile.hireable,
              publicRepos: githubData.githubProfile.publicRepos,
              publicGists: githubData.githubProfile.publicGists,
              followers: githubData.githubProfile.followers,
              following: githubData.githubProfile.following,
              accountCreatedAt: githubData.githubProfile.accountCreatedAt,
              totalStars: githubData.githubProfile.totalStars,
              totalForks: githubData.githubProfile.totalForks,
              primaryLanguages: githubData.githubProfile.primaryLanguages,
              languageStats: githubData.githubProfile.languageStats as Prisma.InputJsonValue,
              organizations: githubData.githubProfile
                .organizations as unknown as Prisma.InputJsonValue,
              lastSyncAt: new Date(),
              syncStatus: 'success',
            },
            update: {
              username: githubData.githubProfile.username,
              githubId: githubData.githubProfile.githubId,
              avatarUrl: githubData.githubProfile.avatarUrl,
              htmlUrl: githubData.githubProfile.htmlUrl,
              bio: githubData.githubProfile.bio,
              company: githubData.githubProfile.company,
              blog: githubData.githubProfile.blog,
              location: githubData.githubProfile.location,
              hireable: githubData.githubProfile.hireable,
              publicRepos: githubData.githubProfile.publicRepos,
              publicGists: githubData.githubProfile.publicGists,
              followers: githubData.githubProfile.followers,
              following: githubData.githubProfile.following,
              accountCreatedAt: githubData.githubProfile.accountCreatedAt,
              totalStars: githubData.githubProfile.totalStars,
              totalForks: githubData.githubProfile.totalForks,
              primaryLanguages: githubData.githubProfile.primaryLanguages,
              languageStats: githubData.githubProfile.languageStats as Prisma.InputJsonValue,
              organizations: githubData.githubProfile
                .organizations as unknown as Prisma.InputJsonValue,
              lastSyncAt: new Date(),
              syncStatus: 'success',
              syncError: null,
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
              lastSyncAt: new Date(),
              itemsImported: result.summary!.projects! + result.summary!.skills!,
              metadata: {
                username,
                hasPinnedRepos: githubData._meta.hasPinnedRepos,
                hasOrganizations: githubData._meta.hasOrganizations,
              },
            },
            update: {
              status: 'CONNECTED',
              externalId: username,
              accessToken: accessToken || null,
              lastImportedAt: new Date(),
              lastSyncAt: new Date(),
              itemsImported: result.summary!.projects! + result.summary!.skills!,
              importError: null,
              syncError: null,
              metadata: {
                username,
                hasPinnedRepos: githubData._meta.hasPinnedRepos,
                hasOrganizations: githubData._meta.hasOrganizations,
              },
            },
          });
        }

        await db.importJob.update({
          where: { id: job.id },
          data: { progress: 90, currentStep: 'Finalizing...' },
        });

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
            userId: user.id,
            source: 'GITHUB',
            status: 'COMPLETED',
            itemsFound: result.summary!.projects! + result.summary!.skills!,
            metadata: {
              username,
              pinnedRepos: githubData._meta.hasPinnedRepos,
              organizations: githubData.githubProfile.organizations.length,
              languages: Object.keys(githubData.githubProfile.languageStats).length,
            },
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

        // Update connection status (user already fetched at start of function)
        if (user.profile) {
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

          // Also update GitHubProfile sync status if it exists
          await db.gitHubProfile.updateMany({
            where: { profileId: user.profile.id },
            data: {
              syncStatus: 'error',
              syncError: importError instanceof Error ? importError.message : 'Import failed',
            },
          });
        }

        throw importError;
      }
    } catch (error) {
      console.error('Enhanced GitHub import error:', error);

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
   * Refresh/sync GitHub data
   */
  async refreshGitHub(
    username: string,
    accessToken: string | undefined,
    userId: string
  ): Promise<ImportServiceResult> {
    return this.importGitHub(username, accessToken, userId);
  }

  /**
   * Get sync status for a user's GitHub connection
   */
  async getSyncStatus(userId: string): Promise<{
    connected: boolean;
    username?: string;
    lastSyncAt?: Date;
    syncStatus?: string;
    stats?: {
      totalStars: number;
      totalForks: number;
      publicRepos: number;
      organizations: number;
      languages: number;
    };
  }> {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        profile: {
          include: {
            githubProfile: true,
            dataSourceConnections: {
              where: { source: 'GITHUB' },
            },
          },
        },
      },
    });

    if (!user?.profile?.githubProfile) {
      return { connected: false };
    }

    const ghProfile = user.profile.githubProfile;

    return {
      connected: true,
      username: ghProfile.username,
      lastSyncAt: ghProfile.lastSyncAt || undefined,
      syncStatus: ghProfile.syncStatus || undefined,
      stats: {
        totalStars: ghProfile.totalStars,
        totalForks: ghProfile.totalForks,
        publicRepos: ghProfile.publicRepos,
        organizations: Array.isArray(ghProfile.organizations)
          ? (ghProfile.organizations as unknown[]).length
          : 0,
        languages: ghProfile.primaryLanguages.length,
      },
    };
  }
}

// Export singleton instance
export const enhancedGitHubImportService = new EnhancedGitHubImportService();

/**
 * Save enhanced GitHub data directly to user's profile
 * Used when importing from Builder with saveToProfile=true
 */
export async function saveEnhancedGitHubToProfile(
  userId: string,
  data: NormalizedEnhancedGitHubData
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[Enhanced GitHub Save] Saving to profile for user:', userId);

    // Get user by Clerk ID
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      return { success: false, error: 'Profile not found' };
    }

    const profileId = user.profile.id;

    // Update profile with GitHub data based on source priority
    const profileUpdate: Partial<{
      firstName: string;
      firstNameSource: DataSource;
      lastName: string;
      lastNameSource: DataSource;
      headline: string;
      headlineSource: DataSource;
      summary: string;
      summarySource: DataSource;
      location: string;
      locationSource: DataSource;
      avatarUrl: string;
      avatarUrlSource: DataSource;
    }> = {};

    const currentProfile = user.profile;

    if (
      data.profile.firstName &&
      shouldOverrideSource(currentProfile.firstNameSource, 'GITHUB', currentProfile.firstName)
    ) {
      profileUpdate.firstName = data.profile.firstName;
      profileUpdate.firstNameSource = DataSource.GITHUB;
    }
    if (
      data.profile.lastName &&
      shouldOverrideSource(currentProfile.lastNameSource, 'GITHUB', currentProfile.lastName)
    ) {
      profileUpdate.lastName = data.profile.lastName;
      profileUpdate.lastNameSource = DataSource.GITHUB;
    }
    if (
      data.profile.headline &&
      shouldOverrideSource(currentProfile.headlineSource, 'GITHUB', currentProfile.headline)
    ) {
      profileUpdate.headline = data.profile.headline;
      profileUpdate.headlineSource = DataSource.GITHUB;
    }
    if (
      data.profile.summary &&
      shouldOverrideSource(currentProfile.summarySource, 'GITHUB', currentProfile.summary)
    ) {
      profileUpdate.summary = data.profile.summary;
      profileUpdate.summarySource = DataSource.GITHUB;
    }
    if (
      data.profile.location &&
      shouldOverrideSource(currentProfile.locationSource, 'GITHUB', currentProfile.location)
    ) {
      profileUpdate.location = data.profile.location;
      profileUpdate.locationSource = DataSource.GITHUB;
    }
    if (
      data.profile.avatarUrl &&
      shouldOverrideSource(currentProfile.avatarUrlSource, 'GITHUB', currentProfile.avatarUrl)
    ) {
      profileUpdate.avatarUrl = data.profile.avatarUrl;
      profileUpdate.avatarUrlSource = DataSource.GITHUB;
    }

    if (Object.keys(profileUpdate).length > 0) {
      await db.profile.update({
        where: { id: profileId },
        data: profileUpdate,
      });
    }

    // Save GitHubProfile
    await db.gitHubProfile.upsert({
      where: { profileId },
      create: {
        profileId,
        username: data.githubProfile.username,
        githubId: data.githubProfile.githubId,
        avatarUrl: data.githubProfile.avatarUrl,
        htmlUrl: data.githubProfile.htmlUrl,
        bio: data.githubProfile.bio,
        company: data.githubProfile.company,
        blog: data.githubProfile.blog,
        location: data.githubProfile.location,
        hireable: data.githubProfile.hireable,
        publicRepos: data.githubProfile.publicRepos,
        publicGists: data.githubProfile.publicGists,
        followers: data.githubProfile.followers,
        following: data.githubProfile.following,
        accountCreatedAt: data.githubProfile.accountCreatedAt,
        totalStars: data.githubProfile.totalStars,
        totalForks: data.githubProfile.totalForks,
        primaryLanguages: data.githubProfile.primaryLanguages,
        languageStats: data.githubProfile.languageStats as Prisma.InputJsonValue,
        organizations: data.githubProfile.organizations as unknown as Prisma.InputJsonValue,
        lastSyncAt: new Date(),
        syncStatus: 'success',
      },
      update: {
        username: data.githubProfile.username,
        githubId: data.githubProfile.githubId,
        avatarUrl: data.githubProfile.avatarUrl,
        htmlUrl: data.githubProfile.htmlUrl,
        bio: data.githubProfile.bio,
        company: data.githubProfile.company,
        blog: data.githubProfile.blog,
        location: data.githubProfile.location,
        hireable: data.githubProfile.hireable,
        publicRepos: data.githubProfile.publicRepos,
        publicGists: data.githubProfile.publicGists,
        followers: data.githubProfile.followers,
        following: data.githubProfile.following,
        accountCreatedAt: data.githubProfile.accountCreatedAt,
        totalStars: data.githubProfile.totalStars,
        totalForks: data.githubProfile.totalForks,
        primaryLanguages: data.githubProfile.primaryLanguages,
        languageStats: data.githubProfile.languageStats as Prisma.InputJsonValue,
        organizations: data.githubProfile.organizations as unknown as Prisma.InputJsonValue,
        lastSyncAt: new Date(),
        syncStatus: 'success',
        syncError: null,
      },
    });

    // Handle email from GitHub
    if (data.contactInfo?.email) {
      const existingContact = await db.contactInfo.findUnique({
        where: { profileId },
      });

      const incomingEmail = data.contactInfo.email.toLowerCase();

      interface AdditionalEmail {
        email: string;
        source: string;
      }

      let additionalEmails: AdditionalEmail[] = [];
      if (existingContact?.additionalEmails) {
        try {
          const parsed = existingContact.additionalEmails as unknown;
          if (Array.isArray(parsed)) {
            additionalEmails = parsed as AdditionalEmail[];
          }
        } catch {
          additionalEmails = [];
        }
      }

      const isDifferentFromPrimary =
        !existingContact?.email || existingContact.email.toLowerCase() !== incomingEmail;
      const notAlreadyAdditional = !additionalEmails.some(
        (e) => e.email.toLowerCase() === incomingEmail
      );

      if (isDifferentFromPrimary && notAlreadyAdditional) {
        additionalEmails.push({
          email: incomingEmail,
          source: 'GITHUB',
        });

        await db.contactInfo.upsert({
          where: { profileId },
          create: {
            profileId,
            email: incomingEmail,
            emailSource: 'GITHUB',
            additionalEmails: JSON.parse(JSON.stringify([])),
          },
          update: {
            additionalEmails: JSON.parse(JSON.stringify(additionalEmails)),
          },
        });
      } else if (!existingContact) {
        await db.contactInfo.create({
          data: {
            profileId,
            email: incomingEmail,
            emailSource: 'GITHUB',
            additionalEmails: JSON.parse(JSON.stringify([])),
          },
        });
      }
    }

    // Add projects with enhanced data (dedupe by repoUrl or title)
    const existingProjects = await db.project.findMany({
      where: { profileId },
      select: { id: true, repoUrl: true, title: true, source: true },
    });

    const existingProjectMap = new Map(
      existingProjects.map((p) => [p.repoUrl || p.title.toLowerCase(), p])
    );

    for (const project of data.projects) {
      const key = project.repoUrl || project.title.toLowerCase();
      const existing = existingProjectMap.get(key);

      if (existing) {
        // Update existing project with enhanced data if it came from GitHub
        if (existing.source === 'GITHUB') {
          await db.project.update({
            where: { id: existing.id },
            data: {
              description: project.description || undefined,
              shortDesc: project.shortDesc || undefined,
              url: project.url || undefined,
              techStack: project.techStack || [],
              featured: project.featured || false,
              githubStars: project.ghStars,
              githubForks: project.ghForks,
              githubLanguage: project.ghLanguage,
              githubTopics: project.ghTopics || [],
              githubOwner: project.ghOwner,
              githubRepo: project.ghRepo,
              githubReadme: project.ghReadme,
              githubPinned: project.ghPinned || false,
              githubLastPush: project.ghLastPush,
              githubLicense: project.ghLicense,
              githubWatchers: project.ghWatchers,
            },
          });
        }
      } else {
        // Create new project with smart visibility defaults
        const smartDefaults = getSmartProjectDefaults(project);

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
            githubTopics: project.ghTopics || [],
            githubOwner: project.ghOwner,
            githubRepo: project.ghRepo,
            githubReadme: project.ghReadme,
            githubPinned: project.ghPinned || false,
            githubLastPush: project.ghLastPush,
            githubLicense: project.ghLicense,
            githubWatchers: project.ghWatchers,
            source: 'GITHUB',
            // Smart visibility defaults
            isVisible: smartDefaults.isVisible,
            showOnPortfolio: smartDefaults.showOnPortfolio,
            showOnResume: smartDefaults.showOnResume,
            showStats: smartDefaults.showStats,
            showReadme: smartDefaults.showReadme,
          },
        });
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

    console.log('[Enhanced GitHub Save] Successfully saved to profile');
    return { success: true };
  } catch (error) {
    console.error('[Enhanced GitHub Save] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save GitHub data to profile',
    };
  }
}
