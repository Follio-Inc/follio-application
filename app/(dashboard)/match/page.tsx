import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { JdAlignWorkspace } from '@/components/jd-align/jd-align-workspace';
import { db } from '@/lib/db';
import { toPlainText } from '@/services/export.service';
import { getProfileByHandle } from '@/services/profile.service';
import type { FullProfile } from '@/types';

export const metadata: Metadata = {
  title: 'Compare to a job',
  description:
    'See keyword overlap, a recruiter-style read, and which parts of a job your resume supports.',
};

export const dynamic = 'force-dynamic';

function asReadableResume(profile: FullProfile): string {
  return toPlainText(profile)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default async function MatchPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    select: {
      profile: { select: { handle: true, resumeTitle: true } },
      primaryProfile: { select: { handle: true, resumeTitle: true } },
    },
  });

  const source = user?.profile ?? user?.primaryProfile ?? null;
  let resumeText = '';
  const resumeTitle = source?.resumeTitle ?? null;

  if (source) {
    try {
      const profile = await getProfileByHandle(source.handle);
      if (profile) resumeText = asReadableResume(profile);
    } catch {
      resumeText = '';
    }
  }

  return <JdAlignWorkspace initialResume={resumeText} resumeTitle={resumeTitle} />;
}
