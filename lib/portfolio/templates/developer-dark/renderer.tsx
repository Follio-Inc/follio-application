'use client';

/**
 * Developer Dark Template — Main Renderer
 *
 * Assembles the full portfolio page from profile data and template config.
 * No AI at render time — pure deterministic rendering.
 */

import { useResolvedPortfolioAppearance } from '@/lib/hooks/use-portfolio-appearance';

import type { TemplateRendererProps } from '../types';
import { META } from './meta';

import {
  DDAbout,
  DDCertifications,
  DDContact,
  DDEducation,
  DDExperience,
  DDFooter,
  DDGithub,
  DDHero,
  DDNavigation,
  DDProjects,
  DDSkills,
} from './sections';

import './developer-dark.css';

/**
 * Section type → component mapping with correct prop passing.
 */
function renderSection(type: string, props: TemplateRendererProps): React.ReactNode {
  const { profile, portfolio } = props;
  const { copy } = portfolio;

  switch (type) {
    case 'hero':
      return <DDHero profile={profile} copy={copy} />;
    case 'about':
      return <DDAbout profile={profile} copy={copy} enrichment={portfolio.enrichment} />;
    case 'experience':
      return <DDExperience profile={profile} copy={copy} />;
    case 'projects':
      return <DDProjects profile={profile} copy={copy} />;
    case 'skills':
      return <DDSkills profile={profile} />;
    case 'education':
      return <DDEducation profile={profile} />;
    case 'certifications':
      return <DDCertifications profile={profile} />;
    case 'github':
      return <DDGithub profile={profile} />;
    case 'contact':
      return <DDContact profile={profile} copy={copy} />;
    default:
      return null;
  }
}

/**
 * The main Developer Dark template component.
 * Takes profile data + portfolio config and renders the complete page.
 */
export function DeveloperDarkTemplate({ profile, portfolio }: TemplateRendererProps) {
  const { sections, style } = portfolio;
  const resolvedAppearance = useResolvedPortfolioAppearance(
    style.appearance,
    META.defaultAppearance
  );

  // Sort sections by order, filter to enabled only
  const enabledSections = [...sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order);

  // Build accent color CSS variable override
  const cssVars: Record<string, string> = {};
  if (style.accentColor) {
    cssVars['--dd-accent'] = style.accentColor;
  }

  return (
    <div
      data-template="developer-dark"
      data-appearance={resolvedAppearance}
      className="dd-page"
      style={cssVars as React.CSSProperties}
    >
      {/* Navigation */}
      <DDNavigation profile={profile} sections={sections} />

      {/* Sections */}
      {enabledSections
        .filter((s) => s.type !== 'navigation' && s.type !== 'footer')
        .map((section) => (
          <div key={section.id}>{renderSection(section.type, { profile, portfolio })}</div>
        ))}

      {/* Section divider before footer */}
      <div className="dd-section-divider" />

      {/* Footer */}
      <DDFooter profile={profile} />
    </div>
  );
}
