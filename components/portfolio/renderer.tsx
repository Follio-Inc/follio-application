'use client';

/**
 * Portfolio Page Renderer
 *
 * The top-level component that takes a PortfolioPlan and renders:
 * 1. Theme CSS variables (applied via inline styles on root)
 * 2. Navigation
 * 3. All sections in order
 * 4. Footer
 *
 * This component is pure rendering — no AI, no data fetching.
 * It maps the plan's pages/sections to pre-built components.
 */

import React, { useMemo } from 'react';

import type { PortfolioPlan, PortfolioSection, PortfolioUserOverrides } from '@/types/portfolio';

import { resolveStyleTokens } from '@/lib/portfolio/theme';

import {
  PortfolioFooter,
  PortfolioNavigation,
  SECTION_COMPONENT_MAP,
} from '@/components/portfolio/sections';

// ============================================================================
// RENDERER PROPS
// ============================================================================

interface PortfolioRendererProps {
  /** The complete portfolio plan to render */
  plan: PortfolioPlan;
  /** Current page slug (for multi-page navigation) */
  currentPageSlug?: string;
  /** User overrides on top of AI generation */
  overrides?: PortfolioUserOverrides | null;
  /** Force light/dark mode. If omitted, follows system preference. */
  colorMode?: 'light' | 'dark';
  /** Whether this is a preview (disables links, adds overlay) */
  isPreview?: boolean;
}

// ============================================================================
// MAIN RENDERER
// ============================================================================

export function PortfolioRenderer({
  plan,
  currentPageSlug,
  overrides,
  colorMode = 'light',
  isPreview = false,
}: PortfolioRendererProps) {
  // Determine which page to render
  const activeSlug =
    currentPageSlug ?? plan.pages.find((p) => p.isPrimary)?.slug ?? plan.pages[0]?.slug;
  const activePage = plan.pages.find((p) => p.slug === activeSlug);

  // Resolve style tokens
  const styleVars = useMemo(
    () => resolveStyleTokens(plan.style, colorMode),
    [plan.style, colorMode]
  );

  // Apply overrides to sections
  const resolvedSections = useMemo(() => {
    if (!activePage) return [];
    return applySectionOverrides(activePage.sections, overrides);
  }, [activePage, overrides]);

  if (!activePage) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Page not found.</p>
      </div>
    );
  }

  return (
    <div
      data-portfolio-root=""
      data-portfolio-theme={plan.style.colorTheme}
      data-portfolio-preview={isPreview ? '' : undefined}
      style={styleVars as React.CSSProperties}
      className="min-h-screen"
    >
      {/* Navigation */}
      <PortfolioNavigation config={plan.navigation} currentSlug={activeSlug} />

      {/* Page Content */}
      <main>
        {resolvedSections.map((section) => {
          const Component = SECTION_COMPONENT_MAP[section.component];
          if (!Component) return null;

          const headingOverride = overrides?.sectionHeadings?.[section.id];

          return (
            <Component
              key={section.id}
              content={section.content}
              variant={section.variant}
              animationLevel={plan.style.animationLevel}
              intro={section.intro}
              heading={headingOverride || section.heading}
            />
          );
        })}
      </main>

      {/* Footer */}
      <PortfolioFooter config={plan.footer} handle={plan.handle} />

      {/* Preview Overlay */}
      {isPreview && (
        <div className="pointer-events-none fixed inset-0 z-[100] rounded-lg border-4 border-dashed border-blue-400/30" />
      )}
    </div>
  );
}

// ============================================================================
// OVERRIDES
// ============================================================================

function applySectionOverrides(
  sections: PortfolioSection[],
  overrides?: PortfolioUserOverrides | null
): PortfolioSection[] {
  if (!overrides) return sections;

  let result = sections;

  // Apply visibility overrides
  if (overrides.sectionVisibility) {
    result = result.map((s) => ({
      ...s,
      visible:
        overrides.sectionVisibility[s.id] !== undefined
          ? overrides.sectionVisibility[s.id]
          : s.visible,
    }));
  }

  // Filter out invisible sections
  result = result.filter((s) => s.visible);

  // Apply order overrides
  if (overrides.sectionOrder && overrides.sectionOrder.length > 0) {
    const orderMap = new Map(overrides.sectionOrder.map((id, i) => [id, i]));
    result = [...result].sort((a, b) => {
      const aOrder = orderMap.get(a.id) ?? a.priority;
      const bOrder = orderMap.get(b.id) ?? b.priority;
      return aOrder - bOrder;
    });
  }

  return result;
}

// ============================================================================
// SINGLE-PAGE WRAPPER (convenience)
// ============================================================================

/**
 * Renders the primary page of a portfolio plan.
 * Use this for the default /u/[handle] view.
 */
export function PortfolioPrimaryPage({
  plan,
  overrides,
  colorMode,
}: {
  plan: PortfolioPlan;
  overrides?: PortfolioUserOverrides | null;
  colorMode?: 'light' | 'dark';
}) {
  return <PortfolioRenderer plan={plan} overrides={overrides} colorMode={colorMode} />;
}
