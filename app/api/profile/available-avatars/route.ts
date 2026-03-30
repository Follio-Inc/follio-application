import { resolveActiveProfileContext } from '@/lib/active-profile';
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

    const context = await resolveActiveProfileContext(userId).catch(() => null);
    if (!context?.profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Run DB query and Clerk user lookup in parallel — they're independent
    const [profile, clerkUser] = await Promise.all([
      db.profile.findUnique({
        where: { id: context.profileId },
        include: {
          githubProfile: { select: { avatarUrl: true, username: true } },
          photos: {
            where: { category: 'PROFILE' },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      currentUser(),
    ]);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    const currentAvatarUrl = profile.avatarUrl;
    // Strip cache-bust params for comparison (e.g., /api/photos/id?v=123 → /api/photos/id)
    const normalizedCurrentAvatar = currentAvatarUrl?.replace(/\?v=\d+$/, '') ?? null;

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
        isActive: option.url === currentAvatarUrl || option.url === normalizedCurrentAvatar,
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

    // 5. Uploaded / manually-set profile photos saved in the DB
    //    (these persist even after the user switches to an OAuth avatar)
    //    Serve via /api/photos/:id so the URL matches Profile.avatarUrl
    //    and deduplication works correctly.
    const profilePhotos = profile.photos || [];
    profilePhotos.forEach((photo, idx) => {
      const servingUrl = photo.url.startsWith('data:') ? `/api/photos/${photo.id}` : photo.url;
      addAvatar({
        id: `uploaded-${photo.id}`,
        label: idx === 0 ? 'Uploaded' : `Uploaded (${idx + 1})`,
        url: servingUrl,
        source: 'uploaded',
      });
    });

    // 6. Current profile avatar (if it was set via URL paste and not yet in the DB)
    //    Normalize cache-busted URLs before dedup check
    if (
      currentAvatarUrl &&
      !seenUrls.has(currentAvatarUrl) &&
      !seenUrls.has(normalizedCurrentAvatar!)
    ) {
      addAvatar({
        id: 'uploaded',
        label: 'Current',
        url: currentAvatarUrl,
        source: 'uploaded',
      });
    }

    return NextResponse.json(
      {
        avatars,
        currentAvatarUrl,
        avatarUrlSource: profile.avatarUrlSource,
      },
      {
        headers: {
          // Short client-side cache so rapid open/close doesn't re-fetch
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('[GET /api/profile/available-avatars] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
