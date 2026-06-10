import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getLinksUrl } from '@/lib/url';
import { getPublicProfile, validateUnlistedKey } from '@/services/profile.service';

import { getViewerAuthState, validateShareToken } from '../access';
import { LinksPageViewer } from './links-page-viewer';

interface LinksPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ token?: string; key?: string }>;
}

export async function generateMetadata({ params }: LinksPageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);

  if (!profile) {
    return { title: 'Links Not Found | Follio' };
  }

  const fullName = [profile.firstName, profile.middleName, profile.lastName]
    .filter(Boolean)
    .join(' ');
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

  const [profile, authState] = await Promise.all([
    getPublicProfile(handle),
    getViewerAuthState(handle),
  ]);

  if (!profile || profile.status === 'DRAFT') {
    notFound();
  }

  // For PRIVATE profiles, require a share token or unlisted key (unless owner)
  if (profile.status === 'PRIVATE' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token, 'links') : false;
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
    const isValidToken = token ? await validateShareToken(handle, token, 'links') : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

  return <LinksPageViewer profile={profile} authState={authState} profileHandle={handle} />;
}
