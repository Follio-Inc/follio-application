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

  const fullName = [profile.firstName, profile.middleName, profile.lastName]
    .filter(Boolean)
    .join(' ');
  const title = `${fullName} — Resume | Follio`;
  const description = profile.headline || `${fullName}'s professional resume`;

  return {
    title,
    description,
    // Unlisted and private resumes should not be indexed
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

  if (!profile) {
    notFound();
  }

  const isOwner = authState === 'owner';
  const resumeVisibility = profile.resumeVisibility || 'PRIVATE';

  // Resume access model:
  //   - Owner: always allowed.
  //   - PRIVATE: owner only.
  //   - PUBLIC: anyone (canonical URL is /{username}; this path remains for
  //     backwards compatibility and owner previews).
  //   - UNLISTED: only with a valid share token or unlisted key. Prefer the
  //     opaque /r/{key} share URL so the username is not leaked.
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
    <ResumePageViewer
      profile={profile}
      authState={authState}
      profileHandle={handle}
      resumeVisibility={resumeVisibility}
      minimal={minimal === '1'}
    />
  );
}
