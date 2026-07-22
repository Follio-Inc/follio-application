'use client';

import { useUser } from '@clerk/nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Github, Globe, Link2, Linkedin, Loader2, RefreshCw, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BUBBLE_CORNER_RECT,
  BUBBLE_CORNER_SQUARE,
  BUBBLE_PLATFORMS,
  type BadgeCorner,
  type BubbleIdentity,
  type BubblePlatformDef,
  type BubblePlatformId,
  type BubbleSize,
  bubbleCornerClass,
  extractMediumUsername,
  extractSubstackIdentifier,
  extractGitHubUsername,
  extractLinkedInSlug,
  extractYouTubeChannel,
  getOauthExpandedTilePx,
  hexToRgb,
  identityFromGitHubImport,
  identityFromGoogleImport,
  identityFromLinkHandle,
  identityFromLinkedInImport,
  layoutBubbleField,
  nextBubbleStateAfterManage,
  normalizePastedUrl,
  packPhotoWall,
} from './bubble-platforms';
import { cn } from '@/lib/utils';

// ─── Brand icons ──────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.016 3.016 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.016 3.016 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
        fill="#FF0000"
      />
    </svg>
  );
}

function MediumIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42zm2.94 0c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75c.66 0 1.19 2.58 1.19 5.75z" />
    </svg>
  );
}

function SubstackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"
        fill="#FF6719"
      />
    </svg>
  );
}

function PlatformIcon({ id, className }: { id: BubblePlatformId; className?: string }) {
  switch (id) {
    case 'github':
      return <Github className={className} />;
    case 'linkedin':
      return <Linkedin className={cn(className, 'text-[#0A66C2]')} />;
    case 'google':
      return <GoogleIcon className={className} />;
    case 'youtube':
      return <YouTubeIcon className={className} />;
    case 'medium':
      return <MediumIcon className={className} />;
    case 'substack':
      return <SubstackIcon className={className} />;
    case 'portfolio':
      return <Globe className={className} />;
    case 'links':
      return <Link2 className={className} />;
  }
}

// ─── Size maps — larger heroes for a more confident idle state ────

const HERO_ICON: Record<BubbleSize, string> = {
  sm: 'h-10 w-10',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
  xl: 'h-16 w-16',
};

const HERO_WELL: Record<BubbleSize, string> = {
  sm: 'h-[4.5rem] w-[4.5rem]',
  md: 'h-[5.25rem] w-[5.25rem]',
  lg: 'h-24 w-24',
  xl: 'h-[7rem] w-[7rem]',
};

const AVATAR_SIZE: Record<BubbleSize, string> = {
  sm: 'h-16 w-16',
  md: 'h-[4.75rem] w-[4.75rem]',
  lg: 'h-24 w-24',
  xl: 'h-28 w-28',
};

const BADGE_SIZE: Record<BubbleSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-9 w-9',
  xl: 'h-10 w-10',
};

const BADGE_ICON: Record<BubbleSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-[1.1rem] w-[1.1rem]',
  xl: 'h-5 w-5',
};

/** Venn-style overlap — badge straddles the avatar corner. */
const VENN_CORNER: Record<BadgeCorner, string> = {
  tl: '-left-2.5 -top-2.5',
  tr: '-right-2.5 -top-2.5',
  bl: '-bottom-2.5 -left-2.5',
  br: '-bottom-2.5 -right-2.5',
};

// ─── Types ────────────────────────────────────────────────────────

type BubbleStatus = 'idle' | 'connecting' | 'importing' | 'success' | 'error';

interface BubbleState {
  status: BubbleStatus;
  identity: BubbleIdentity | null;
  error?: string;
  input: string;
}

const INITIAL_STATES: Record<BubblePlatformId, BubbleState> = {
  github: { status: 'idle', identity: null, input: '' },
  linkedin: { status: 'idle', identity: null, input: '' },
  google: { status: 'idle', identity: null, input: '' },
  youtube: { status: 'idle', identity: null, input: '' },
  medium: { status: 'idle', identity: null, input: '' },
  substack: { status: 'idle', identity: null, input: '' },
  portfolio: { status: 'idle', identity: null, input: '' },
  links: { status: 'idle', identity: null, input: '' },
};

