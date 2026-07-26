import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CleanCoverLetterView } from '@/components/cover-letter/clean-cover-letter-view';
import { resolveCoverLetterByUnlistedKey } from '@/lib/public-cover-letter';
import { getUnlistedCoverLetterUrl } from '@/lib/url';

interface UnlistedCoverLetterPageProps {
  params: Promise<{ key: string }>;
}

export async function generateMetadata({
  params,
}: UnlistedCoverLetterPageProps): Promise<Metadata> {
  const { key } = await params;
  const letter = await resolveCoverLetterByUnlistedKey(key);

  if (!letter) {
    return { title: 'Cover Letter Not Found | Follio' };
  }

  const title = `${letter.title} | Follio`;
  const description = 'Shared cover letter';

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: 'article',
      url: getUnlistedCoverLetterUrl(key),
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
 * Opaque unlisted cover letter URL: /cl/{unlistedKey}
 *
 * Cover letters are never public — this is the only shareable link surface.
 */
export default async function UnlistedCoverLetterByKeyPage({
  params,
}: UnlistedCoverLetterPageProps) {
  const { key } = await params;
  const letter = await resolveCoverLetterByUnlistedKey(key);
  if (!letter) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
        <header className="w-full text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shared cover letter
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            {letter.title}
          </h1>
        </header>
        <CleanCoverLetterView content={letter.content} design={letter.design} />
      </div>
    </main>
  );
}
