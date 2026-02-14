import { db } from '@/lib/db';
import { getLinksUrl } from '@/lib/url';
import { getPublicProfile, validateUnlistedKey } from '@/services/profile.service';
import { auth } from '@clerk/nextjs/server';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LinksPageViewer } from './links-page-viewer';

// Helper to serialize data for client components (converts Date objects to ISO strings)
function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

interface LinksPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ token?: string; key?: string }>;
}

// Validate a share token for the links page
async function validateShareToken(handle: string, token: string): Promise<boolean> {
  if (!token) return false;

  const shareToken = await db.shareToken.findUnique({
    where: { token },
    include: {
      user: {
        include: { profile: true },
      },
    },
  });

  if (!shareToken) return false;
  if (shareToken.user.profile?.handle !== handle) return false;
  if (shareToken.expiresAt && shareToken.expiresAt < new Date()) return false;
  if (shareToken.maxViews && shareToken.viewCount >= shareToken.maxViews) return false;

  // Check allowedView — if set, must allow 'links'
  if (shareToken.allowedView && shareToken.allowedView !== 'links') return false;

  await db.shareToken.update({
    where: { id: shareToken.id },
    data: { viewCount: { increment: 1 } },
  });

  return true;
}

/** Determine auth state */
async function getAuthState(handle: string): Promise<'owner' | 'authenticated' | 'anonymous'> {
  try {
    const { userId } = await auth();
    if (!userId) return 'anonymous';

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: { select: { handle: true } } },
    });

    if (user?.profile?.handle === handle) return 'owner';
    return 'authenticated';
  } catch {
    return 'anonymous';
  }
}

export async function generateMetadata({ params }: LinksPageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);

  if (!profile) {
    return { title: 'Links Not Found | Follio' };
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const title = `${fullName} — Links | Follio`;
  const description = profile.headline || `${fullName}'s links`;

  const linksVisibility = profile.linksVisibility || 'PUBLIC';

  return {
    title,
    description,
    robots:
      linksVisibility === 'UNLISTED' || linksVisibility === 'PRIVATE'
        ? { index: false, follow: false }
        : undefined,
    openGraph: {
      title,
      description,
      type: 'profile',
      url: getLinksUrl(handle),
      siteName: 'Follio',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: getLinksUrl(handle),
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function LinksPage({ params, searchParams }: LinksPageProps) {
  const { handle } = await params;
  const { token, key } = await searchParams;

  const [profile, authState] = await Promise.all([getPublicProfile(handle), getAuthState(handle)]);

  if (!profile || profile.status === 'DRAFT') {
    notFound();
  }

  // For PRIVATE profiles, require a share token or unlisted key (unless owner)
  if (profile.status === 'PRIVATE' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token) : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

  // Check links-specific visibility
  const linksVisibility = profile.linksVisibility || 'PUBLIC';
  if (linksVisibility === 'PRIVATE' && authState !== 'owner') {
    notFound();
  }
  if (linksVisibility === 'UNLISTED' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token) : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

  const serializedProfile = serializeForClient(profile);

  return (
    <LinksPageViewer profile={serializedProfile} authState={authState} profileHandle={handle} />
  );
}
