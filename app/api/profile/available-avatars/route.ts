import { db } from '@/lib/db';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export interface AvatarOption {
  /** Unique key for this avatar option */
  id: string;
  /** Display label for the source */
  label: string;
  /** The avatar image URL */
  url: string;
  /** Source type (e.g., 'clerk', 'google', 'linkedin', 'github', 'uploaded') */
  source: string;
  /** Whether this is the currently active profile avatar */
  isActive: boolean;
}

/**
 * GET /api/profile/available-avatars
 *
 * Returns all available avatar/profile photos from connected sources:
 * - Current profile avatar (uploaded/manual)
 * - Clerk user image (from primary OAuth - Google, etc.)
 * - GitHub profile avatar
 * - LinkedIn profile avatar (from Clerk external account)
 * - Google profile avatar (from Clerk external account)
 *
 * Used by the Profile Photo Manager in the builder.
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        profile: {
          include: {
            githubProfile: { select: { avatarUrl: true, username: true } },
          },
        },
      },
    });

    if (!user?.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = user.profile;
    const currentAvatarUrl = profile.avatarUrl;

    // Get Clerk user for external accounts and their avatars
    const clerkUser = await currentUser();
    const externalAccounts = clerkUser?.externalAccounts || [];

    const avatars: AvatarOption[] = [];
    const seenUrls = new Set<string>();

    // Helper to add avatar without duplicates
    const addAvatar = (option: Omit<AvatarOption, 'isActive'>) => {
      if (!option.url || seenUrls.has(option.url)) return;
      // Skip known default/placeholder avatars
      if (option.url.includes('ui-avatars.com') || option.url.includes('gravatar.com/avatar')) {
        return;
      }
      seenUrls.add(option.url);
      avatars.push({
        ...option,
        isActive: option.url === currentAvatarUrl,
      });
    };

    // 1. Google OAuth avatar
    const googleAccount = externalAccounts.find((a) => {
      const provider = a.provider as string;
      return provider === 'google' || provider === 'oauth_google' || provider === 'google_oidc';
    });
    if (googleAccount?.imageUrl) {
      addAvatar({
        id: 'google',
        label: 'Google',
        url: googleAccount.imageUrl,
        source: 'google',
      });
    }

    // 2. LinkedIn OAuth avatar
    const linkedinAccount = externalAccounts.find((a) => {
      const provider = a.provider as string;
      return (
        provider === 'linkedin_oidc' ||
        provider === 'linkedin' ||
        provider === 'oauth_linkedin_oidc' ||
        provider === 'oauth_linkedin'
      );
    });
    if (linkedinAccount?.imageUrl) {
      addAvatar({
        id: 'linkedin',
        label: 'LinkedIn',
        url: linkedinAccount.imageUrl,
        source: 'linkedin',
      });
    }

    // 3. GitHub OAuth avatar (from Clerk external account)
    const githubAccount = externalAccounts.find(
      (a) => a.provider === 'oauth_github' || a.provider === 'github'
    );
    if (githubAccount?.imageUrl) {
      addAvatar({
        id: 'github-oauth',
        label: 'GitHub',
        url: githubAccount.imageUrl,
        source: 'github',
      });
    }

    // 4. GitHub profile avatar (from our DB - may differ from OAuth avatar)
    if (profile.githubProfile?.avatarUrl) {
      addAvatar({
        id: 'github-profile',
        label: `GitHub (@${profile.githubProfile.username})`,
        url: profile.githubProfile.avatarUrl,
        source: 'github',
      });
    }

    // 5. Current profile avatar (if it was uploaded/manually set and differs from source avatars)
    if (currentAvatarUrl && !seenUrls.has(currentAvatarUrl)) {
      addAvatar({
        id: 'uploaded',
        label: 'Uploaded',
        url: currentAvatarUrl,
        source: 'uploaded',
      });
    }

    return NextResponse.json({
      avatars,
      currentAvatarUrl,
      avatarUrlSource: profile.avatarUrlSource,
    });
  } catch (error) {
    console.error('[GET /api/profile/available-avatars] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
