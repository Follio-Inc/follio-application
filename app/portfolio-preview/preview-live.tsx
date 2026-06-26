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
  type PreviewReadyMessage,
} from '@/lib/portfolio/preview-messages';

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

export function PreviewLive({ profile, initialDraft, githubProfile = null }: PreviewLiveProps) {
  const [draft, setDraft] = useState<TemplatePortfolio>(initialDraft);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only trust messages from our own origin (the editor in the parent frame).
      if (event.origin !== window.location.origin) return;
      if (isPreviewDraftMessage(event.data)) {
        setDraft(event.data.draft);
      }
    }

    window.addEventListener('message', onMessage);

    // Tell the editor we're ready to receive the latest draft.
    const ready: PreviewReadyMessage = { type: PREVIEW_READY };
    window.parent?.postMessage(ready, window.location.origin);

    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <TemplatePortfolioView profile={profile} templateData={draft} githubProfile={githubProfile} />
  );
}
