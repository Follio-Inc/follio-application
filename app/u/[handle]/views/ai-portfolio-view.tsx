'use client';

/**
 * AI-Generated Portfolio View
 *
 * Renders the AI-generated portfolio when one exists.
 * Falls back to the default PortfolioView when no generated portfolio is available.
 *
 * This component:
 * 1. Receives the serialized PortfolioPlan from the server
 * 2. Detects system color preference
 * 3. Renders via the PortfolioRenderer
 */

import { useEffect, useState } from 'react';

import type { PortfolioPlan, PortfolioUserOverrides } from '@/types/portfolio';

import { PortfolioDebugPanel } from '@/components/portfolio/debug-panel';
import { PortfolioRenderer } from '@/components/portfolio/renderer';

import '@/lib/portfolio/portfolio-theme.css';

interface AIPortfolioViewProps {
  /** The serialized portfolio plan from the server. */
  plan: PortfolioPlan;
  /** Optional user overrides for section visibility, ordering, etc. */
  overrides?: PortfolioUserOverrides | null;
  /** Current page slug for multi-page portfolios. */
  pageSlug?: string;
  /** Whether this is a preview rendering (used in dashboard). */
  isPreview?: boolean;
  /** Whether the viewer is the portfolio owner (shows debug panel). */
  isOwner?: boolean;
}

export function AIPortfolioView({
  plan,
  overrides,
  pageSlug,
  isPreview = false,
  isOwner = false,
}: AIPortfolioViewProps) {
  const colorMode = useColorMode();

  return (
    <>
      <PortfolioRenderer
        plan={plan}
        currentPageSlug={pageSlug}
        overrides={overrides}
        colorMode={colorMode}
        isPreview={isPreview}
      />
      <PortfolioDebugPanel plan={plan} isOwner={isOwner} />
    </>
  );
}

/**
 * Hook to detect system color preference.
 * Returns 'light' or 'dark' based on prefers-color-scheme.
 */
function useColorMode(): 'light' | 'dark' {
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Check if dark class is on html (next-themes pattern)
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      setMode('dark');
    }

    // Also listen for system preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setMode(e.matches ? 'dark' : 'light');
    };

    if (mq.matches) setMode('dark');
    mq.addEventListener('change', handler);

    // Observe class changes on html for theme toggling
    const observer = new MutationObserver(() => {
      setMode(html.classList.contains('dark') ? 'dark' : 'light');
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mq.removeEventListener('change', handler);
      observer.disconnect();
    };
  }, []);

  return mode;
}
