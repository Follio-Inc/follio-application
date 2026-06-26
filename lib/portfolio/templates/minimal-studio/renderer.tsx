'use client';

/**
 * Minimal Studio Template — Main Renderer
 *
 * Assembles the full portfolio from profile data + template config.
 * Pure deterministic rendering; the only side effect is loading the
 * template's web fonts (the template system has no global font loader,
 * so each kit loads what it needs).
 */

import { useEffect } from 'react';

import type { TemplateRendererProps } from '../types';
import {
  resolveAboutStyle,
  resolvePortraitStyle,
  resolveSkillsStyle,
  resolveWorkStyle,
} from '../overrides';

import {
  MSAbout,
  MSAwards,
  MSCertifications,
  MSContact,
  MSEducation,
  MSExperience,
  MSFooter,
  MSGithub,
  MSHero,
  MSNavigation,
  MSSkills,
  MSWork,
} from './sections';

import './minimal-studio.css';

// Fraunces (display serif) + the supported body grotesques. Loaded once,
// idempotently, so the template never silently falls back to system fonts.
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=Inter:wght@300;400;500;600&family=Archivo:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap';

function useTemplateFonts() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector(`link[data-ms-fonts]`)) return;

    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';
    preconnect1.setAttribute('data-ms-fonts', 'preconnect');

    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';
    preconnect2.setAttribute('data-ms-fonts', 'preconnect');

    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = FONT_HREF;
    sheet.setAttribute('data-ms-fonts', 'stylesheet');

    document.head.appendChild(preconnect1);
    document.head.appendChild(preconnect2);
    document.head.appendChild(sheet);
  }, []);
}

const SANS_STACKS: Record<string, string> = {
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  archivo: "'Archivo', -apple-system, BlinkMacSystemFont, sans-serif",
  'space-grotesk': "'Space Grotesk', -apple-system, sans-serif",
};

/**
 * Section types that display a numbered eyebrow ("01", "02", …). The numerals
 * are assigned at render time from the live section order, so reordering or
 * hiding sections keeps the sequence correct and gap-free.
 */
const NUMBERED_SECTION_TYPES = new Set([
  'projects',
  'about',
  'experience',
  'skills',
  'education',
  'awards',
  'certifications',
  'github',
]);

function renderSection(
  type: string,
  props: TemplateRendererProps,
  index?: string
): React.ReactNode {
  const { profile, portfolio } = props;
  const { copy } = portfolio;

  switch (type) {
    case 'hero':
      return (
        <MSHero
          profile={profile}
          copy={copy}
          portraitStyle={resolvePortraitStyle(portfolio.overrides)}
        />
      );
    case 'projects':
      return (
        <MSWork
          profile={profile}
          copy={copy}
          index={index}
          layout={resolveWorkStyle(portfolio.overrides)}
        />
      );
    case 'about':
      return (
        <MSAbout
          profile={profile}
          copy={copy}
          enrichment={portfolio.enrichment}
          index={index}
          layout={resolveAboutStyle(portfolio.overrides)}
        />
      );
    case 'experience':
      return <MSExperience profile={profile} copy={copy} index={index} />;
    case 'skills':
      return (
        <MSSkills
          profile={profile}
          copy={copy}
          index={index}
          layout={resolveSkillsStyle(portfolio.overrides)}
        />
      );
    case 'education':
      return <MSEducation profile={profile} copy={copy} index={index} />;
    case 'awards':
      return <MSAwards profile={profile} copy={copy} index={index} />;
    case 'certifications':
      return <MSCertifications profile={profile} copy={copy} index={index} />;
    case 'github':
      return <MSGithub profile={profile} copy={copy} index={index} />;
    case 'contact':
      return <MSContact profile={profile} copy={copy} />;
    default:
      return null;
  }
}

export function MinimalStudioTemplate({ profile, portfolio }: TemplateRendererProps) {
  useTemplateFonts();

  const { sections, style } = portfolio;
  const enabledSections = [...sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order);

  const cssVars: Record<string, string> = {};
  if (style.accentColor) cssVars['--ms-accent'] = style.accentColor;
  if (style.fontFamily && SANS_STACKS[style.fontFamily]) {
    cssVars['--ms-font-sans'] = SANS_STACKS[style.fontFamily];
  }

  return (
    <div data-template="minimal-studio" className="ms-page" style={cssVars as React.CSSProperties}>
      <MSNavigation profile={profile} sections={sections} />

      <main className="ms-main">
        {(() => {
          let counter = 0;
          return enabledSections
            .filter((s) => s.type !== 'navigation' && s.type !== 'footer')
            .map((section) => {
              const index = NUMBERED_SECTION_TYPES.has(section.type)
                ? String(++counter).padStart(2, '0')
                : undefined;
              return (
                <div key={section.id}>
                  {renderSection(section.type, { profile, portfolio }, index)}
                </div>
              );
            });
        })()}
      </main>

      <MSFooter profile={profile} />
    </div>
  );
}
