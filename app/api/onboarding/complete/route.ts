import { syncAvatarToClerk } from '@/lib/clerk-avatar-sync';
import { db } from '@/lib/db';
import { parseDateFlexible } from '@/lib/utils';
import type { NormalizedImportResult } from '@/services/import/types';
import {
  getSignupName,
  resolveEmails,
  resolveName,
  type NameEntry,
} from '@/services/multi-source-merger.service';
import { auth, currentUser } from '@clerk/nextjs/server';
import type { DataSource, Profile, SectionType, User } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

// Helper to safely cast string to DataSource enum
const VALID_DATA_SOURCES: DataSource[] = ['MANUAL', 'GITHUB', 'RESUME', 'LINKEDIN', 'GENERATED'];
const toDataSource = (source: string | undefined): DataSource => {
  const normalized = source?.toUpperCase();
  if (normalized && VALID_DATA_SOURCES.includes(normalized as DataSource)) {
    return normalized as DataSource;
  }
  return 'MANUAL';
};

/**
 * Helper to filter out base64 data URLs from avatar storage.
 * Base64 images should only be synced to Clerk, not stored in the database.
 * Returns undefined if it's a base64 data URL, otherwise returns the URL.
 */
const filterBase64Avatar = (avatarUrl: string | undefined | null): string | undefined => {
  if (!avatarUrl) return undefined;
  // Don't store base64 data URLs in the database - they're too large and break the UI
  if (avatarUrl.startsWith('data:')) {
    console.log('[Avatar Filter] Filtering out base64 avatar for database storage');
    return undefined;
  }
  return avatarUrl;
};

/**
 * Smart visibility defaults for GitHub projects
 * Determines what projects should be visible by default based on quality signals
 */
interface ProjectVisibilityDefaults {
  isVisible: boolean;
  showOnPortfolio: boolean;
  showOnResume: boolean;
  showStats: boolean;
  showReadme: boolean;
}

interface ProjectForDefaults {
  title: string;
  description?: string | null;
  ghPinned?: boolean;
  ghStars?: number | null;
  ghForks?: number | null;
  repoUrl?: string | null;
}

function getProjectVisibilityDefaults(project: ProjectForDefaults): ProjectVisibilityDefaults {
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

  // Check for fork indicator in URL
  const isFork = project.repoUrl?.includes('/fork/') || false;

  // Determine if this is a low-quality project
  const isLowQuality =
    isFork ||
    lowQualityPatterns.some((pattern) => pattern.test(title)) ||
    (!description && stars < 1 && !isPinned);

  // High-quality projects: pinned OR >5 stars OR has meaningful description
  const isHighQuality = isPinned || stars >= 5 || (description && description.length > 30);

  return {
    isVisible: !isLowQuality,
    showOnPortfolio: !isLowQuality,
    showOnResume: isHighQuality || stars >= 2,
    showStats: stars >= 3 || (project.ghForks || 0) >= 2,
    showReadme: isPinned,
  };
}

/**
 * Safely parse a date string using the shared flexible parser.
 * Returns null for invalid dates.
 */
const safeParseDate = (dateStr: string | undefined | null): Date | null => {
  return parseDateFlexible(dateStr);
};

interface ManualLinkInput {
  url: string;
  label: string;
}