export interface PlatformBubblesPlaygroundProps {
  /** Persist wizard state before OAuth full-page redirect. */
  onBeforeOAuth?: () => Promise<void> | void;
  /** Notifies the parent whenever at least one platform is connected. */
  onConnectedChange?: (hasConnection: boolean) => void;
}

// ─── Connecting ring — a sleek branded arc that orbits the icon ────

function ConnectingRing({ brand, size }: { brand: string; size: BubbleSize }) {
  const dim = size === 'xl' ? 96 : size === 'lg' ? 84 : size === 'md' ? 72 : 64;
  const rgb = hexToRgb(brand);
  return (
    <motion.svg
      width={dim}
      height={dim}
      viewBox="0 0 100 100"
      className="absolute"
      animate={{ rotate: 360 }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
      aria-hidden
    >
      <circle cx="50" cy="50" r="44" fill="none" stroke={`rgba(${rgb}, 0.14)`} strokeWidth="5" />
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke={`rgb(${rgb})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="70 210"
      />
    </motion.svg>
  );
}

// ─── Component ────────────────────────────────────────────────────

export function PlatformBubblesPlayground({
  onBeforeOAuth,
  onConnectedChange,
}: PlatformBubblesPlaygroundProps) {
  const { user, isLoaded } = useUser();
  const [activeId, setActiveId] = useState<BubblePlatformId | null>(null);
  const [hoverId, setHoverId] = useState<BubblePlatformId | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [stageScale, setStageScale] = useState(1);
  const [states, setStates] = useState(INITIAL_STATES);
  const [actionBusy, setActionBusy] = useState<{
    id: BubblePlatformId;
    action: 'remove' | 'reimport';
  } | null>(null);
  const autoImported = useRef<Set<BubblePlatformId>>(new Set());

  const wall = useMemo(() => packPhotoWall(BUBBLE_PLATFORMS, { startWithSquare: true }), []);
  const tileById = useMemo(() => new Map(wall.tiles.map((t) => [t.id, t])), [wall.tiles]);
  const metaById = useMemo(
    () => new Map(layoutBubbleField(BUBBLE_PLATFORMS, 77).map((m) => [m.id, m])),
    []
  );

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const sync = () => {
      const width = field.clientWidth;
      const height = field.clientHeight;
      if (width <= 0 || height <= 0) return;
      // Fit the design stage inside both axes so the page footer stays on-screen
      setStageScale(Math.min(1, width / wall.canvasW, height / wall.canvasH));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(field);
    return () => ro.disconnect();
  }, [wall.canvasW, wall.canvasH]);

  const patch = useCallback((id: BubblePlatformId, partial: Partial<BubbleState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...partial } }));
  }, []);

  const connectedGithub = user?.externalAccounts?.find((a) => a.provider === 'github');
  const connectedLinkedin = user?.externalAccounts?.find((a) => {
    const p = a.provider as string;
    return (
      p === 'linkedin_oidc' ||
      p === 'linkedin' ||
      p === 'oauth_linkedin_oidc' ||
      p === 'oauth_linkedin'
    );
  });
  const connectedGoogle = user?.externalAccounts?.find((a) => {
    const p = a.provider as string;
    return p === 'google' || p === 'oauth_google' || p === 'google_oidc';
  });

  useEffect(() => {
    if (!isLoaded) return;

    if (connectedGithub && states.github.status === 'idle' && !states.github.identity) {
      patch('github', {
        identity: {
          displayName: connectedGithub.username ? `@${connectedGithub.username}` : 'GitHub',
          avatarUrl: connectedGithub.imageUrl,
        },
      });
    }

    if (connectedLinkedin && states.linkedin.status === 'idle' && !states.linkedin.identity) {
      const name =
        [connectedLinkedin.firstName, connectedLinkedin.lastName].filter(Boolean).join(' ') ||
        connectedLinkedin.username ||
        'LinkedIn';
      patch('linkedin', {
        identity: { displayName: name, avatarUrl: connectedLinkedin.imageUrl },
      });
    }

    if (connectedGoogle && states.google.status === 'idle' && !states.google.identity) {
      const name =
        [connectedGoogle.firstName, connectedGoogle.lastName].filter(Boolean).join(' ') ||
        connectedGoogle.emailAddress ||
        'Google';
      patch('google', {
        identity: { displayName: name, avatarUrl: connectedGoogle.imageUrl },
      });
    }
  }, [
    isLoaded,
    connectedGithub,
    connectedLinkedin,
    connectedGoogle,
    states.github.status,
    states.github.identity,
    states.linkedin.status,
    states.linkedin.identity,
    states.google.status,
    states.google.identity,
    patch,
  ]);

  useEffect(() => {
    if (!isLoaded) return;

    const run = async (
      id: 'github' | 'linkedin' | 'google',
      ready: boolean,
      importFn: () => Promise<void>
    ) => {
      if (!ready || autoImported.current.has(id)) return;
      if (states[id].status === 'success' || states[id].status === 'importing') return;
      autoImported.current.add(id);
      await importFn();
    };

    void run('github', Boolean(connectedGithub?.username), () =>
      importOAuth('github', connectedGithub?.username ?? undefined)
    );
    void run('linkedin', Boolean(connectedLinkedin), () => importOAuth('linkedin'));
    void run('google', Boolean(connectedGoogle), () => importOAuth('google'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once accounts appear
  }, [isLoaded, connectedGithub?.username, connectedLinkedin?.id, connectedGoogle?.id]);

  const connectOAuth = async (platform: BubblePlatformDef) => {
    if (!platform.oauthStrategy || !user) return;

    const primaryEmail = user.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      patch(platform.id, {
        status: 'error',
        error: 'Verify your email before connecting accounts.',
      });
      return;
    }

    patch(platform.id, { status: 'connecting', error: undefined });
    try {
      await onBeforeOAuth?.();
      const externalAccount = await user.createExternalAccount({
        strategy: platform.oauthStrategy,
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
        return;
      }
      patch(platform.id, { status: 'idle' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already connected')) {
        await user.reload();
        patch(platform.id, { status: 'idle', error: undefined });
      } else {
        patch(platform.id, { status: 'error', error: msg });
      }
    }
  };

  const importOAuth = async (id: 'github' | 'linkedin' | 'google', githubUsername?: string) => {
    patch(id, { status: 'importing', error: undefined });
    try {
      if (id === 'github') {
        const username = githubUsername || connectedGithub?.username;
        if (!username) throw new Error('GitHub username unavailable');
        const response = await fetch('/api/import/github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to import GitHub');
        const identity =
          identityFromGitHubImport(data.data) ||
          ({
            displayName: `@${username}`,
            avatarUrl: connectedGithub?.imageUrl,
          } satisfies BubbleIdentity);
        patch(id, { status: 'success', identity, error: undefined });
        setActiveId(null);
        return;
      }

      if (id === 'linkedin') {
        const response = await fetch('/api/import/linkedin/oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to import LinkedIn');
        const identity =
          identityFromLinkedInImport(data.data) ||
          ({
            displayName:
              [connectedLinkedin?.firstName, connectedLinkedin?.lastName]
                .filter(Boolean)
                .join(' ') || 'LinkedIn',
            avatarUrl: connectedLinkedin?.imageUrl,
          } satisfies BubbleIdentity);
        patch(id, { status: 'success', identity, error: undefined });
        setActiveId(null);
        return;
      }

      const response = await fetch('/api/import/google/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to import Google');
      const identity =
        identityFromGoogleImport(data.data) ||
        ({
          displayName:
            [connectedGoogle?.firstName, connectedGoogle?.lastName].filter(Boolean).join(' ') ||
            connectedGoogle?.emailAddress ||
            'Google',
          avatarUrl: connectedGoogle?.imageUrl,
        } satisfies BubbleIdentity);
      patch(id, { status: 'success', identity, error: undefined });
      setActiveId(null);
    } catch (err) {
      patch(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed',
      });
    }
  };

  const resetBubble = useCallback(
    (id: BubblePlatformId, options?: { keepInput?: boolean }) => {
      autoImported.current.delete(id);
      patch(id, {
        status: 'idle',
        identity: null,
        error: undefined,
        ...(options?.keepInput ? {} : { input: '' }),
      });
    },
    [patch]
  );

  const destroyOAuthAccount = async (id: 'github' | 'linkedin' | 'google') => {
    const account =
      id === 'github' ? connectedGithub : id === 'linkedin' ? connectedLinkedin : connectedGoogle;
    if (!account) return;
    await account.destroy();
    await user?.reload();
  };

  /** Clear a connection so the bubble returns to idle (and OAuth is unlinked). */
  const removeConnection = async (platform: BubblePlatformDef) => {
    setActionBusy({ id: platform.id, action: 'remove' });
    patch(platform.id, { error: undefined });
    try {
      if (platform.authMode === 'oauth') {
        await destroyOAuthAccount(platform.id as 'github' | 'linkedin' | 'google');
      }
      const next = nextBubbleStateAfterManage(
        platform.authMode,
        'remove',
        states[platform.id].input
      );
      resetBubble(platform.id, { keepInput: next.keepInput });
      setActiveId(null);
    } catch (err) {
      patch(platform.id, {
        error: err instanceof Error ? err.message : 'Failed to remove connection',
      });
    } finally {
      setActionBusy(null);
    }
  };

  /** Re-fetch profile data for an already-connected platform. */
  const reimportConnection = async (platform: BubblePlatformDef) => {
    setActionBusy({ id: platform.id, action: 'reimport' });
    patch(platform.id, { error: undefined });
    try {
      if (platform.authMode === 'oauth') {
        await importOAuth(
          platform.id as 'github' | 'linkedin' | 'google',
          connectedGithub?.username ?? undefined
        );
      } else {
        await importLink(platform);
      }
    } finally {
      setActionBusy(null);
    }
  };

  const importLink = async (platform: BubblePlatformDef) => {
    const raw = states[platform.id].input.trim();
    if (!raw) {
      patch(platform.id, { status: 'error', error: 'Enter a value first' });
      return;
    }

    patch(platform.id, { status: 'importing', error: undefined });
    try {
      // OAuth platforms can also be added via a pasted profile / URL (no login).
      if (platform.authMode === 'oauth') {
        if (platform.id === 'github') {
          const username = extractGitHubUsername(raw);
          if (!username) throw new Error('Enter a GitHub username or profile URL');
          const response = await fetch('/api/import/github', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to import GitHub');
          const identity =
            identityFromGitHubImport(data.data) ||
            ({ displayName: `@${username}` } satisfies BubbleIdentity);
          patch(platform.id, { status: 'success', identity, error: undefined });
          setActiveId(null);
          return;
        }

        const normalized = normalizePastedUrl(raw);
        try {
          new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`);
        } catch {
          throw new Error('Enter a valid profile URL');
        }
        const url = normalized.startsWith('http') ? normalized : `https://${normalized}`;
        const response = await fetch('/api/import/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ links: [url], saveToProfile: false }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to save link');

        if (platform.id === 'linkedin') {
          const slug = extractLinkedInSlug(raw);
          patch(platform.id, {
            status: 'success',
            identity: {
              displayName: slug || identityFromLinkHandle('links', url, data.data).displayName,
              secondary: 'Linked via URL',
            },
          });
        } else {
          patch(platform.id, {
            status: 'success',
            identity: identityFromLinkHandle('links', url, data.data),
          });
        }
        setActiveId(null);
        return;
      }

      if (platform.id === 'youtube') {
        const channel = extractYouTubeChannel(raw);
        const response = await fetch('/api/import/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed');
        patch(platform.id, {
          status: 'success',
          identity: identityFromLinkHandle('youtube', channel, data.data),
        });
        setActiveId(null);
        return;
      }

      if (platform.id === 'medium') {
        const username = extractMediumUsername(raw);
        if (!username) throw new Error('Enter a Medium username or URL');
        const response = await fetch('/api/import/medium', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed');
        patch(platform.id, {
          status: 'success',
          identity: identityFromLinkHandle('medium', username, data.data),
        });
        setActiveId(null);
        return;
      }

      if (platform.id === 'substack') {
        const identifier = extractSubstackIdentifier(raw);
        if (!identifier) throw new Error('Enter a Substack name or URL');
        const response = await fetch('/api/import/medium', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'substack', identifier }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed');
        patch(platform.id, {
          status: 'success',
          identity: identityFromLinkHandle('substack', identifier, data.data),
        });
        setActiveId(null);
        return;
      }

      // Portfolio or generic link
      try {
        new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      } catch {
        throw new Error('Enter a valid URL');
      }
      const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
      const response = await fetch('/api/import/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: [normalized], saveToProfile: false }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed');
      const linkId = platform.id === 'portfolio' ? 'portfolio' : 'links';
      patch(platform.id, {
        status: 'success',
        identity: identityFromLinkHandle(linkId, normalized, data.data),
      });
      setActiveId(null);
    } catch (err) {
      patch(platform.id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed',
      });
    }
  };

  const connectedCount = BUBBLE_PLATFORMS.filter((p) => Boolean(states[p.id].identity)).length;

  useEffect(() => {
    onConnectedChange?.(connectedCount > 0);
  }, [connectedCount, onConnectedChange]);

  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId]);

  return (
    <div className="relative -mx-4 flex min-h-0 flex-1 flex-col sm:-mx-6">
      <div
        ref={fieldRef}
        className="relative min-h-[16rem] w-full flex-1 overflow-hidden rounded-[1.75rem] border border-border/40 sm:rounded-[2rem]"
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 18% 8%, hsl(235 64% 52% / 0.10), transparent 55%), radial-gradient(ellipse 80% 55% at 88% 82%, hsl(210 55% 52% / 0.09), transparent 52%), radial-gradient(ellipse 60% 45% at 55% 105%, hsl(18 70% 55% / 0.06), transparent 48%), linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--muted) / 0.5) 100%)',
        }}
        onClick={() => setActiveId(null)}
      >
        {/* Fine grain for depth */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, hsl(var(--foreground) / 0.045) 1px, transparent 0)',
            backgroundSize: '30px 30px',
            maskImage: 'radial-gradient(ellipse 75% 75% at 50% 50%, black, transparent 100%)',
          }}
        />
        {/* Top + bottom soft vignette */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, hsl(var(--background) / 0.35) 0%, transparent 18%, transparent 82%, hsl(var(--background) / 0.35) 100%)',
          }}
        />

        {/* Header */}
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center px-4 text-center sm:top-5">
          <div className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/70 px-3 py-1 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
              {connectedCount > 0
                ? `${connectedCount} connected — hover to refresh or remove`
                : 'Tap a bubble to connect · you’ll return right here'}
            </span>
          </div>
        </div>

        {/* Design stage scales to fit width + height — gutters stay correct */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: wall.canvasW,
            height: wall.canvasH,
            transform: `translate(-50%, -50%) scale(${stageScale})`,
          }}
        >
          {BUBBLE_PLATFORMS.map((platform) => {
            const tile = tileById.get(platform.id);
            const meta = metaById.get(platform.id);
            if (!tile || !meta) return null;
            const state = states[platform.id];
            const isActive = activeId === platform.id;
            const isHovered = hoverId === platform.id;
            const isAdded = Boolean(state.identity) && state.status !== 'idle';
            const busy = state.status === 'connecting' || state.status === 'importing';
            const removing = actionBusy?.id === platform.id && actionBusy.action === 'remove';
            const reimporting =
              (actionBusy?.id === platform.id && actionBusy.action === 'reimport') ||
              (busy && Boolean(state.identity));
            const rgb = hexToRgb(platform.brand);
            /** OAuth squares expand to the right for Connect + paste; pack layout stays square. */
            const oauthExpanding = platform.authMode === 'oauth' && isActive && !isAdded && !busy;
            const expanded = oauthExpanding ? getOauthExpandedTilePx(platform.size) : null;
            const displayWidth = expanded?.width ?? tile.width;
            const displayHeight = tile.height;
            const lifted = (isHovered || isActive) && !oauthExpanding;
            const displayShape = oauthExpanding ? 'rect' : platform.shape;

            const boxShadow = isAdded
              ? `0 18px 40px -20px rgba(${rgb}, 0.45), 0 4px 14px -8px rgba(0,0,0,0.18)`
              : lifted || oauthExpanding
                ? `0 26px 55px -22px rgba(${rgb}, 0.55), 0 8px 22px -12px rgba(0,0,0,0.22)`
                : `0 12px 34px -18px rgba(0,0,0,0.22)`;

            return (
              <motion.div
                key={platform.id}
                className={cn('absolute', isActive ? 'z-40' : isHovered ? 'z-30' : 'z-20')}
                style={{
                  left: tile.left,
                  top: tile.top,
                  height: displayHeight,
                  transformOrigin: platform.authMode === 'oauth' ? 'left center' : 'center center',
                }}
                initial={{ opacity: 0, scale: 0.7, width: tile.width }}
                animate={{
                  opacity: 1,
                  scale: lifted ? 1.02 : 1,
                  width: displayWidth,
                  y: isAdded || isActive ? 0 : [0, -2, 0, 1.5, 0],
                }}
                transition={{
                  opacity: { duration: 0.45, delay: meta.driftDelay * 0.12 },
                  scale: { type: 'spring', stiffness: 340, damping: 22 },
                  width: { type: 'spring', stiffness: 420, damping: 32 },
                  y:
                    isAdded || isActive
                      ? { type: 'spring', stiffness: 320, damping: 28 }
                      : {
                          duration: meta.driftDuration,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: meta.driftDelay,
                        },
                }}
                onMouseEnter={() => setHoverId(platform.id)}
                onMouseLeave={() => setHoverId((h) => (h === platform.id ? null : h))}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className={cn(
                    'relative flex h-full w-full flex-col overflow-hidden border backdrop-blur-xl transition-[border-radius] duration-300',
                    bubbleCornerClass(displayShape),
                    isAdded ? 'border-border/60' : 'border-white/50'
                  )}
                  style={{
                    boxShadow,
                    background: isAdded
                      ? 'linear-gradient(160deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.92) 100%)'
                      : `linear-gradient(160deg, hsl(${platform.tint} / 0.95) 0%, hsl(${platform.tint} / 0.7) 100%)`,
                  }}
                >
                  {/* Glossy top highlight */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[inherit]"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, transparent 100%)',
                      opacity: isAdded ? 0.25 : 0.4,
                    }}
                  />

                  <AnimatePresence mode="wait" initial={false}>
                    {/* ── EDITOR (expanding over the icon) ── */}
                    {isActive && !isAdded ? (
                      <motion.div
                        key="editor"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="relative flex h-full flex-col justify-between gap-1.5 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center bg-background/80 ring-1 ring-inset ring-border/50',
                              BUBBLE_CORNER_RECT
                            )}
                            style={{ boxShadow: `inset 0 0 0 1px rgba(${rgb}, 0.15)` }}
                          >
                            <PlatformIcon id={platform.id} className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight tracking-tight">
                              {platform.label}
                            </p>
                            <p className="text-[11px] leading-tight text-muted-foreground">
                              {platform.hint}
                            </p>
                          </div>
                        </div>

                        {platform.authMode === 'oauth' ? (
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <Button
                              className="w-full gap-2"
                              size="sm"
                              disabled={busy || !isLoaded}
                              onClick={() => {
                                const already =
                                  (platform.id === 'github' && connectedGithub) ||
                                  (platform.id === 'linkedin' && connectedLinkedin) ||
                                  (platform.id === 'google' && connectedGoogle);
                                if (already) {
                                  void importOAuth(
                                    platform.id as 'github' | 'linkedin' | 'google',
                                    connectedGithub?.username ?? undefined
                                  );
                                } else {
                                  void connectOAuth(platform);
                                }
                              }}
                            >
                              {busy && state.status === 'connecting' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <PlatformIcon id={platform.id} className="h-4 w-4" />
                              )}
                              {busy && state.status === 'connecting'
                                ? 'Connecting…'
                                : (platform.id === 'github' && connectedGithub) ||
                                    (platform.id === 'linkedin' && connectedLinkedin) ||
                                    (platform.id === 'google' && connectedGoogle)
                                  ? 'Import with account'
                                  : `Connect ${platform.label}`}
                            </Button>

                            <div className="flex items-center gap-2">
                              <span className="h-px flex-1 bg-border/60" />
                              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                or paste link
                              </span>
                              <span className="h-px flex-1 bg-border/60" />
                            </div>

                            <div className="flex min-w-0 gap-2">
                              <Input
                                value={state.input}
                                onChange={(e) => patch(platform.id, { input: e.target.value })}
                                placeholder={platform.placeholder}
                                className="h-9 min-w-0 flex-1 text-sm"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void importLink(platform);
                                }}
                                disabled={busy}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                className="shrink-0 px-3"
                                disabled={busy || !state.input.trim()}
                                onClick={() => void importLink(platform)}
                              >
                                {busy && state.status === 'importing' ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Add'
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex min-w-0 gap-2">
                            <Input
                              value={state.input}
                              onChange={(e) => patch(platform.id, { input: e.target.value })}
                              placeholder={platform.placeholder}
                              className="h-9 min-w-0 flex-1 text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void importLink(platform);
                              }}
                              disabled={busy}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              className="shrink-0 px-3"
                              disabled={busy || !state.input.trim()}
                              onClick={() => void importLink(platform)}
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                            </Button>
                          </div>
                        )}

                        {state.error && (
                          <p className="text-[11px] leading-snug text-destructive" role="alert">
                            {state.error}
                          </p>
                        )}
                      </motion.div>
                    ) : busy && !state.identity ? (
                      /* ── CONNECTING / IMPORTING (first connect) ── */
                      <motion.div
                        key="busy"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="relative flex h-full w-full flex-col items-center justify-center gap-2.5"
                      >
                        <div className="relative flex items-center justify-center">
                          <ConnectingRing brand={platform.brand} size={platform.size} />
                          <motion.div
                            animate={{ scale: [1, 1.08, 1] }}
                            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            <PlatformIcon
                              id={platform.id}
                              className={cn(HERO_ICON[platform.size], 'text-foreground')}
                            />
                          </motion.div>
                        </div>
                        <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
                          {state.status === 'connecting' ? 'Connecting…' : 'Fetching…'}
                        </span>
                      </motion.div>
                    ) : isAdded && state.identity ? (
                      /* ── CONNECTED ── avatar hero + Venn-style brand badge */
                      <motion.div
                        key="added"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="relative flex h-full w-full flex-col items-center justify-center gap-2.5 px-3"
                        aria-label={`${platform.label} connected as ${state.identity.displayName}`}
                      >
                        <div className="relative">
                          {/* gradient ring wrapper */}
                          <div
                            className={cn(
                              'p-[2.5px]',
                              platform.shape === 'rect' ? BUBBLE_CORNER_RECT : BUBBLE_CORNER_SQUARE,
                              AVATAR_SIZE[platform.size]
                            )}
                            style={{
                              background: `linear-gradient(140deg, rgba(${rgb}, 0.9), rgba(${rgb}, 0.15))`,
                            }}
                          >
                            {state.identity.avatarUrl ? (
                              <div
                                className={cn(
                                  'relative h-full w-full overflow-hidden ring-2 ring-background',
                                  platform.shape === 'rect'
                                    ? BUBBLE_CORNER_RECT
                                    : BUBBLE_CORNER_SQUARE
                                )}
                              >
                                <Image
                                  src={state.identity.avatarUrl}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  'flex h-full w-full items-center justify-center bg-card ring-2 ring-background',
                                  platform.shape === 'rect'
                                    ? BUBBLE_CORNER_RECT
                                    : BUBBLE_CORNER_SQUARE
                                )}
                              >
                                <PlatformIcon
                                  id={platform.id}
                                  className={cn(HERO_ICON[platform.size], 'text-foreground')}
                                />
                              </div>
                            )}
                          </div>

                          {/* Official logo — overlaps the avatar corner like a Venn overlap */}
                          <motion.span
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                              delay: 0.12,
                              type: 'spring',
                              stiffness: 420,
                              damping: 20,
                            }}
                            className={cn(
                              'absolute z-10 flex items-center justify-center rounded-full bg-background shadow-md ring-2 ring-background',
                              BADGE_SIZE[platform.size],
                              VENN_CORNER[meta.badgeCorner]
                            )}
                            style={{ boxShadow: `0 4px 12px -3px rgba(${rgb}, 0.5)` }}
                            aria-hidden
                          >
                            <PlatformIcon id={platform.id} className={BADGE_ICON[platform.size]} />
                            <span
                              className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-background"
                              style={{ color: `rgb(${rgb})` }}
                            >
                              <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                            </span>
                          </motion.span>
                        </div>

                        {/* Name ↔ hover actions share the slot under the DP */}
                        <div className="relative flex h-7 w-full items-center justify-center">
                          <div
                            className={cn(
                              'absolute inset-x-0 flex flex-col items-center gap-0.5 transition-opacity duration-200',
                              isHovered || removing || reimporting
                                ? 'pointer-events-none opacity-0'
                                : 'opacity-100'
                            )}
                          >
                            <span className="max-w-[94%] truncate text-center text-[13px] font-semibold tracking-tight text-foreground">
                              {state.identity.displayName}
                            </span>
                            {state.identity.secondary && platform.size === 'xl' && (
                              <span className="max-w-[94%] truncate text-center text-[10px] text-muted-foreground">
                                {state.identity.secondary}
                              </span>
                            )}
                          </div>

                          <div
                            className={cn(
                              'flex items-center justify-center gap-1.5 transition-opacity duration-200',
                              isHovered || removing || reimporting
                                ? 'opacity-100'
                                : 'pointer-events-none opacity-0'
                            )}
                          >
                            <button
                              type="button"
                              disabled={Boolean(actionBusy) || (busy && !state.identity)}
                              aria-label={`Refresh ${platform.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void reimportConnection(platform);
                              }}
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-full',
                                'border border-border/50 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-md',
                                'transition-colors hover:border-border hover:text-foreground',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                                'disabled:pointer-events-none disabled:opacity-50'
                              )}
                            >
                              {reimporting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.25} />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(actionBusy) || (busy && !state.identity)}
                              aria-label={`Remove ${platform.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeConnection(platform);
                              }}
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-full',
                                'border border-border/50 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-md',
                                'transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                                'disabled:pointer-events-none disabled:opacity-50'
                              )}
                            >
                              {removing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      /* ── IDLE ── icon is the hero */
                      <motion.button
                        key="idle"
                        type="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        aria-label={`Connect ${platform.label}`}
                        aria-expanded={isActive}
                        onClick={() => setActiveId(platform.id)}
                        className={cn(
                          'relative flex h-full w-full items-center justify-center px-3 focus-visible:outline-none',
                          platform.shape === 'rect' ? 'flex-row gap-3' : 'flex-col gap-3'
                        )}
                      >
                        <motion.div
                          animate={{ scale: isHovered ? 1.08 : 1 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                          className={cn(
                            'flex shrink-0 items-center justify-center bg-background/70 ring-1 ring-inset ring-white/60',
                            platform.shape === 'rect' ? 'rounded-xl' : BUBBLE_CORNER_SQUARE,
                            platform.shape === 'rect' ? 'h-14 w-14' : HERO_WELL[platform.size]
                          )}
                          style={{
                            boxShadow: `inset 0 1px 6px rgba(255,255,255,0.6), 0 8px 20px -12px rgba(${rgb}, 0.6)`,
                          }}
                        >
                          <PlatformIcon
                            id={platform.id}
                            className={cn(
                              platform.shape === 'rect' ? 'h-8 w-8' : HERO_ICON[platform.size],
                              'text-foreground'
                            )}
                          />
                        </motion.div>
                        <span
                          className={cn(
                            'font-semibold tracking-tight text-foreground/90',
                            platform.shape === 'rect'
                              ? 'text-left text-sm'
                              : 'text-center text-[13px]'
                          )}
                        >
                          {platform.label}
                        </span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
