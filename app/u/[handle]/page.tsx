import { db } from '@/lib/db';
import { getPublicProfile } from '@/services/profile.service';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProfileViewer } from './profile-viewer';

interface ProfilePageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ view?: string; token?: string }>;
}

// Validate a share token for a private profile
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

  // Check if token belongs to this profile
  if (shareToken.user.profile?.handle !== handle) return false;

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

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      firstName: profile.firstName,
      lastName: profile.lastName || undefined,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
    },
    alternates: {
      canonical: `/u/${handle}`,
    },
  };
}

export const dynamic = 'force-dynamic'; // Disable caching for now to ensure fresh data

export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const { handle } = await params;
  const { view = 'resume', token } = await searchParams;

  const profile = await getPublicProfile(handle);

  if (!profile || profile.status === 'DRAFT') {
    notFound();
  }

  // For PRIVATE (Unlisted) profiles, require a valid share token
  if (profile.status === 'PRIVATE') {
    const isValidToken = token ? await validateShareToken(handle, token) : false;
    if (!isValidToken) {
      notFound();
    }
  }

  return (
    <ProfileViewer
      profile={profile}
      initialView={view as 'resume' | 'portfolio' | 'timeline' | 'snapshot'}
    />
  );
}
