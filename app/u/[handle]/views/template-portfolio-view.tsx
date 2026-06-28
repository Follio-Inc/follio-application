'use client';

/**
 * Template-Based Portfolio View
 *
 * Renders a portfolio using the template system. Looks up the correct
 * template kit from the registry, normalizes the profile data, and
 * renders the template's React component.
 *
 * This replaces AIPortfolioView for template-based portfolios.
 */

import { useMemo } from 'react';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { PublicProfile } from '@/types';

import { normalizeProfileForTemplate } from '@/lib/portfolio/templates/normalizer';
import { applyPortfolioOverrides } from '@/lib/portfolio/templates/overrides';
import { getTemplate } from '@/lib/portfolio/templates/registry';

interface TemplatePortfolioViewProps {
  /** The public profile data (serialized) */
  profile: PublicProfile;
  /** The template portfolio data (from GeneratedPortfolio.plan) */
  templateData: TemplatePortfolio;
  /** Optional GitHub profile for the github section */
  githubProfile?: {
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    publicRepos: number;
    followers: number;
    totalStars: number;
    primaryLanguages: string[];
  } | null;
}

export function TemplatePortfolioView({
  profile,
  templateData,
  githubProfile = null,
}: TemplatePortfolioViewProps) {
  // Look up the template kit
  const kit = getTemplate(templateData.templateId);

  // Normalize profile data for the template, then apply the portfolio's media
  // overrides (avatar / project images) so published image choices take effect
  // without mutating the underlying profile.
  const normalizedProfile = useMemo(
    () =>
      applyPortfolioOverrides(
        normalizeProfileForTemplate(profile, { githubProfile }),
        templateData.overrides
      ),
    [profile, githubProfile, templateData.overrides]
  );

  if (!kit) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold">Template Not Found</h2>
          <p className="text-gray-400">
            Template &quot;{templateData.templateId}&quot; is not available.
          </p>
        </div>
      </div>
    );
  }

  const { Component } = kit;

  return <Component profile={normalizedProfile} portfolio={templateData} />;
}