// Reviewed data from the step-by-step review flow
interface ReviewedData {
  profile: {
    firstName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
    avatarUrl?: string;
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
  skills: string[];
  links: Array<{
    type: string;
    url: string;
    label?: string;
  }>;
  // Projects from GitHub and resume
  projects?: Array<{
    title: string;
    description?: string;
    technologies?: string[];
    techStack?: string[];
    repoUrl?: string;
    liveUrl?: string;
    url?: string;
    // GitHub-specific fields (support both naming conventions)
    ghStars?: number;
    githubStars?: number;
    ghForks?: number;
    githubForks?: number;
    ghLanguage?: string;
    githubLanguage?: string;
    ghPinned?: boolean;
    githubPinned?: boolean;
    ghTopics?: string[];
    githubTopics?: string[];
    ghOwner?: string;
    githubOwner?: string;
    ghRepo?: string;
    githubRepo?: string;
    ghReadme?: string;
    githubReadme?: string;
    ghLastPush?: string;
    githubLastPush?: string;
    ghLicense?: string;
    githubLicense?: string;
    ghWatchers?: number;
    githubWatchers?: number;
    // Visibility controls (user can adjust during review)
    isVisible?: boolean;
    showOnPortfolio?: boolean;
    showOnResume?: boolean;
    showStats?: boolean;
    showReadme?: boolean;
    customDescription?: string;
  }>;
  contactInfo?: {
    email?: string;
    emailSource?: string;
    phone?: string;
    phoneSource?: string;
    // Support for all collected emails from all import sources
    allEmails?: Array<{ email: string; source: string }>;
    // Support for all collected phones from all import sources (supports both formats)
    allPhones?: Array<{
      phone?: string; // Legacy
      countryCode?: string | null; // New
      number?: string; // New
      source: string;
    }>;
    // Index of the primary email/phone in the arrays (user's choice)
    primaryEmailIndex?: number;
    primaryPhoneIndex?: number;
  };
}

/**
 * POST /api/onboarding/complete
 * Complete onboarding - create/update profile with imported data
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    console.log('[Onboarding Complete] Starting for userId:', userId);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[Onboarding Complete] Request body keys:', Object.keys(body));

    const {
      importedData,
      reviewedData,
      firstName: providedFirstName,
      lastName: providedLastName,
      handle: providedHandle,
      manualLinks,
      resumeFileName,
      galleryPhotos,
      originalAvatarDataUrl,
      targetProfileId,
    } = body as {
      importedData?: Record<string, NormalizedImportResult | undefined>;
      reviewedData?: ReviewedData;
      firstName?: string;
      lastName?: string;
      handle?: string;
      manualLinks?: ManualLinkInput[];
      resumeFileName?: string;
      galleryPhotos?: string[];
      /** Original full-resolution avatar data URL from the client upload */
      originalAvatarDataUrl?: string;
      /** When creating a new resume from the builder, this targets the specific blank profile */
      targetProfileId?: string;
    };

    console.log('[Onboarding Complete] Has reviewedData:', !!reviewedData);
    console.log('[Onboarding Complete] Has importedData:', !!importedData);
    console.log('[Onboarding Complete] providedFirstName:', providedFirstName);
    console.log('[Onboarding Complete] providedHandle:', providedHandle);
    console.log('[Onboarding Complete] targetProfileId:', targetProfileId || '(none)');

    // Get or create user
    let user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user) {
      const clerkUser = await currentUser();
      // Use primaryEmailAddress to get the user's primary email (first signup email)
      // This ensures Google signup email stays primary even if user later connects GitHub
      const primaryEmailAddr = clerkUser?.primaryEmailAddress?.emailAddress;
      if (!primaryEmailAddr) {
        return NextResponse.json({ error: 'Unable to get user details' }, { status: 400 });
      }

      const email = primaryEmailAddr;

      // Check if a user with this email already exists
      const existingUserByEmail = await db.user.findUnique({
        where: { email },
        include: { profile: true },
      });

      if (existingUserByEmail) {
        // SECURITY: Do NOT allow a new Clerk user to take over an existing account
        // This prevents account hijacking when someone connects an OAuth provider
        // that has the same email as an existing user's account.
        // Users must link accounts through Clerk's account linking, not database overwrites.
        console.error(
          '[Onboarding Complete] Email conflict detected:',
          email,
          'already belongs to user:',
          existingUserByEmail.id,
          'but Clerk user:',
          userId,
          'is trying to use it'
        );
        return NextResponse.json(
          {
            error: 'Email already in use',
            message:
              'This email is already associated with another account. Please sign in with your original account or use a different email.',
            code: 'EMAIL_CONFLICT',
          },
          { status: 409 }
        );
      }

      // Create new user - email is unique and not used by anyone else
      user = await db.user.create({
        data: {
          clerkId: userId,
          email,
        },
        include: { profile: true },
      });
      console.log('[Onboarding Complete] Created new user:', user.id);
    }

    // When targetProfileId is specified (e.g. "New resume from upload" in builder),
    // resolve and use that specific profile instead of whatever `user.profile` points to.
    // This ensures the imported data goes into the correct blank resume.
    if (targetProfileId && user) {
      const targetProfile = await db.profile.findFirst({
        where: { id: targetProfileId, userId: user.id },
      });
      if (targetProfile) {
        // Override user.profile so handleReviewedData populates the target resume
        (user as typeof user & { profile: typeof targetProfile }).profile = targetProfile;
        console.log('[Onboarding Complete] Using targetProfileId:', targetProfileId);
      } else {
        console.warn(
          '[Onboarding Complete] targetProfileId not found or unauthorized:',
          targetProfileId
        );
      }
    }

    // If we have reviewedData from the review flow, use it directly
    if (reviewedData) {
      // Get Clerk user for avatar fallback
      const clerkUserForReview = await currentUser();
      const result = await handleReviewedData(
        user,
        reviewedData,
        providedHandle,
        providedFirstName,
        providedLastName,
        clerkUserForReview?.imageUrl,
        galleryPhotos,
        originalAvatarDataUrl
      );

      // Create ImportLog so this import appears in the builder's Import History timeline
      const itemsCount =
        (reviewedData.experiences?.length || 0) +
        (reviewedData.educations?.length || 0) +
        (reviewedData.skills?.length || 0) +
        (reviewedData.links?.length || 0) +
        (reviewedData.projects?.length || 0);

      if (itemsCount > 0) {
        await db.importLog
          .create({
            data: {
              userId: user.id,
              source: 'RESUME',
              status: 'COMPLETED',
              itemsFound: itemsCount,
              itemsMerged: itemsCount,
              metadata: {
                origin: 'onboarding',
                fileName: resumeFileName || null,
              },
            },
          })
          .catch((err: unknown) => {
            console.error('[Onboarding Complete] Failed to create ImportLog:', err);
          });
      }

      return result;
    }

    // Otherwise, merge imported data from the old flow
    console.log(
      '[Onboarding Complete] importedData keys:',
      importedData ? Object.keys(importedData) : 'none'
    );
    console.log(
      '[Onboarding Complete] Calling mergeImportedData with:',
      JSON.stringify(importedData || {}, null, 2)?.substring(0, 1000)
    );
    const mergedProfile = mergeImportedData(importedData || {});
    console.log(
      '[Onboarding Complete] Merged profile:',
      JSON.stringify(mergedProfile, null, 2)?.substring(0, 1000)
    );

    // Get Clerk user to access signup name
    const clerkUser = await currentUser();
    const signupName = getSignupName({
      firstName: clerkUser?.firstName,
      lastName: clerkUser?.lastName,
    });

    // Apply name precedence: Signup > Resume > LinkedIn > GitHub
    // Build name entries for resolution
    const nameEntries: NameEntry[] = [];

    // Add signup name if present (highest priority after manual entry)
    if (signupName?.firstName || signupName?.lastName) {
      nameEntries.push({
        firstName: signupName.firstName,
        lastName: signupName.lastName,
        source: 'SIGNUP',
      });
    }

    // Add imported name
    if (mergedProfile.firstName || mergedProfile.lastName) {
      nameEntries.push({
        firstName: mergedProfile.firstName,
        lastName: mergedProfile.lastName,
        source: mergedProfile.firstNameSource || mergedProfile.lastNameSource || 'RESUME',
      });
    }

    // Resolve final name with proper precedence
    const resolvedName = resolveName(nameEntries);
    console.log('[Onboarding Complete] Resolved name:', resolvedName);

    // Use provided handle or generate one
    let handle =
      providedHandle ||
      generateHandle(
        providedFirstName || resolvedName.firstName,
        providedLastName || resolvedName.lastName,
        user.email
      );

    // Check if provided handle is available
    if (providedHandle) {
      const existingHandle = await db.profile.findUnique({
        where: { handle: providedHandle },
        select: { id: true },
      });
      if (existingHandle && (!user.profile || existingHandle.id !== user.profile.id)) {
        return NextResponse.json(
          { error: 'Handle is already taken', message: 'Please choose a different handle' },
          { status: 409 }
        );
      }
    } else {
      // Ensure generated handle is unique
      handle = await ensureUniqueHandle(handle, user.profile?.id);
    }

    // Use provided name or fall back to resolved name with precedence
    // Precedence: Manual provided > Signup > Resume > LinkedIn > GitHub
    const finalFirstName = providedFirstName || resolvedName.firstName || 'New';
    const finalLastName = providedLastName || resolvedName.lastName;
    const finalNameSource = providedFirstName
      ? 'MANUAL'
      : String(resolvedName.source).toUpperCase();

    // Determine avatar URL - use merged profile avatar, or fallback to Clerk avatar
    const mergedAvatarUrl = filterBase64Avatar(mergedProfile.avatarUrl);
    const finalAvatarUrl = mergedAvatarUrl || clerkUser?.imageUrl || null;
    const finalAvatarSource = mergedAvatarUrl
      ? toDataSource(mergedProfile.avatarUrlSource)
      : 'MANUAL';

    // Create or update profile
    if (!user.profile) {
      // Create new profile
      const profile = await db.profile.create({
        data: {
          userId: user.id,
          handle,
          resumeTitle:
            [finalFirstName, finalLastName].filter(Boolean).join(' ').trim() || 'Untitled Resume',
          firstName: finalFirstName,
          lastName: finalLastName,
          headline: mergedProfile.headline,
          summary: mergedProfile.summary,
          location: mergedProfile.location,
          avatarUrl: finalAvatarUrl,
          status: 'PUBLIC', // Make profile public by default
          resumeVisibility: 'PRIVATE', // Resume private by default
          portfolioVisibility: 'PUBLIC', // Portfolio public by default
          // Set sources for provenance
          firstNameSource: toDataSource(finalNameSource),
          lastNameSource: toDataSource(finalNameSource),
          headlineSource: toDataSource(mergedProfile.headlineSource),
          summarySource: toDataSource(mergedProfile.summarySource),
          locationSource: toDataSource(mergedProfile.locationSource),
          avatarUrlSource: finalAvatarSource,
        },
      });

      await db.user.update({
        where: { id: user.id },
        data: {
          profile: {
            connect: { id: profile.id },
          },
        },
      });

      // Create contact info - signup email is always primary
      // ALL imported emails (from all sources) go to additionalEmails
      const signupEmail = user.email;

      // Build additionalEmails array from ALL collected emails, excluding signup email
      const additionalEmails = resolveEmails(
        signupEmail,
        mergedProfile.allEmails.map((e) => ({ email: e.email, source: e.source }))
      ).additionalEmails;

      console.log('[Onboarding Complete] Signup email:', signupEmail);
      console.log('[Onboarding Complete] All collected emails:', mergedProfile.allEmails);
      console.log('[Onboarding Complete] Additional emails:', additionalEmails);

      await db.contactInfo.create({
        data: {
          profileId: profile.id,
          email: signupEmail, // Signup email is always primary
          emailSource: 'MANUAL', // Signup email source is always MANUAL
          emailPublic: false,
          phone: mergedProfile.phone,
          phoneSource: toDataSource(mergedProfile.phoneSource),
          phonePublic: false,
          website: mergedProfile.website,
          additionalEmails: additionalEmails.length > 0 ? additionalEmails : undefined,
        },
      });

      // Create skills
      if (mergedProfile.skills?.length) {
        await db.skill.createMany({
          data: mergedProfile.skills.map((skill, index) => ({
            profileId: profile.id,
            name: skill.name,
            source: toDataSource(skill.source),
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }

      // Create projects
      if (mergedProfile.projects?.length) {
        await db.project.createMany({
          data: mergedProfile.projects.map((project, index) => ({
            profileId: profile.id,
            title: project.title,
            description: project.description,
            shortDesc: project.shortDesc,
            url: project.url,
            repoUrl: project.repoUrl,
            techStack: project.techStack || [],
            featured: project.featured || index < 3,
            source: toDataSource(project.source),
            sortOrder: index,
            // Enhanced GitHub fields
            githubStars: project.ghStars,
            githubForks: project.ghForks,
            githubLanguage: project.ghLanguage,
            githubTopics: project.ghTopics || [],
            githubOwner: project.ghOwner,
            githubRepo: project.ghRepo,
            githubReadme: project.ghReadme,
            githubPinned: project.ghPinned || false,
            githubLastPush: project.ghLastPush || null,
            githubLicense: project.ghLicense,
            githubWatchers: project.ghWatchers,
            // Smart visibility defaults
            isVisible: getProjectVisibilityDefaults(project).isVisible,
            showOnPortfolio: getProjectVisibilityDefaults(project).showOnPortfolio,
            showOnResume: getProjectVisibilityDefaults(project).showOnResume,
            showStats: getProjectVisibilityDefaults(project).showStats,
            showReadme: getProjectVisibilityDefaults(project).showReadme,
          })),
        });
      }

      // Create work experiences
      if (mergedProfile.experiences?.length) {
        await db.workExperience.createMany({
          data: mergedProfile.experiences.map((exp, index) => ({
            profileId: profile.id,
            company: exp.company,
            role: exp.role,
            location: exp.location,
            startDate: exp.startDate ? new Date(exp.startDate) : new Date(),
            endDate: exp.endDate ? new Date(exp.endDate) : null,
            isCurrent: exp.isCurrent || false,
            bullets: exp.bullets || [],
            tags: exp.tags || [],
            source: toDataSource(exp.source),
            sortOrder: index,
          })),
        });
      }

      // Create education
      if (mergedProfile.educations?.length) {
        await db.education.createMany({
          data: mergedProfile.educations.map((edu, index) => ({
            profileId: profile.id,
            institution: edu.institution,
            degree: edu.degree,
            fieldOfStudy: edu.fieldOfStudy,
            startDate: edu.startDate ? new Date(edu.startDate) : null,
            endDate: edu.endDate ? new Date(edu.endDate) : null,
            isCurrent: edu.isCurrent || false,
            gpa: edu.gpa,
            source: toDataSource(edu.source),
            sortOrder: index,
          })),
        });
      }

      // Create links
      if (mergedProfile.links?.length) {
        await db.link.createMany({
          data: mergedProfile.links.map((link, index) => ({
            profileId: profile.id,
            type: mapLinkType(link.type),
            url: link.url,
            label: link.label,
            source: toDataSource(link.source),
            sortOrder: index,
          })),
        });
      }

      // Add manual links (deduplicate against imported links)
      if (manualLinks?.length) {
        const existingUrls = new Set((mergedProfile.links || []).map((l) => l.url.toLowerCase()));
        const newManualLinks = manualLinks.filter(
          (l) => l.url && !existingUrls.has(l.url.toLowerCase())
        );

        if (newManualLinks.length) {
          const startOrder = mergedProfile.links?.length || 0;
          await db.link.createMany({
            data: newManualLinks.map((link, index) => ({
              profileId: profile.id,
              type: 'OTHER' as const,
              url: link.url,
              label: link.label,
              source: 'MANUAL' as const,
              sortOrder: startOrder + index,
            })),
          });
        }
      }
    } else {
      // Update existing profile (merge mode)
      await db.profile.update({
        where: { id: user.profile.id },
        data: {
          firstName: mergedProfile.firstName || user.profile.firstName,
          lastName: mergedProfile.lastName || user.profile.lastName,
          headline: mergedProfile.headline || user.profile.headline,
          summary: mergedProfile.summary || user.profile.summary,
          location: mergedProfile.location || user.profile.location,
          avatarUrl: filterBase64Avatar(mergedProfile.avatarUrl) || user.profile.avatarUrl,
          // TODO: Uncomment after running migration
          // isAutoGenerated: true,
          // autoGeneratedAt: new Date(),
        },
      });

      // Merge skills (avoid duplicates)
      if (mergedProfile.skills?.length) {
        for (const skill of mergedProfile.skills) {
          await db.skill.upsert({
            where: {
              profileId_name: {
                profileId: user.profile.id,
                name: skill.name,
              },
            },
            create: {
              profileId: user.profile.id,
              name: skill.name,
              source: toDataSource(skill.source),
              sortOrder: 0,
            },
            update: {}, // Don't update if exists
          });
        }
      }

      // Add new projects (dedupe by repoUrl or title)
      if (mergedProfile.projects?.length) {
        const existingProjects = await db.project.findMany({
          where: { profileId: user.profile.id },
          select: { title: true, repoUrl: true },
        });

        const existingKeys = new Set(
          existingProjects.map((p) => p.repoUrl || p.title.toLowerCase())
        );

        const newProjects = mergedProfile.projects.filter(
          (p) => !existingKeys.has(p.repoUrl || p.title.toLowerCase())
        );

        if (newProjects.length) {
          await db.project.createMany({
            data: newProjects.map((project, index) => ({
              profileId: user.profile!.id,
              title: project.title,
              description: project.description,
              shortDesc: project.shortDesc,
              url: project.url,
              repoUrl: project.repoUrl,
              techStack: project.techStack || [],
              featured: project.featured || false,
              source: toDataSource(project.source),
              sortOrder: existingProjects.length + index,
              // Enhanced GitHub fields
              githubStars: project.ghStars,
              githubForks: project.ghForks,
              githubLanguage: project.ghLanguage,
              githubTopics: project.ghTopics || [],
              githubOwner: project.ghOwner,
              githubRepo: project.ghRepo,
              githubReadme: project.ghReadme,
              githubPinned: project.ghPinned || false,
              githubLastPush: project.ghLastPush || null,
              githubLicense: project.ghLicense,
              githubWatchers: project.ghWatchers,
              // Smart visibility defaults
              isVisible: getProjectVisibilityDefaults(project).isVisible,
              showOnPortfolio: getProjectVisibilityDefaults(project).showOnPortfolio,
              showOnResume: getProjectVisibilityDefaults(project).showOnResume,
              showStats: getProjectVisibilityDefaults(project).showStats,
              showReadme: getProjectVisibilityDefaults(project).showReadme,
            })),
          });
        }
      }
    }

    // TODO: Uncomment after running migration
    // Mark onboarding as completed
    // await db.user.update({
    //   where: { id: user.id },
    //   data: {
    //     onboardingCompleted: true,
    //     onboardingCompletedAt: new Date(),
    //   },
    // });

    // Sync avatar to Clerk (fire and forget - don't block the response).
    // Skip sync for Clerk URLs and local serving URLs (/api/photos/).
    const avatarToSync = mergedProfile.avatarUrl || user.profile?.avatarUrl;
    const isAlreadyOnClerk = avatarToSync?.includes('img.clerk.com');
    const isLocalUrl = avatarToSync?.startsWith('/api/photos/');
    if (avatarToSync && !isAlreadyOnClerk && !isLocalUrl) {
      syncAvatarToClerk(userId, avatarToSync).catch((err) => {
        console.error('[Onboarding Complete] Failed to sync avatar to Clerk:', err);
      });
    }

    // Generate AI-enriched portfolio (fire and forget - don't block the response)
    const profileId = user.profile?.id;
    if (profileId) {
      import('@/services/portfolio/enhanced-generation.service')
        .then(({ generateEnhancedPortfolio }) => generateEnhancedPortfolio(profileId))
        .then((result) => {
          console.log('[Onboarding Complete] Portfolio generated:', result.portfolioId);
        })
        .catch((err) => {
          console.error('[Onboarding Complete] Failed to generate portfolio:', err);
        });
    }

    return NextResponse.json({
      success: true,
      handle,
      message: 'Profile created successfully',
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handle reviewed data from the step-by-step review flow
 * This data has already been verified/edited by the user
 */
async function handleReviewedData(
  user: User & { profile: Profile | null },
  reviewedData: ReviewedData,
  providedHandle?: string,
  providedFirstName?: string,
  providedLastName?: string,
  clerkAvatarUrl?: string | null,
  galleryPhotos?: string[],
  originalAvatarDataUrl?: string
) {
  console.log('[handleReviewedData] Starting with reviewed data');
  console.log('[handleReviewedData] Experiences count:', reviewedData.experiences?.length || 0);
  console.log('[handleReviewedData] Educations count:', reviewedData.educations?.length || 0);
  console.log('[handleReviewedData] Skills count:', reviewedData.skills?.length || 0);
  console.log('[handleReviewedData] Links count:', reviewedData.links?.length || 0);

  // Generate or validate handle
  let handle =
    providedHandle ||
    generateHandle(
      providedFirstName || reviewedData.profile.firstName,
      providedLastName || reviewedData.profile.lastName,
      user.email
    );

  // Check if provided handle is available
  if (providedHandle) {
    const existingHandle = await db.profile.findUnique({
      where: { handle: providedHandle },
      select: { id: true },
    });
    if (existingHandle && (!user.profile || existingHandle.id !== user.profile.id)) {
      return NextResponse.json(
        { error: 'Handle is already taken', message: 'Please choose a different handle' },
        { status: 409 }
      );
    }
  } else {
    handle = await ensureUniqueHandle(handle, user.profile?.id);
  }

  const finalFirstName = providedFirstName || reviewedData.profile.firstName || 'New';
  const finalLastName = providedLastName || reviewedData.profile.lastName;

  // Create or update profile
  let profileId: string;

  // Filter out base64 avatars for database storage (they'll still be synced to Clerk)
  // Use Clerk avatar as fallback if no avatar provided in reviewed data
  const avatarUrlForDb =
    filterBase64Avatar(reviewedData.profile.avatarUrl) || clerkAvatarUrl || null;

  if (!user.profile) {
    // Create new profile
    const profile = await db.profile.create({
      data: {
        userId: user.id,
        handle,
        resumeTitle:
          [finalFirstName, finalLastName].filter(Boolean).join(' ').trim() || 'Untitled Resume',
        firstName: finalFirstName,
        lastName: finalLastName,
        headline: reviewedData.profile.headline,
        summary: reviewedData.profile.summary,
        location: reviewedData.profile.location,
        avatarUrl: avatarUrlForDb,
        status: 'PUBLIC',
        resumeVisibility: 'PRIVATE',
        portfolioVisibility: 'PUBLIC',
      },
    });

    await db.user.update({
      where: { id: user.id },
      data: {
        profile: {
          connect: { id: profile.id },
        },
      },
    });

    profileId = profile.id;
    console.log('[handleReviewedData] Created new profile:', profileId);
  } else {
    // Update existing profile
    await db.profile.update({
      where: { id: user.profile.id },
      data: {
        firstName: finalFirstName,
        lastName: finalLastName,
        headline: reviewedData.profile.headline || user.profile.headline,
        summary: reviewedData.profile.summary || user.profile.summary,
        location: reviewedData.profile.location || user.profile.location,
        avatarUrl: avatarUrlForDb || user.profile.avatarUrl,
      },
    });
    profileId = user.profile.id;
    console.log('[handleReviewedData] Updated existing profile:', profileId);

    // For existing profile, delete old imported data before re-creating
    // This prevents duplicates when re-uploading resume
    console.log('[handleReviewedData] Cleaning up old imported data for re-import');
    await Promise.all([
      db.skill.deleteMany({ where: { profileId, source: 'RESUME' } }),
      db.workExperience.deleteMany({ where: { profileId, source: 'RESUME' } }),
      db.education.deleteMany({ where: { profileId, source: 'RESUME' } }),
      db.link.deleteMany({ where: { profileId, source: 'RESUME' } }),
      // Also clean up GitHub and resume projects when re-importing
      db.project.deleteMany({ where: { profileId, source: { in: ['RESUME', 'GITHUB'] } } }),
    ]);
  }

  // Create contact info
  // User may have chosen a different primary email during review
  const signupEmail = user.email; // This is always the Clerk signup email

  // Fetch existing contact info to merge additional emails (if updating)
  const existingContactInfo = await db.contactInfo.findUnique({
    where: { profileId },
    select: { additionalEmails: true },
  });

  // Determine primary email based on user's choice (primaryEmailIndex)
  const allEmails = reviewedData.contactInfo?.allEmails || [];
  const primaryEmailIndex = reviewedData.contactInfo?.primaryEmailIndex ?? 0;
  const chosenPrimaryEmail = allEmails[primaryEmailIndex]?.email || signupEmail;
  const chosenPrimarySource = allEmails[primaryEmailIndex]?.source || 'MANUAL';

  console.log('[handleReviewedData] User chose primary email:', chosenPrimaryEmail);
  console.log('[handleReviewedData] Primary email source:', chosenPrimarySource);

  // Build additional emails: all emails except the chosen primary
  const seenEmails = new Set<string>();
  seenEmails.add(chosenPrimaryEmail.toLowerCase()); // Exclude the primary

  const additionalEmails: Array<{ email: string; source: string }> = [];

  // Add all other emails from the allEmails list
  for (let i = 0; i < allEmails.length; i++) {
    if (i === primaryEmailIndex) continue; // Skip primary
    const normalized = allEmails[i].email.toLowerCase().trim();
    if (!seenEmails.has(normalized)) {
      seenEmails.add(normalized);
      additionalEmails.push(allEmails[i]);
    }
  }

  // Also merge existing additional emails (if any)
  const existingEmails =
    (existingContactInfo?.additionalEmails as Array<{ email: string; source: string }>) || [];
  for (const entry of existingEmails) {
    const normalized = entry.email.toLowerCase().trim();
    if (!seenEmails.has(normalized)) {
      seenEmails.add(normalized);
      additionalEmails.push(entry);
    }
  }

  console.log('[handleReviewedData] Additional emails:', additionalEmails);

  // Determine primary phone based on user's choice (primaryPhoneIndex)
  const allPhones = reviewedData.contactInfo?.allPhones || [];
  const primaryPhoneIndex = reviewedData.contactInfo?.primaryPhoneIndex ?? 0;
  const selectedPhone = allPhones[primaryPhoneIndex];
  // Support both new format (countryCode + number) and legacy (phone)
  const primaryPhoneNumber =
    selectedPhone?.number || selectedPhone?.phone || reviewedData.contactInfo?.phone;
  const primaryPhoneCountryCode = selectedPhone?.countryCode || null;
  // Compose full phone string for backward compat
  const primaryPhone =
    primaryPhoneCountryCode && primaryPhoneNumber
      ? `${primaryPhoneCountryCode} ${primaryPhoneNumber}`.trim()
      : primaryPhoneNumber;
  const phoneSource = selectedPhone?.source || reviewedData.contactInfo?.phoneSource || 'RESUME';

  console.log(
    '[handleReviewedData] Primary phone:',
    primaryPhone,
    'Country code:',
    primaryPhoneCountryCode
  );

  await db.contactInfo.upsert({
    where: { profileId },
    create: {
      profileId,
      email: chosenPrimaryEmail,
      emailSource: toDataSource(chosenPrimarySource),
      emailPublic: false,
      phone: primaryPhone,
      phoneCountryCode: primaryPhoneCountryCode,
      phoneNumber: primaryPhoneNumber,
      phoneSource: primaryPhone ? toDataSource(phoneSource) : undefined,
      phonePublic: false,
      additionalEmails: additionalEmails.length > 0 ? additionalEmails : undefined,
    },
    update: {
      email: chosenPrimaryEmail,
      emailSource: toDataSource(chosenPrimarySource),
      phone: primaryPhone,
      phoneCountryCode: primaryPhoneCountryCode,
      phoneNumber: primaryPhoneNumber,
      phoneSource: primaryPhone ? toDataSource(phoneSource) : undefined,
      additionalEmails: additionalEmails.length > 0 ? additionalEmails : undefined,
    },
  });

  // Create skills
  if (reviewedData.skills?.length) {
    console.log('[handleReviewedData] Creating skills:', reviewedData.skills);
    await db.skill.createMany({
      data: reviewedData.skills.map((skill, index) => ({
        profileId,
        name: skill,
        source: 'RESUME' as const,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
  }

  // Create work experiences
  if (reviewedData.experiences?.length) {
    console.log('[handleReviewedData] Creating experiences:', reviewedData.experiences.length);
    for (const [index, exp] of reviewedData.experiences.entries()) {
      const startDate = safeParseDate(exp.startDate);
      const endDate = safeParseDate(exp.endDate);

      await db.workExperience.create({
        data: {
          profileId,
          company: exp.company || 'Unknown Company',
          role: exp.role || 'Unknown Role',
          location: exp.location,
          startDate: startDate || new Date(), // Default to now if invalid
          endDate: endDate,
          isCurrent: exp.isCurrent || !endDate,
          bullets: exp.bullets || [],
          tags: [],
          source: 'RESUME' as const,
          sortOrder: index,
        },
      });
    }
    console.log('[handleReviewedData] Created all experiences');
  }

  // Create education
  if (reviewedData.educations?.length) {
    console.log('[handleReviewedData] Creating educations:', reviewedData.educations.length);
    for (const [index, edu] of reviewedData.educations.entries()) {
      const startDate = safeParseDate(edu.startDate);
      const endDate = safeParseDate(edu.endDate);

      await db.education.create({
        data: {
          profileId,
          institution: edu.institution || 'Unknown Institution',
          degree: edu.degree,
          fieldOfStudy: edu.fieldOfStudy,
          startDate: startDate,
          endDate: endDate,
          isCurrent: false,
          gpa: edu.gpa,
          source: 'RESUME' as const,
          sortOrder: index,
        },
      });
    }
    console.log('[handleReviewedData] Created all educations');
  }

  // Create links (deduplicate by URL to prevent duplicates from multiple sources)
  if (reviewedData.links?.length) {
    const seenUrls = new Set<string>();
    const uniqueLinks = reviewedData.links.filter((link) => {
      const url = link.url?.toLowerCase().trim();
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
    console.log(
      '[handleReviewedData] Creating links:',
      uniqueLinks.length,
      '(from',
      reviewedData.links.length,
      'total)'
    );
    await db.link.createMany({
      data: uniqueLinks.map((link, index) => ({
        profileId,
        type: mapLinkType(link.type),
        url: link.url,
        label: link.label,
        source: 'RESUME' as const,
        sortOrder: index,
      })),
    });
  }

  // Create projects (from GitHub and/or resume)
  if (reviewedData.projects?.length) {
    console.log('[handleReviewedData] Creating projects:', reviewedData.projects.length);

    for (const [index, project] of reviewedData.projects.entries()) {
      // Use user-provided visibility settings if available, otherwise compute smart defaults
      const hasUserVisibilitySettings =
        project.isVisible !== undefined ||
        project.showOnPortfolio !== undefined ||
        project.showOnResume !== undefined;

      const visibilityDefaults = hasUserVisibilitySettings
        ? {
            isVisible: project.isVisible ?? true,
            showOnPortfolio: project.showOnPortfolio ?? true,
            showOnResume: project.showOnResume ?? false,
            showStats: project.showStats ?? false,
            showReadme: project.showReadme ?? false,
          }
        : getProjectVisibilityDefaults({
            title: project.title,
            description: project.description,
            ghPinned: project.ghPinned ?? project.githubPinned,
            ghStars: project.ghStars ?? project.githubStars,
            ghForks: project.ghForks ?? project.githubForks,
            repoUrl: project.repoUrl,
          });

      await db.project.create({
        data: {
          profileId,
          title: project.title || 'Untitled Project',
          description: project.customDescription || project.description,
          techStack: project.technologies || project.techStack || [],
          repoUrl: project.repoUrl,
          url: project.liveUrl || project.url,
          // GitHub-specific fields
          githubStars: project.ghStars ?? project.githubStars,
          githubForks: project.ghForks ?? project.githubForks,
          githubLanguage: project.ghLanguage || project.githubLanguage,
          githubPinned: project.ghPinned ?? project.githubPinned ?? false,
          githubTopics: project.ghTopics || project.githubTopics || [],
          githubOwner: project.ghOwner || project.githubOwner,
          githubRepo: project.ghRepo || project.githubRepo,
          githubReadme: project.ghReadme || project.githubReadme,
          githubLastPush: project.ghLastPush
            ? new Date(project.ghLastPush)
            : project.githubLastPush
              ? new Date(project.githubLastPush)
              : null,
          githubLicense: project.ghLicense || project.githubLicense,
          githubWatchers: project.ghWatchers ?? project.githubWatchers,
          // Visibility controls
          isVisible: visibilityDefaults.isVisible,
          showOnPortfolio: visibilityDefaults.showOnPortfolio,
          showOnResume: visibilityDefaults.showOnResume,
          showStats: visibilityDefaults.showStats,
          showReadme: visibilityDefaults.showReadme,
          // Source detection
          source: project.repoUrl?.includes('github.com') ? 'GITHUB' : 'RESUME',
          sortOrder: index,
        },
      });
    }
    console.log('[handleReviewedData] Created all projects');
  }

  // ── Save profile photo as ProfilePhoto record ───────────────────────
  // If the client uploaded a photo, save the original full-resolution
  // version as a PROFILE photo.  The serving endpoint /api/photos/[id]
  // will stream the image bytes with proper caching.  Profile.avatarUrl
  // is then pointed at this serving URL so the portfolio renders the
  // full-quality image instead of Clerk’s 512×512 compressed copy.
  const photoToStore = originalAvatarDataUrl || avatarUrlForDb;
  if (photoToStore) {
    try {
      // Remove any previous PROFILE photo for this profile to avoid duplicates
      await db.profilePhoto.deleteMany({
        where: { profileId, category: 'PROFILE' },
      });

      const profilePhoto = await db.profilePhoto.create({
        data: {
          profileId,
          url: photoToStore,
          category: 'PROFILE',
          source: 'MANUAL',
          sortOrder: 0,
        },
      });

      // Update Profile.avatarUrl to serve the full-resolution photo.
      // For data URLs (uploaded photos), use the serving endpoint.
      // For HTTP URLs (GitHub/LinkedIn), store directly.
      const servingUrl = photoToStore.startsWith('data:')
        ? `/api/photos/${profilePhoto.id}`
        : photoToStore;

      await db.profile.update({
        where: { id: profileId },
        data: { avatarUrl: servingUrl },
      });

      console.log('[handleReviewedData] Saved original-quality ProfilePhoto and updated avatarUrl');
    } catch (err) {
      console.error('[handleReviewedData] Failed to save original ProfilePhoto:', err);
    }
  }

  // ── Save gallery photos as ProfilePhoto records ─────────────────────
  if (galleryPhotos?.length) {
    console.log('[handleReviewedData] Saving gallery photos:', galleryPhotos.length);
    try {
      const lastGalleryPhoto = await db.profilePhoto.findFirst({
        where: { profileId, category: 'GALLERY' },
        orderBy: { sortOrder: 'desc' },
      });
      let nextSortOrder = (lastGalleryPhoto?.sortOrder ?? -1) + 1;

      for (const photoUrl of galleryPhotos) {
        if (!photoUrl || photoUrl.startsWith('indexeddb:')) continue; // Skip unresolved refs
        await db.profilePhoto.create({
          data: {
            profileId,
            url: photoUrl,
            category: 'GALLERY',
            source: 'MANUAL',
            sortOrder: nextSortOrder++,
          },
        });
      }
      console.log('[handleReviewedData] Created gallery photo records');
    } catch (err) {
      console.error('[handleReviewedData] Failed to save gallery photos:', err);
    }
  }

  // ── Create default ProfileSections ──────────────────────────────
  // These are required for the resume/portfolio view to render body sections.
  // Without them, only the header appears.
  const DEFAULT_SECTIONS: { type: SectionType; title: string }[] = [
    { type: 'BASIC_INFO', title: 'Header' },
    { type: 'PHOTOS', title: 'Photos' },
    { type: 'SUMMARY', title: 'Summary' },
    { type: 'EXPERIENCE', title: 'Experience' },
    { type: 'EDUCATION', title: 'Education' },
    { type: 'SKILLS', title: 'Skills' },
    { type: 'PROJECTS', title: 'Projects' },
    { type: 'LINKS', title: 'Links' },
    { type: 'AWARDS', title: 'Awards' },
    { type: 'CERTIFICATIONS', title: 'Certifications' },
  ];

  try {
    const existingSections = await db.profileSection.findMany({
      where: { profileId },
      select: { type: true },
    });
    const existingTypes = new Set(existingSections.map((s) => s.type));
    const missingSections = DEFAULT_SECTIONS.filter((s) => !existingTypes.has(s.type));

    if (missingSections.length > 0) {
      const baseOrder = existingSections.length;
      await db.profileSection.createMany({
        data: missingSections.map((config, index) => ({
          profileId,
          type: config.type,
          title: config.title,
          sortOrder: baseOrder + index,
          isVisible: true,
        })),
      });
      console.log(
        '[handleReviewedData] Created',
        missingSections.length,
        'default ProfileSections'
      );
    }
  } catch (err) {
    console.error('[handleReviewedData] Failed to create ProfileSections:', err);
  }

  console.log('[handleReviewedData] Complete! Profile handle:', handle);

  // Sync avatar to Clerk (fire and forget - don't block the response).
  // Skip sync for Clerk URLs (client already uploaded) and local serving
  // URLs (/api/photos/) which are not accessible from Clerk's servers.
  const avatarToSync = reviewedData.profile.avatarUrl || user.profile?.avatarUrl;
  const isAlreadyOnClerk = avatarToSync?.includes('img.clerk.com');
  const isLocalPhotoUrl = avatarToSync?.startsWith('/api/photos/');
  console.log(
    '[handleReviewedData] Avatar to sync:',
    avatarToSync ? `${avatarToSync.substring(0, 50)}... (length: ${avatarToSync.length})` : 'none',
    isAlreadyOnClerk ? '(already on Clerk, skipping sync)' : '',
    isLocalPhotoUrl ? '(local serving URL, skipping sync)' : ''
  );

  if (avatarToSync && !isAlreadyOnClerk && !isLocalPhotoUrl) {
    // Check if it's still an indexeddb reference (shouldn't be, but just in case)
    if (avatarToSync.startsWith('indexeddb:')) {
      console.error(
        '[handleReviewedData] Avatar is still an IndexedDB reference! Client should have resolved this.'
      );
    } else {
      syncAvatarToClerk(user.clerkId, avatarToSync)
        .then((result) => {
          if (result.success) {
            console.log('[handleReviewedData] Successfully synced avatar to Clerk');
          } else {
            console.error('[handleReviewedData] Failed to sync avatar to Clerk:', result.error);
          }
        })
        .catch((err) => {
          console.error('[handleReviewedData] Error syncing avatar to Clerk:', err);
        });
    }
  }

  // Generate AI-enriched portfolio (awaited so the template portfolio is ready
  // before the user lands on their profile page after onboarding)
  if (profileId) {
    try {
      const { generateEnhancedPortfolio } =
        await import('@/services/portfolio/enhanced-generation.service');
      const result = await generateEnhancedPortfolio(profileId);
      console.log('[handleReviewedData] Portfolio generated:', result.portfolioId);
    } catch (err) {
      // Don't fail onboarding if portfolio generation fails — user can regenerate later
      console.error('[handleReviewedData] Failed to generate portfolio:', err);
    }
  }

  return NextResponse.json({
    success: true,
    handle,
    message: 'Profile created successfully',
  });
}

/**
 * Merge data from multiple import sources
 * Handles different data formats from resume, GitHub, LinkedIn APIs
 *
 * Name Precedence: Signup > Resume > LinkedIn > GitHub
 * Email: Signup is primary, all unique emails collected for additionalEmails
 */
function mergeImportedData(importedData: Record<string, unknown>) {
  const merged: {
    firstName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
    avatarUrl?: string;
    email?: string;
    emailSource?: string;
    phone?: string;
    phoneSource?: string;
    website?: string;
    firstNameSource?: string;
    lastNameSource?: string;
    headlineSource?: string;
    summarySource?: string;
    locationSource?: string;
    avatarUrlSource?: string;
    // Collect ALL emails from all sources
    allEmails: Array<{ email: string; source: string }>;
    // Collect ALL phones from all sources (supports both formats)
    allPhones: Array<{
      phone?: string;
      countryCode?: string | null;
      number?: string;
      source: string;
    }>;
    skills: Array<{ name: string; source: string }>;
    projects: Array<{
      title: string;
      description?: string;
      shortDesc?: string;
      url?: string;
      repoUrl?: string;
      techStack?: string[];
      featured?: boolean;
      source: string;
      // GitHub fields
      ghStars?: number;
      ghForks?: number;
      ghLanguage?: string;
      ghTopics?: string[];
      ghOwner?: string;
      ghRepo?: string;
      ghReadme?: string;
      ghPinned?: boolean;
      ghLastPush?: Date;
      ghLicense?: string;
      ghWatchers?: number;
    }>;
    experiences: Array<{
      company: string;
      role: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      isCurrent?: boolean;
      bullets?: string[];
      tags?: string[];
      source: string;
    }>;
    educations: Array<{
      institution: string;
      degree?: string;
      fieldOfStudy?: string;
      startDate?: string;
      endDate?: string;
      isCurrent?: boolean;
      gpa?: string;
      source: string;
    }>;
    links: Array<{
      type: string;
      url: string;
      label?: string;
      source: string;
    }>;
  } = {
    allEmails: [],
    allPhones: [],
    skills: [],
    projects: [],
    experiences: [],
    educations: [],
    links: [],
  };

  // Check for bestAvatarUrl passed from the import page
  // This is the highest resolution image selected by comparing all sources
  if (importedData.bestAvatarUrl) {
    merged.avatarUrl = importedData.bestAvatarUrl as string;
    merged.avatarUrlSource = 'MANUAL'; // Could be from upload or best resolution selection
    console.log('[mergeImportedData] Using bestAvatarUrl:', merged.avatarUrl?.substring(0, 100));
  }

  // Priority: resume > github > linkedin > manual links
  const sources = ['resume', 'github', 'linkedin', 'links'];

  for (const sourceKey of sources) {
    const rawData = importedData[sourceKey] as Record<string, unknown> | undefined;
    if (!rawData) continue;

    // Determine the source type
    const sourceType = sourceKey.toUpperCase();

    // Handle resume format (profile nested under 'profile' key, experiences under 'experiences')
    if (sourceKey === 'resume') {
      // Profile data is nested under 'profile' key in resume format
      const profileData = rawData.profile as Record<string, unknown> | undefined;
      if (profileData) {
        if (!merged.firstName && profileData.firstName) {
          merged.firstName = profileData.firstName as string;
          merged.firstNameSource = 'RESUME';
        }
        if (!merged.lastName && profileData.lastName) {
          merged.lastName = profileData.lastName as string;
          merged.lastNameSource = 'RESUME';
        }
        if (!merged.headline && profileData.headline) {
          merged.headline = profileData.headline as string;
          merged.headlineSource = 'RESUME';
        }
        if (!merged.summary && profileData.summary) {
          merged.summary = profileData.summary as string;
          merged.summarySource = 'RESUME';
        }
        if (!merged.location && profileData.location) {
          merged.location = profileData.location as string;
          merged.locationSource = 'RESUME';
        }
      }

      // Contact info from resume - collect ALL emails and phones
      const contactInfo = rawData.contactInfo as Record<string, unknown> | undefined;
      if (contactInfo) {
        // Collect email (first wins for primary, but also add to allEmails)
        if (contactInfo.email) {
          const emailStr = contactInfo.email as string;
          merged.allEmails.push({ email: emailStr, source: 'RESUME' });
          if (!merged.email) {
            merged.email = emailStr;
            merged.emailSource = 'RESUME';
          }
        }
        // Collect phone (first wins for primary, but also add to allPhones)
        if (contactInfo.phone) {
          const phoneStr = contactInfo.phone as string;
          merged.allPhones.push({ phone: phoneStr, source: 'RESUME' });
          if (!merged.phone) {
            merged.phone = phoneStr;
            merged.phoneSource = 'RESUME';
          }
        }
      }

      // Work experiences from resume (uses 'experiences' key, not 'workExperiences')
      const experiences = rawData.experiences as Array<Record<string, unknown>> | undefined;
      if (experiences?.length) {
        merged.experiences.push(
          ...experiences.map((exp) => ({
            company: (exp.company as string) || 'Unknown Company',
            role: (exp.title as string) || (exp.role as string) || 'Unknown Role',
            location: exp.location as string | undefined,
            startDate: exp.startDate as string | undefined,
            endDate: exp.endDate as string | undefined,
            isCurrent: exp.isCurrent as boolean | undefined,
            bullets: exp.bullets as string[] | undefined,
            source: 'RESUME',
          }))
        );
      }

      // Education from resume
      const educations = rawData.educations as Array<Record<string, unknown>> | undefined;
      if (educations?.length) {
        merged.educations.push(
          ...educations.map((edu) => ({
            institution: (edu.institution as string) || 'Unknown Institution',
            degree: edu.degree as string | undefined,
            fieldOfStudy: edu.fieldOfStudy as string | undefined,
            startDate: edu.startDate as string | undefined,
            endDate: edu.endDate as string | undefined,
            gpa: edu.gpa as string | undefined,
            source: 'RESUME',
          }))
        );
      }

      // Skills from resume
      const skills = rawData.skills as Array<{ name: string } | string> | undefined;
      if (skills?.length) {
        for (const skill of skills) {
          const skillName = typeof skill === 'string' ? skill : skill.name;
          if (skillName) {
            merged.skills.push({ name: skillName, source: 'RESUME' });
          }
        }
      }

      // Links from resume
      const links = rawData.links as Array<Record<string, unknown>> | undefined;
      if (links?.length) {
        merged.links.push(
          ...links.map((link) => ({
            type: (link.type as string) || 'OTHER',
            url: link.url as string,
            label: link.label as string | undefined,
            source: 'RESUME',
          }))
        );
      }

      continue;
    }

    // Handle GitHub/LinkedIn format (with profile object)
    const data = rawData as unknown as NormalizedImportResult;

    // Profile info (first wins)
    if (data.profile) {
      if (!merged.firstName && data.profile.firstName) {
        merged.firstName = data.profile.firstName;
        merged.firstNameSource = sourceType;
      }
      if (!merged.lastName && data.profile.lastName) {
        merged.lastName = data.profile.lastName;
        merged.lastNameSource = sourceType;
      }
      if (!merged.headline && data.profile.headline) {
        merged.headline = data.profile.headline;
        merged.headlineSource = sourceType;
      }
      if (!merged.summary && data.profile.summary) {
        merged.summary = data.profile.summary;
        merged.summarySource = sourceType;
      }
      if (!merged.location && data.profile.location) {
        merged.location = data.profile.location;
        merged.locationSource = sourceType;
      }
      if (!merged.avatarUrl && data.profile.avatarUrl) {
        merged.avatarUrl = data.profile.avatarUrl;
        merged.avatarUrlSource = sourceType;
      }
    }

    // Contact info - collect ALL emails and phones from all sources
    if (data.contactInfo) {
      // Collect email
      if (data.contactInfo.email) {
        merged.allEmails.push({ email: data.contactInfo.email, source: sourceType });
        if (!merged.email) {
          merged.email = data.contactInfo.email;
          merged.emailSource = sourceType;
        }
      }
      // Collect phone
      if (data.contactInfo.phone) {
        merged.allPhones.push({ phone: data.contactInfo.phone, source: sourceType });
        if (!merged.phone) {
          merged.phone = data.contactInfo.phone;
          merged.phoneSource = sourceType;
        }
      }
      if (!merged.website && data.contactInfo.website) {
        merged.website = data.contactInfo.website;
      }
    }

    // Append arrays (dedupe later)
    if (data.skills?.length) {
      merged.skills.push(...data.skills.map((s) => ({ name: s.name, source: sourceType })));
    }
    if (data.projects?.length) {
      merged.projects.push(...data.projects.map((p) => ({ ...p, source: sourceType })));
    }
    if (data.experiences?.length) {
      merged.experiences.push(...data.experiences.map((e) => ({ ...e, source: sourceType })));
    }
    if (data.educations?.length) {
      merged.educations.push(...data.educations.map((e) => ({ ...e, source: sourceType })));
    }
    if (data.links?.length) {
      // Use the link's own source if available, otherwise use the import source type
      merged.links.push(
        ...data.links.map((l) => ({
          ...l,
          source: (l as { source?: string }).source || sourceType,
        }))
      );
    }
  }

  // Deduplicate skills
  const seenSkills = new Set<string>();
  merged.skills = merged.skills.filter((s) => {
    const key = s.name.toLowerCase();
    if (seenSkills.has(key)) return false;
    seenSkills.add(key);
    return true;
  });

  // Deduplicate projects by repoUrl or title
  const seenProjects = new Set<string>();
  merged.projects = merged.projects.filter((p) => {
    const key = p.repoUrl || p.title.toLowerCase();
    if (seenProjects.has(key)) return false;
    seenProjects.add(key);
    return true;
  });

  // Deduplicate links by URL
  const seenLinks = new Set<string>();
  merged.links = merged.links.filter((l) => {
    const key = l.url.toLowerCase();
    if (seenLinks.has(key)) return false;
    seenLinks.add(key);
    return true;
  });

  // Deduplicate emails (keep first occurrence with its source)
  const seenEmails = new Set<string>();
  merged.allEmails = merged.allEmails.filter((e) => {
    const key = e.email.toLowerCase().trim();
    if (seenEmails.has(key)) return false;
    seenEmails.add(key);
    return true;
  });

  // Deduplicate phones (keep first occurrence with its source)
  const seenPhones = new Set<string>();
  merged.allPhones = merged.allPhones.filter((p) => {
    // Normalize phone by removing non-digits for comparison (support both formats)
    const phoneStr = p.number || p.phone || '';
    const key = phoneStr.replace(/\D/g, '');
    if (seenPhones.has(key)) return false;
    seenPhones.add(key);
    return true;
  });

  return merged;
}

/**
 * Generate a URL-friendly handle from name or email
 */
function generateHandle(firstName?: string, lastName?: string, email?: string): string {
  if (firstName) {
    const name = `${firstName}${lastName || ''}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
    if (name.length >= 3) return name;
  }

  if (email) {
    const username = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
    if (username.length >= 3) return username;
  }

  // Fallback: generate random handle
  return `user${Date.now().toString(36)}`;
}

/**
 * Ensure handle is unique by appending numbers if needed
 */
async function ensureUniqueHandle(baseHandle: string, excludeProfileId?: string): Promise<string> {
  let handle = baseHandle;
  let counter = 1;

  while (true) {
    const existing = await db.profile.findUnique({
      where: { handle },
      select: { id: true },
    });

    if (!existing || (excludeProfileId && existing.id === excludeProfileId)) {
      return handle;
    }

    handle = `${baseHandle}${counter}`;
    counter++;

    if (counter > 100) {
      // Safety: add random suffix
      handle = `${baseHandle}${Date.now().toString(36).slice(-4)}`;
      break;
    }
  }

  return handle;
}

/**
 * Map link type string to LinkType enum
 */
function mapLinkType(
  type: string
):
  | 'GITHUB'
  | 'LINKEDIN'
  | 'TWITTER'
  | 'PORTFOLIO'
  | 'BLOG'
  | 'DRIBBBLE'
  | 'BEHANCE'
  | 'YOUTUBE'
  | 'OTHER' {
  const typeMap: Record<
    string,
    | 'GITHUB'
    | 'LINKEDIN'
    | 'TWITTER'
    | 'PORTFOLIO'
    | 'BLOG'
    | 'DRIBBBLE'
    | 'BEHANCE'
    | 'YOUTUBE'
    | 'OTHER'
  > = {
    GITHUB: 'GITHUB',
    LINKEDIN: 'LINKEDIN',
    TWITTER: 'TWITTER',
    PORTFOLIO: 'PORTFOLIO',
    BLOG: 'BLOG',
    DRIBBBLE: 'DRIBBBLE',
    BEHANCE: 'BEHANCE',
    YOUTUBE: 'YOUTUBE',
    WEBSITE: 'PORTFOLIO',
    MEDIUM: 'BLOG',
    DEVTO: 'BLOG',
  };

  return typeMap[type.toUpperCase()] || 'OTHER';
}
