import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { CleanCoverLetterView } from '@/components/cover-letter/clean-cover-letter-view';
import {
  mergeCoverLetterContent,
  mergeCoverLetterDesign,
  parseCoverLetterContent,
  parseCoverLetterDesign,
} from '@/lib/cover-letter';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Minimal cover letter preview page used as an iframe source for dashboard thumbnails.
 *
 * Mirrors `/resume-preview/[id]`: owner-only, zero chrome, works for all visibilities.
 */

interface CoverLetterPreviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function CoverLetterPreviewPage({ params }: CoverLetterPreviewPageProps) {
  const { id } = await params;
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    notFound();
  }

  const letter = await db.coverLetter.findUnique({
    where: { id },
    include: {
      user: { select: { clerkId: true } },
    },
  });

  if (!letter || letter.user.clerkId !== clerkId || letter.isArchived) {
    notFound();
  }

  const content = mergeCoverLetterContent(parseCoverLetterContent(letter.content));
  const design = mergeCoverLetterDesign(parseCoverLetterDesign(letter.design));

  return (
    <div className="bg-white" style={{ overflow: 'hidden' }}>
      <main className="mx-auto max-w-5xl">
        <CleanCoverLetterView content={content} design={design} />
      </main>
    </div>
  );
}
