import { db } from '@/lib/db';
import { getPortfolioUrl } from '@/lib/url';
import { getPublicProfile, validateUnlistedKey } from '@/services/profile.service';
import { auth } from '@clerk/nextjs/server';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProfileViewer } from './profile-viewer';

// Helper to serialize data for client components (converts Date objects to ISO strings)
function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

interface ProfilePageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ view?: string; token?: string; key?: string }>;
}

// Validate a share token for a private profile
async function validateShareToken(handle: string, token: string): Promise<boolean> {
  if (!token) return false;

  const shareToken = await db.shareToken.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      maxViews: true,
      viewCount: true,
    },
  });

  if (!shareToken) return false;

  // Check if token belongs to this profile
  const matchingProfile = await db.profile.findFirst({
    where: {
      userId: shareToken.userId,
      handle,
      isArchived: false,
    },
    select: { id: true },
  });
  if (!matchingProfile) return false;

  // Check expiration
  if (shareToken.expiresAt && shareToken.expiresAt < new Date()) return false;

  // Check max views
  if (shareToken.maxViews && shareToken.viewCount >= shareToken.maxViews) return false;

  // Increment view count
  await db.shareToken.update({
    where: { id: shareToken.id },
    data: { viewCount: { increment: 1 } },
  });

  return true;
}

/** Determine auth state: is the viewer the profile owner, another logged-in user, or anonymous? */
async function getAuthState(handle: string): Promise<'owner' | 'authenticated' | 'anonymous'> {
  try {
    const { userId } = await auth();
    if (!userId) return 'anonymous';

    const ownedProfile = await db.profile.findFirst({
      where: {
        handle,
        user: { clerkId: userId },
        isArchived: false,
      },
      select: { id: true },
    });

    if (ownedProfile) return 'owner';
    return 'authenticated';
  } catch {
    return 'anonymous';
  }
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);

  if (!profile) {
    return {
      title: 'Profile Not Found | Follio',
    };
  }

  const title = `${profile.firstName} ${profile.lastName} | Follio`;
  const description =
    profile.summary ||
    `${profile.headline || 'Professional'} based in ${profile.location || 'Unknown'}`;

  const portfolioVisibility = profile.portfolioVisibility || 'PUBLIC';

  return {
    title,
    description,
    // Unlisted/private portfolios should not be indexed
    robots:
      portfolioVisibility === 'UNLISTED' || portfolioVisibility === 'PRIVATE'
        ? { index: false, follow: false }
        : undefined,
    openGraph: {
      title,
      description,
      type: 'profile',
      firstName: profile.firstName,
      lastName: profile.lastName || undefined,
      url: getPortfolioUrl(handle),
      siteName: 'Follio',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: getPortfolioUrl(handle),
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const { handle } = await params;
  const { view = 'portfolio', token, key } = await searchParams;

  const [profile, authState] = await Promise.all([getPublicProfile(handle), getAuthState(handle)]);

  if (!profile || profile.status === 'DRAFT') {
    notFound();
  }

  // For PRIVATE (Unlisted) profiles, require a valid share token or unlisted key (unless owner)
  if (profile.status === 'PRIVATE' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token) : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

  // Check portfolio-specific visibility
  const portfolioVisibility = profile.portfolioVisibility || 'PUBLIC';
  if (portfolioVisibility === 'PRIVATE' && authState !== 'owner') {
    notFound();
  }
  if (portfolioVisibility === 'UNLISTED' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token) : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

  // Determine resume visibility for the cross-link button
  const resumeVisibility = profile.resumeVisibility || 'UNLISTED';

  // Serialize the profile data to convert Date objects to strings for client component
  const serializedProfile = serializeForClient(profile);

  return (
    <ProfileViewer
      profile={serializedProfile}
      initialView={view as 'portfolio' | 'timeline' | 'snapshot'}
      authState={authState}
      profileHandle={handle}
      resumeVisibility={resumeVisibility}
    />
  );
}
