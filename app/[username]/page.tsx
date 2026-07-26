import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getViewerAuthState } from '@/app/u/[handle]/access';
import { ResumePageViewer } from '@/app/u/[handle]/resume/resume-page-viewer';
import { isReservedUsername } from '@/lib/reserved-usernames';
import { resolvePublicResumeByUsername } from '@/lib/public-resume';
import { getPublicResumeUrl } from '@/lib/url';

interface PublicResumePageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ minimal?: string }>;
}

export async function generateMetadata({ params }: PublicResumePageProps): Promise<Metadata> {
  const { username } = await params;
  if (isReservedUsername(username)) {
    return { title: 'Resume Not Found | Follio' };
  }

  const resolved = await resolvePublicResumeByUsername(username);
  if (!resolved) {
    return { title: 'Resume Not Found | Follio' };
  }

  const { profile, vanityUsername } = resolved;
  const fullName = [profile.firstName, profile.middleName, profile.lastName]
    .filter(Boolean)
    .join(' ');
  const title = `${fullName} — Resume | Follio`;
  const description = profile.headline || `${fullName}'s professional resume`;
  const url = getPublicResumeUrl(vanityUsername);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      url,
      siteName: 'Follio',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}

export const dynamic = 'force-dynamic';

/**
 * Public vanity resume URL: /{username} → follio.me/username
 *
 * Resolves the username to the account owner, then serves their single
 * PUBLIC resume (which may be a different profile than the vanity handle).
 */
export default async function PublicResumeByUsernamePage({
  params,
  searchParams,
}: PublicResumePageProps) {
  const { username } = await params;
  const { minimal } = await searchParams;

  if (isReservedUsername(username)) {
    notFound();
  }

  const resolved = await resolvePublicResumeByUsername(username);
  if (!resolved) {
    notFound();
  }

  const { profile } = resolved;
  const authState = await getViewerAuthState(profile.handle);

  return (
    <ResumePageViewer
      profile={profile}
      authState={authState}
      profileHandle={profile.handle}
      resumeVisibility="PUBLIC"
      minimal={minimal === '1'}
    />
  );
}
