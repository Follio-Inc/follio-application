'use client';

/**
 * Template Preview Route — /preview/[templateId]
 *
 * Renders a registered portfolio template with realistic sample data so a
 * template can be reviewed in isolation. Preview-only; not linked from the app.
 * A slim faux top bar simulates the Follio ProfileNavbar (h-14) so the
 * template's nav offset reads correctly.
 */

import Link from 'next/link';
import { notFound, useParams, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { isPortfolioEnabled } from '@/lib/features';
import { getAllTemplates, getTemplate } from '@/lib/portfolio/templates/registry';
import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';

import { buildPreviewSections, sampleCopy, sampleEnrichment, sampleProfile } from './sample-data';

export default function TemplatePreviewPage() {
  const params = useParams<{ templateId: string }>();
  const searchParams = useSearchParams();
  const templateId = params?.templateId ?? '';
  // Embed mode (used by thumbnails/pickers): keep the layout offset but hide
  // the interactive switcher chrome so the preview reads as a clean page.
  const embed = searchParams.get('embed') === '1';

  const kit = getTemplate(templateId);
  const allTemplates = useMemo(() => getAllTemplates(), []);

  const portfolio: TemplatePortfolio | null = useMemo(() => {
    if (!kit) return null;
    const accent = kit.meta.compatibleAccentColors[0]?.value ?? '#111111';
    const font = kit.meta.compatibleFonts[0]?.id ?? 'inter';
    return {
      templateId,
      copy: sampleCopy,
      sections: buildPreviewSections(kit.meta.defaultSections),
      style: {
        accentColor: accent,
        fontFamily: font,
        appearance: kit.meta.defaultAppearance ?? 'system',
      },
      enrichment: sampleEnrichment,
    };
  }, [kit, templateId]);

  if (!isPortfolioEnabled()) {
    notFound();
  }

  if (!kit || !portfolio) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0f19',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          flexDirection: 'column',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
          Template &quot;{templateId}&quot; not found
        </h1>
        <p style={{ opacity: 0.7 }}>Available templates:</p>
        <div
          style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {allTemplates.map((t) => (
            <Link
              key={t.id}
              href={`/preview/${t.id}`}
              style={{
                color: '#fff',
                textDecoration: 'underline',
                opacity: 0.9,
              }}
            >
              {t.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const { Component } = kit;

  const isLight = kit.meta.navbarTheme?.mode === 'light';

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Faux Follio top bar — in document flow so template sticky nav scrolls with it. */}
      <div
        style={{
          height: '3.5rem',
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1rem',
          background: isLight ? 'rgba(247,245,240,0.9)' : 'rgba(11,15,25,0.9)',
          color: isLight ? '#16130f' : '#fff',
          borderBottom: '1px solid rgba(128,128,128,0.2)',
          backdropFilter: 'blur(10px)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '0.8125rem',
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>
          {embed ? '' : 'FOLLIO · PREVIEW'}
        </span>
        {!embed && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {allTemplates.map((t) => {
              const isActive = t.id === templateId;
              return (
                <Link
                  key={t.id}
                  href={`/preview/${t.id}`}
                  style={{
                    padding: '0.3rem 0.7rem',
                    borderRadius: '999px',
                    textDecoration: 'none',
                    fontWeight: 500,
                    background: isActive ? (isLight ? '#16130f' : '#fff') : 'transparent',
                    color: isActive ? (isLight ? '#fff' : '#0b0f19') : 'inherit',
                    border: '1px solid rgba(128,128,128,0.35)',
                  }}
                >
                  {t.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Component profile={sampleProfile} portfolio={portfolio} />
    </div>
  );
}
