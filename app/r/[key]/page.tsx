import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getViewerAuthState } from '@/app/u/[handle]/access';
import { ResumePageViewer } from '@/app/u/[handle]/resume/resume-page-viewer';
import { resolveResumeByUnlistedKey } from '@/lib/public-resume';
import { getUnlistedResumeUrl } from '@/lib/url';

interface UnlistedResumePageProps {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ minimal?: string }>;
}

export async function generateMetadata({ params }: UnlistedResumePageProps): Promise<Metadata> {
  const { key } = await params;
  const profile = await resolveResumeByUnlistedKey(key);

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
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: 'profile',
      url: getUnlistedResumeUrl(key),
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

/**
 * Opaque unlisted resume URL: /r/{unlistedKey}
 *
 * Does not include the username so recipients cannot discover a public
 * vanity URL from an unlisted link.
 */
export default async function UnlistedResumeByKeyPage({
  params,
  searchParams,
}: UnlistedResumePageProps) {
  const { key } = await params;
  const { minimal } = await searchParams;

  const profile = await resolveResumeByUnlistedKey(key);
  if (!profile) {
    notFound();
  }

  const authState = await getViewerAuthState(profile.handle);
  const resumeVisibility = profile.resumeVisibility || 'UNLISTED';

  return (
    <ResumePageViewer
      profile={profile}
      authState={authState}
      profileHandle={profile.handle}
      resumeVisibility={resumeVisibility}
      minimal={minimal === '1'}
    />
  );
}
