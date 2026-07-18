'use client';

/**
 * Live Preview Bridge (runs inside the editor's preview iframe)
 *
 * Renders the portfolio with the exact public template pipeline, but lets the
 * parent editor stream draft updates in real time via `postMessage`. On mount
 * it announces readiness so the editor can push the freshest draft, then it
 * swaps to each new draft as the user types — no reload, no blank flash.
 */

import { useEffect, useState } from 'react';

import {
  PREVIEW_READY,
  isPreviewDraftMessage,
  isPreviewScrollToSectionMessage,
  type PreviewReadyMessage,
} from '@/lib/portfolio/preview-messages';
import { PortfolioEditorPreviewProvider } from '@/lib/portfolio/preview-editable-section';

import { TemplatePortfolioView } from '../u/[handle]/views/template-portfolio-view';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';
import type { PublicProfile } from '@/types';

interface PreviewLiveProps {
  profile: PublicProfile;
  initialDraft: TemplatePortfolio;
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

function scrollPreviewToSection(sectionId: string) {
  const target = document.querySelector(`[data-portfolio-section-id="${CSS.escape(sectionId)}"]`);
  if (!(target instanceof HTMLElement)) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function PreviewLive({ profile, initialDraft, githubProfile = null }: PreviewLiveProps) {
  const [draft, setDraft] = useState<TemplatePortfolio>(initialDraft);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only trust messages from our own origin (the editor in the parent frame).
      if (event.origin !== window.location.origin) return;
      if (isPreviewDraftMessage(event.data)) {
        setDraft(event.data.draft);
        return;
      }
      if (isPreviewScrollToSectionMessage(event.data)) {
        scrollPreviewToSection(event.data.sectionId);
      }
    }

    window.addEventListener('message', onMessage);

    // Tell the editor we're ready to receive the latest draft.
    const ready: PreviewReadyMessage = { type: PREVIEW_READY };
    window.parent?.postMessage(ready, window.location.origin);

    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <PortfolioEditorPreviewProvider>
      <TemplatePortfolioView profile={profile} templateData={draft} githubProfile={githubProfile} />
    </PortfolioEditorPreviewProvider>
  );
}
