import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  buildFollioIdentity,
  canShowResumeDoor,
  canShowWorkDoor,
  embedAsVisitor,
} from '@/lib/follio-identity';
import { renderQrSvg } from '@/lib/follio-identity/qr';
import { isPortfolioEnabled } from '@/lib/features';
import { getFollioUrl } from '@/lib/url';
import { getPublicProfile, validateUnlistedKey } from '@/services/profile.service';

import { getViewerAuthState, validateShareToken } from './access';
import { IdentityViewer } from './identity-viewer';

interface IdentityPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ token?: string; key?: string; preview?: string }>;
}

export async function generateMetadata({ params }: IdentityPageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);

  if (!profile) {
    return { title: 'Follio not found' };
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || handle;
  const title = fullName;
  const description = profile.headline || `${fullName}'s Follio`;

  return {
    title,
    description,
    robots: profile.status === 'PUBLIC' ? undefined : { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: 'profile',
      firstName: profile.firstName || undefined,
      lastName: profile.lastName || undefined,
      url: getFollioUrl(handle),
      siteName: 'Follio',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: getFollioUrl(handle),
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function IdentityPage({ params, searchParams }: IdentityPageProps) {
  const { handle } = await params;
  const { token, key, preview } = await searchParams;

  const [profile, authState] = await Promise.all([
    getPublicProfile(handle),
    getViewerAuthState(handle),
  ]);

  if (!profile) {
    notFound();
  }

  const isOwner = authState === 'owner';
  const isValidToken = token ? await validateShareToken(handle, token) : false;
  const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
  const hasShareAccess = isOwner || isValidToken || isValidKey;

  if (profile.status === 'DRAFT' && !isOwner) {
    notFound();
  }

  if (profile.status === 'PRIVATE' && !hasShareAccess) {
    notFound();
  }

  const isPreview = preview === 'true';
  const doors = isPreview ? embedAsVisitor() : { authState, hasUnlistedAccess: hasShareAccess };

  const identity = buildFollioIdentity(profile, {
    showResume: canShowResumeDoor(
      profile.resumeVisibility,
      doors.authState,
      doors.hasUnlistedAccess
    ),
    showWork: canShowWorkDoor(
      isPortfolioEnabled(),
      profile.portfolioVisibility,
      doors.authState,
      doors.hasUnlistedAccess
    ),
  });

  return (
    <IdentityViewer
      identity={identity}
      qrSvg={renderQrSvg(identity.follioUrl)}
      authState={authState}
      profileHandle={handle}
      unpublished={profile.status !== 'PUBLIC'}
      embed={isPreview}
    />
  );
}
