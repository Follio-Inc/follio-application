/**
 * Portfolio Draft Preview (owner-only)
 *
 * Renders the user's UNPUBLISHED portfolio draft using the exact same template
 * pipeline as the public page. Loaded inside an iframe by the portfolio editor
 * so the template renders in its own document — preserving its fixed navigation
 * and window-scroll behaviour, which would break if rendered inline.
 *
 * The server renders the initial draft; from there the editor streams live edits
 * into the frame via `postMessage` (see PreviewLive) so changes appear instantly
 * without reloading the iframe.
 *
 * Falls back to the published plan when no draft exists.
 */

import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { resolvePrimaryProfileContextOrNull } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { getDraftPlan } from '@/lib/portfolio/templates/overrides';
import { getPublicProfile } from '@/services/profile.service';

import { PreviewLive } from './preview-live';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Portfolio Preview',
  robots: { index: false, follow: false },
};

export default async function PortfolioPreviewPage() {
  const { userId } = await auth();
  if (!userId) notFound();

  const context = await resolvePrimaryProfileContextOrNull(userId);
  if (!context) notFound();

  const profileRecord = await db.profile.findUnique({
    where: { id: context.profileId },
    select: { handle: true },
  });
  if (!profileRecord) notFound();

  const [profile, generatedPortfolio, githubProfile] = await Promise.all([
    getPublicProfile(profileRecord.handle),
    db.generatedPortfolio
      .findFirst({
        where: {
          profileId: context.profileId,
          isActive: true,
          status: { in: ['PUBLISHED', 'DRAFT'] },
        },
        orderBy: { version: 'desc' },
        select: { plan: true, userOverrides: true },
      })
      .catch(() => null),
    db.gitHubProfile
      .findUnique({
        where: { profileId: context.profileId },
        select: {
          username: true,
          avatarUrl: true,
          bio: true,
          publicRepos: true,
          followers: true,
          totalStars: true,
          primaryLanguages: true,
        },
      })
      .catch(() => null),
  ]);

  if (!profile) notFound();

  const plan = generatedPortfolio?.plan as Record<string, unknown> | null;
  const publishedPlan =
    plan && typeof plan.templateId === 'string' ? (plan as unknown as TemplatePortfolio) : null;

  if (!publishedPlan) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-sm text-muted-foreground">
        No template-based portfolio to preview yet.
      </div>
    );
  }

  const draftPlan = getDraftPlan(generatedPortfolio?.userOverrides) ?? publishedPlan;

  // Pull the template nav flush to the top since the Follio navbar is absent here.
  const wrapperStyle = { '--ms-nav-top': '0px' } as CSSProperties;

  return (
    <div style={wrapperStyle}>
      <PreviewLive profile={profile} initialDraft={draftPlan} githubProfile={githubProfile} />
    </div>
  );
}
