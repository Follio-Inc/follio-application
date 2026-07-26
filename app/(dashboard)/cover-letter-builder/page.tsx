import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import {
  mergeCoverLetterContent,
  mergeCoverLetterDesign,
  normalizeCoverLetterVisibility,
  parseCoverLetterContent,
  parseCoverLetterDesign,
} from '@/lib/cover-letter';
import { db } from '@/lib/db';

import { CoverLetterBuilderClient } from './cover-letter-builder-client';

export const metadata = {
  title: 'Cover Letter Builder - Follio',
  description: 'Write and design your cover letter.',
};

/**
 * Cover letter builder — loads the active cover letter (or ?id=).
 */
export default async function CoverLetterBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) redirect('/onboarding');

  const params = await searchParams;
  const requestedId = params.id?.trim();

  let letter = requestedId
    ? await db.coverLetter.findFirst({
        where: { id: requestedId, userId: user.id, isArchived: false },
      })
    : await db.coverLetter.findFirst({
        where: { userId: user.id, activeForUserId: user.id, isArchived: false },
      });

  if (!letter) {
    letter = await db.coverLetter.findFirst({
      where: { userId: user.id, isArchived: false },
      orderBy: { updatedAt: 'desc' },
    });
  }

  if (!letter) {
    redirect('/dashboard?tab=cover-letters');
  }

  // Keep active pointer in sync when opening via ?id=
  if (letter.activeForUserId !== user.id) {
    await db.$transaction(async (tx) => {
      await tx.coverLetter.updateMany({
        where: { userId: user.id, activeForUserId: user.id },
        data: { activeForUserId: null },
      });
      await tx.coverLetter.update({
        where: { id: letter!.id },
        data: { activeForUserId: user.id },
      });
    });
  }

  return (
    <CoverLetterBuilderClient
      initial={{
        id: letter.id,
        title: letter.title,
        content: mergeCoverLetterContent(parseCoverLetterContent(letter.content)),
        design: mergeCoverLetterDesign(parseCoverLetterDesign(letter.design)),
        linkedProfileId: letter.linkedProfileId,
        visibility: normalizeCoverLetterVisibility(letter.visibility),
      }}
    />
  );
}
