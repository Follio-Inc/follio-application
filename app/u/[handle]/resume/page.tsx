import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getResumeUrl } from '@/lib/url';
import { getPublicProfile, validateUnlistedKey } from '@/services/profile.service';

import { getViewerAuthState, validateShareToken } from '../access';
import { ResumePageViewer } from './resume-page-viewer';

interface ResumePageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ token?: string; key?: string; minimal?: string }>;
}

export async function generateMetadata({ params }: ResumePageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);

  if (!profile) {
    return { title: 'Resume Not Found | Follio' };
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const title = `${fullName} — Resume | Follio`;
  const description = profile.headline || `${fullName}'s professional resume`;

  return {
    title,
    description,
    // Unlisted resumes should not be indexed
    robots:
      profile.resumeVisibility === 'UNLISTED' || profile.resumeVisibility === 'PRIVATE'
        ? { index: false, follow: false }
        : undefined,
    openGraph: {
      title,
      description,
      type: 'profile',
      url: getResumeUrl(handle),
      siteName: 'Follio',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: getResumeUrl(handle),
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function ResumePage({ params, searchParams }: ResumePageProps) {
  const { handle } = await params;
  const { token, key, minimal } = await searchParams;

  const [profile, authState] = await Promise.all([
    getPublicProfile(handle),
    getViewerAuthState(handle),
  ]);

  if (!profile || profile.status === 'DRAFT') {
    notFound();
  }

  // For PRIVATE profiles, require a share token or unlisted key (unless owner)
  if (profile.status === 'PRIVATE' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token, 'resume') : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

  // Check resume-specific visibility
  const resumeVisibility = profile.resumeVisibility || 'PRIVATE';
  if (resumeVisibility === 'PRIVATE' && authState !== 'owner') {
    notFound();
  }
  if (resumeVisibility === 'UNLISTED' && authState !== 'owner') {
    const isValidToken = token ? await validateShareToken(handle, token, 'resume') : false;
    const isValidKey = key ? await validateUnlistedKey(handle, key) : false;
    if (!isValidToken && !isValidKey) {
      notFound();
    }
  }

  return (
    <ResumePageViewer
      profile={profile}
      authState={authState}
      profileHandle={handle}
      resumeVisibility={resumeVisibility}
      minimal={minimal === '1'}
    />
  );
}
