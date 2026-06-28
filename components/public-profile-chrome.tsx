'use client';

import { createContext, useContext, useMemo, useState } from 'react';

import { ExternalViewToggle } from '@/components/external-view-toggle';
import { PublicProfileFooter } from '@/components/public-profile-footer';
import { SiteHeader } from '@/components/site-header';
import {
  resolvePublicProfileChrome,
  type PublicProfileAuthState,
} from '@/lib/public-profile-chrome';
import { cn } from '@/lib/utils';

interface PublicProfileChromeContextValue {
  effectiveAuthState: PublicProfileAuthState;
  isExternalView: boolean;
  isVisitorChrome: boolean;
}

const PublicProfileChromeContext = createContext<PublicProfileChromeContextValue | null>(null);

export function usePublicProfileChrome() {
  return useContext(PublicProfileChromeContext);
}

/** Auth state as page content should render it (owner preview → anonymous). */
export function useEffectiveAuthState(fallback: PublicProfileAuthState): PublicProfileAuthState {
  const ctx = usePublicProfileChrome();
  return ctx?.effectiveAuthState ?? fallback;
}

interface PublicProfileChromeProps {
  authState: PublicProfileAuthState;
  profileHandle: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Orchestrates public resume/portfolio chrome:
 * - Anonymous visitors: no top bar, platform footer at the bottom.
 * - Authenticated viewers: workspace top bar.
 * - Owners: optional external-view preview that hides the top bar and
 *   shows the visitor footer instead.
 */
export function PublicProfileChrome({ authState, children, className }: PublicProfileChromeProps) {
  const [externalView, setExternalView] = useState(false);

  const chrome = useMemo(
    () => resolvePublicProfileChrome(authState, externalView),
    [authState, externalView]
  );

  const contextValue = useMemo<PublicProfileChromeContextValue>(
    () => ({
      effectiveAuthState: chrome.effectiveAuthState,
      isExternalView: authState === 'owner' && externalView,
      isVisitorChrome: chrome.isVisitorChrome,
    }),
    [authState, chrome.effectiveAuthState, chrome.isVisitorChrome, externalView]
  );

  const showHeaderSlot = authState !== 'anonymous';

  return (
    <PublicProfileChromeContext.Provider value={contextValue}>
      <div
        className={cn('min-h-screen bg-background', className)}
        data-follio-chrome={chrome.isVisitorChrome ? 'visitor' : 'workspace'}
        style={
          {
            '--follio-chrome-offset': chrome.isVisitorChrome ? '0px' : '3.5rem',
          } as React.CSSProperties
        }
      >
        {showHeaderSlot ? (
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-300 ease-in-out',
              chrome.showHeader ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
            aria-hidden={!chrome.showHeader}
          >
            <div className="overflow-hidden">
              {/* Static (not sticky) so the bar scrolls away; portfolio nav sticks after. */}
              <SiteHeader authState={authState} className="!static" />
            </div>
          </div>
        ) : null}

        {chrome.showExternalToggle ? (
          <ExternalViewToggle
            active={externalView}
            onToggle={() => setExternalView((value) => !value)}
            headerVisible={chrome.showHeader}
          />
        ) : null}

        {children}

        {chrome.isVisitorChrome ? <PublicProfileFooter /> : null}
      </div>
    </PublicProfileChromeContext.Provider>
  );
}
