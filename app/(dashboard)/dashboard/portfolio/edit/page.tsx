import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { resolvePrimaryProfileContextOrNull } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { normalizeProfileForTemplate } from '@/lib/portfolio/templates/normalizer';
import { getDraftPlan } from '@/lib/portfolio/templates/overrides';
import { getAllTemplates, getTemplateMeta } from '@/lib/portfolio/templates/registry';
import { getPublicProfile } from '@/services/profile.service';

import { PortfolioEditorClient } from './editor-client';
import { PortfolioEditorEmptyState } from './empty-state';

import type { TemplateOption } from '@/components/portfolio/template-option-card';
import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { EditorTemplateInfo } from './types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Edit Portfolio - Follio',
};

export default async function PortfolioEditPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const context = await resolvePrimaryProfileContextOrNull(userId);
  if (!context) redirect('/onboarding');

  const profileRecord = await db.profile.findUnique({
    where: { id: context.profileId },
    select: { handle: true },
  });
  if (!profileRecord) redirect('/onboarding');

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

  const plan = generatedPortfolio?.plan as Record<string, unknown> | null;
  const publishedPlan =
    plan && typeof plan.templateId === 'string' ? (plan as unknown as TemplatePortfolio) : null;

  // The editor only supports template-based portfolios. Legacy AI portfolios or
  // not-yet-generated ones get a friendly empty state.
  if (!profile || !publishedPlan) {
    return <PortfolioEditorEmptyState handle={profileRecord.handle} />;
  }

  const templateMeta = getTemplateMeta(publishedPlan.templateId);
  if (!templateMeta) {
    return <PortfolioEditorEmptyState handle={profileRecord.handle} />;
  }

  const normalizedProfile = normalizeProfileForTemplate(profile, { githubProfile });
  const draftPlan = getDraftPlan(generatedPortfolio?.userOverrides) ?? publishedPlan;

  const templates: TemplateOption[] = getAllTemplates().map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    tags: t.tags,
    accentColors: t.compatibleAccentColors,
  }));

  const templatesById = Object.fromEntries(
    getAllTemplates().map((t) => [
      t.id,
      {
        id: t.id,
        name: t.name,
        accentColors: t.compatibleAccentColors,
        fonts: t.compatibleFonts,
        supportedSections: t.supportedSections,
        defaultHeadings: t.defaultSectionHeadings ?? {},
      } satisfies EditorTemplateInfo,
    ])
  );

  return (
    <PortfolioEditorClient
      handle={profileRecord.handle}
      publishedPlan={publishedPlan}
      initialDraft={draftPlan}
      profile={normalizedProfile}
      currentTemplateId={publishedPlan.templateId}
      templates={templates}
      templatesById={templatesById}
      template={{
        id: templateMeta.id,
        name: templateMeta.name,
        accentColors: templateMeta.compatibleAccentColors,
        fonts: templateMeta.compatibleFonts,
        supportedSections: templateMeta.supportedSections,
        defaultHeadings: templateMeta.defaultSectionHeadings ?? {},
      }}
    />
  );
}
