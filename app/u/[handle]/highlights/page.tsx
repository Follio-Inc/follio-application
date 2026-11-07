import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { resumeAccessQuery } from '@/lib/resume/presentation';
import { getFollioUrl } from '@/lib/url';
import { getPublicProfile, validateUnlistedKey } from '@/services/profile.service';

import { getViewerAuthState, validateShareToken } from '../access';
import { HighlightsViewer } from './highlights-viewer';

interface HighlightsPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ token?: string; key?: string }>;
}

export async function generateMetadata({ params }: HighlightsPageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);

  if (!profile) {
    return { title: 'Highlights Not Found | Follio' };
  }

  const fullName = [profile.firstName, profile.middleName, profile.lastName]
    .filter(Boolean)
    .join(' ');
  const title = `${fullName} — Highlights | Follio`;
  const description = profile.headline || `${fullName}'s resume highlights`;

  return {
    title,
    description,
    robots:
      profile.resumeVisibility === 'UNLISTED' || profile.resumeVisibility === 'PRIVATE'
        ? { index: false, follow: false }
        : undefined,
    openGraph: {
      title,
      description,
      type: 'profile',
      url: `${getFollioUrl(handle)}/highlights`,
      siteName: 'Follio',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function HighlightsPage({ params, searchParams }: HighlightsPageProps) {
  const { handle } = await params;
  const { token, key } = await searchParams;

  const [profile, authState] = await Promise.all([
    getPublicProfile(handle),
    getViewerAuthState(handle),
  ]);

  if (!profile) {
    notFound();
  }

  const isOwner = authState === 'owner';
  const resumeVisibility = profile.resumeVisibility || 'PRIVATE';

  // Same access as the resume this reading is taken from.
  if (!isOwner) {
    if (resumeVisibility === 'PRIVATE') {
      notFound();
    }

    if (resumeVisibility === 'PUBLIC') {
      // Allowed — public resumes are openly viewable.
    } else {
      const isValidToken = token ? await validateShareToken(handle, token, 'resume') : false;
      const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
      if (!isValidToken && !isValidKey) {
        notFound();
      }
    }
  }

  return (
    <HighlightsViewer
      profile={profile}
      authState={authState}
      profileHandle={handle}
      resumeVisibility={resumeVisibility}
      accessQuery={resumeAccessQuery({ token, key })}
    />
  );
}
