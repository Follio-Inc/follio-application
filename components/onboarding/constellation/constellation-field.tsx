'use client';

import { useUser } from '@clerk/nextjs';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Check, Loader2, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BrandIcon } from './brand-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CONNECTED_BADGE_RATIO,
  CONNECTED_SCALE,
  CONSTELLATION_DURATION,
  CONSTELLATION_EASE,
  PLATFORMS,
  centerConstellationHorizontally,
  constellationNeighborDelay,
  expandedHeight,
  expandedWidth,
  hexToRgb,
  layoutConstellation,
  platformUsesOAuth,
  previewPlatformIdentity,
  randomBadgeCorner,
  vennBadgeStyle,
  type BadgeCorner,
  type PlatformDef,
  type PlatformId,
  type PreviewIdentity,
} from '@/lib/onboarding/constellation/platforms';
import {
  ONBOARDING_CARD_DESCRIPTION,
  ONBOARDING_CARD_TITLE,
  ONBOARDING_CONSTELLATION_STAGE,
  ONBOARDING_QUIET_PILL,
  ONBOARDING_SUCCESS_PILL,
  ONBOARDING_SURFACE,
  ONBOARDING_SURFACE_PAD,
} from '@/lib/onboarding-ui';
import { cn } from '@/lib/utils';

type TileStatus = 'idle' | 'editing' | 'connecting' | 'importing' | 'connected' | 'error';
type OAuthPlatformId = 'github' | 'linkedin';

interface TileState {
  status: TileStatus;
  input: string;
  identity: PreviewIdentity | null;
  badgeCorner: BadgeCorner;
  error?: string;
}

export type ConstellationConnection = {
  identity: PreviewIdentity;
  badgeCorner: BadgeCorner;
};

function emptyStates(): Record<PlatformId, TileState> {
  return Object.fromEntries(
    PLATFORMS.map((p) => [
      p.id,
      { status: 'idle', input: '', identity: null, badgeCorner: p.badgeCorner },
    ])
  ) as Record<PlatformId, TileState>;
}

function statesFromConnected(
  connected?: Partial<Record<PlatformId, ConstellationConnection>>
): Record<PlatformId, TileState> {
  const next = emptyStates();
  if (!connected) return next;
  for (const platform of PLATFORMS) {
    const entry = connected[platform.id];
    if (!entry?.identity) continue;
    next[platform.id] = {
      status: 'connected',
      input: '',
      identity: entry.identity,
      badgeCorner: entry.badgeCorner ?? platform.badgeCorner,
    };
  }
  return next;
}

function initials(name: string): string {
  const parts = name
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function ConnectingRing({ brand, size }: { brand: string; size: number }) {
  const rgb = hexToRgb(brand);
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="absolute inset-0 m-auto"
      animate={{ rotate: 360 }}
      transition={{ duration: 1.05, repeat: Infinity, ease: 'linear' }}
      aria-hidden
    >
      <circle cx="50" cy="50" r="44" fill="none" stroke={`rgba(${rgb}, 0.12)`} strokeWidth="4" />
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke={`rgb(${rgb})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="64 200"
      />
    </motion.svg>
  );
}

function ConnectedAvatar({
  platform,
  identity,
  badgeCorner,
  animateBadge,
}: {
  platform: PlatformDef;
  identity: PreviewIdentity;
  badgeCorner: BadgeCorner;
  /** Skip entrance motion when hydrating an already-connected tile. */
  animateBadge?: boolean;
}) {
  const badge = Math.max(18, Math.round(platform.size * CONNECTED_BADGE_RATIO));
  const offset = vennBadgeStyle(badgeCorner, badge);

  return (
    <div className="relative h-full w-full overflow-visible">
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative overflow-hidden rounded-full shadow-[0_8px_24px_-12px_rgba(0,0,0,0.28)] ring-2 ring-background"
          style={{ width: '72%', height: '72%' }}
        >
          {identity.avatarUrl ? (
            <Image
              src={identity.avatarUrl}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-sm font-semibold tracking-tight text-white"
              style={{ background: platform.brand }}
            >
              {initials(identity.displayName)}
            </div>
          )}
        </div>
      </div>

      {/* Brand badge straddles the square tile corner — 50% in, 50% out */}
      <motion.div
        initial={animateBadge === false ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.08 }}
        className="absolute z-10 flex items-center justify-center rounded-full bg-card shadow-[0_4px_14px_-4px_rgba(0,0,0,0.28)] ring-2 ring-background"
        style={{ width: badge, height: badge, ...offset }}
        title={platform.label}
      >
        <BrandIcon id={platform.id} className="h-[52%] w-[52%]" />
      </motion.div>
    </div>
  );
}

export type ConstellationImportResult = {
  identity: PreviewIdentity;
};

export interface ConstellationFieldProps {
  onConnectedChange?: (count: number) => void;
  onHasActionChange?: (hasAction: boolean) => void;
  /**
   * Production import runner. When omitted, uses lab preview identity
   * (GitHub live API; other platforms parse-and-confirm).
   */
  importPlatform?: (platform: PlatformDef, input: string) => Promise<ConstellationImportResult>;
  /**
   * OAuth import for GitHub / LinkedIn after Clerk account is linked.
   * When omitted, Connect still starts OAuth but import must be provided in production.
   */
  importOAuth?: (platform: PlatformDef) => Promise<ConstellationImportResult>;
  /** Persist draft state before Clerk OAuth redirect. */
  onBeforeOAuthRedirect?: () => Promise<void>;
  /**
   * When true, auto-import once for already-connected GitHub / LinkedIn
   * (e.g. after OAuth redirect restore).
   */
  oauthReady?: boolean;
  /**
   * Already-connected tiles to hydrate on mount (e.g. after leaving Step 3
   * and coming back). Skips expand / re-import animation.
   */
  initialConnected?: Partial<Record<PlatformId, ConstellationConnection>>;
  onPlatformConnected?: (
    platformId: PlatformId,
    result: ConstellationImportResult,
    meta: { badgeCorner: BadgeCorner }
  ) => void;
  onPlatformDisconnected?: (platformId: PlatformId) => void;
}

export function ConstellationField({
  onConnectedChange,
  onHasActionChange,
  importPlatform,
  importOAuth,
  onBeforeOAuthRedirect,
  oauthReady = true,
  initialConnected,
  onPlatformConnected,
  onPlatformDisconnected,
}: ConstellationFieldProps) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const reduceMotion = useReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const oauthAutoTried = useRef<Partial<Record<OAuthPlatformId, boolean>>>(
    Object.fromEntries(
      (['github', 'linkedin'] as const)
        .filter((id) => Boolean(initialConnected?.[id]?.identity))
        .map((id) => [id, true])
    )
  );
  /** Skip badge pop-in for tiles hydrated as already connected. */
  const skipBadgeEntrance = useRef<Partial<Record<PlatformId, boolean>>>(
    Object.fromEntries(
      PLATFORMS.filter((p) => initialConnected?.[p.id]?.identity).map((p) => [p.id, true])
    )
  );
  const [stageSize, setStageSize] = useState({ w: 900, h: 520 });
  const [states, setStates] = useState(() => statesFromConnected(initialConnected));
  const [activeId, setActiveId] = useState<PlatformId | null>(null);
  const [focusId, setFocusId] = useState<PlatformId | null>(null);
  const [lastConfirm, setLastConfirm] = useState<{
    platform: PlatformDef;
    identity: PreviewIdentity;
  } | null>(() => {
    if (!initialConnected) return null;
    for (const platform of PLATFORMS) {
      const entry = initialConnected[platform.id];
      if (entry?.identity) return { platform, identity: entry.identity };
    }
    return null;
  });

  const connectedGithub = user?.externalAccounts?.find(
    (a) => a.provider === 'github' || (a.provider as string) === 'oauth_github'
  );
  const connectedLinkedin = user?.externalAccounts?.find((a) => {
    const p = a.provider as string;
    return (
      p === 'linkedin_oidc' ||
      p === 'linkedin' ||
      p === 'oauth_linkedin_oidc' ||
      p === 'oauth_linkedin'
    );
  });

  const isOAuthAccountConnected = useCallback(
    (id: OAuthPlatformId) => {
      if (id === 'github') return Boolean(connectedGithub);
      return Boolean(connectedLinkedin);
    },
    [connectedGithub, connectedLinkedin]
  );

  const connectedCount = useMemo(
    () => PLATFORMS.filter((p) => states[p.id].status === 'connected').length,
    [states]
  );

  const hasAction = useMemo(
    () =>
      PLATFORMS.some(
        (p) => states[p.id].status === 'connected' || Boolean(states[p.id].input.trim())
      ),
    [states]
  );

  const expandingId = useMemo(() => {
    if (!activeId) return null;
    const status = states[activeId]?.status;
    if (
      status === 'editing' ||
      status === 'connecting' ||
      status === 'importing' ||
      status === 'error'
    ) {
      return activeId;
    }
    return null;
  }, [activeId, states]);

  const seatedPlatforms = useMemo(
    () => centerConstellationHorizontally(PLATFORMS, stageSize.w),
    [stageSize.w]
  );

  const positions = useMemo(
    () =>
      layoutConstellation(seatedPlatforms, {
        expandedId: expandingId,
        canvasW: stageSize.w,
        canvasH: stageSize.h,
      }),
    [expandingId, seatedPlatforms, stageSize.h, stageSize.w]
  );

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const sync = () => {
      // Freeze measured size while a tile is open — mid-flight ResizeObserver
      // updates re-solve layout and make the field jitter.
      if (expandingId) return;
      const rect = field.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize((prev) =>
          Math.abs(prev.w - rect.width) < 1 && Math.abs(prev.h - rect.height) < 1
            ? prev
            : { w: rect.width, h: rect.height }
        );
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(field);
    return () => ro.disconnect();
  }, [expandingId]);

  useEffect(() => {
    onConnectedChange?.(connectedCount);
  }, [connectedCount, onConnectedChange]);

  useEffect(() => {
    onHasActionChange?.(hasAction);
  }, [hasAction, onHasActionChange]);

  const patch = useCallback((id: PlatformId, partial: Partial<TileState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...partial } }));
  }, []);

  const closeEditor = useCallback(() => {
    if (activeId && states[activeId]?.status === 'editing') {
      patch(activeId, {
        status: states[activeId].identity ? 'connected' : 'idle',
        error: undefined,
      });
    }
    setActiveId(null);
  }, [activeId, patch, states]);

  const openEditor = (platform: PlatformDef) => {
    const current = states[platform.id];
    if (current.status === 'importing' || current.status === 'connecting') return;

    if (current.status === 'connected') {
      setFocusId(platform.id);
      setLastConfirm({ platform, identity: current.identity! });
      return;
    }
    setActiveId(platform.id);
    patch(platform.id, { status: 'editing', error: undefined });
  };

  const finishImport = useCallback(
    (platform: PlatformDef, result: ConstellationImportResult) => {
      const badgeCorner = randomBadgeCorner();
      skipBadgeEntrance.current[platform.id] = false;
      patch(platform.id, {
        status: 'connected',
        identity: result.identity,
        badgeCorner,
        error: undefined,
      });
      setActiveId(null);
      setFocusId(platform.id);
      setLastConfirm({ platform, identity: result.identity });
      onPlatformConnected?.(platform.id, result, { badgeCorner });
    },
    [onPlatformConnected, patch]
  );

  const runImport = async (platform: PlatformDef) => {
    const raw = states[platform.id].input;
    patch(platform.id, { status: 'importing', error: undefined });
    try {
      const result = importPlatform
        ? await importPlatform(platform, raw)
        : { identity: await previewPlatformIdentity(platform, raw) };
      finishImport(platform, result);
    } catch (err) {
      patch(platform.id, {
        status: 'editing',
        error: err instanceof Error ? err.message : 'Import failed',
      });
      setActiveId(platform.id);
    }
  };

  const runOAuthImport = useCallback(
    async (platform: PlatformDef, options?: { silent?: boolean }) => {
      if (platform.id !== 'github' && platform.id !== 'linkedin') return;
      const silent = options?.silent === true;
      patch(platform.id, { status: 'importing', error: undefined });
      if (!silent) setActiveId(platform.id);
      try {
        if (!importOAuth) {
          throw new Error('OAuth import is not available in this preview');
        }
        const result = await importOAuth(platform);
        if (platform.id === 'github' || platform.id === 'linkedin') {
          oauthAutoTried.current[platform.id] = true;
        }
        finishImport(platform, result);
      } catch (err) {
        patch(platform.id, {
          status: 'editing',
          error: err instanceof Error ? err.message : 'Import failed',
        });
        setActiveId(platform.id);
      }
    },
    [finishImport, importOAuth, patch]
  );

  const runOAuthConnect = async (platform: PlatformDef) => {
    if (platform.id !== 'github' && platform.id !== 'linkedin') return;
    if (!platform.oauthStrategy) return;

    if (isOAuthAccountConnected(platform.id)) {
      await runOAuthImport(platform);
      return;
    }

    if (!user || !isUserLoaded) {
      patch(platform.id, {
        status: 'editing',
        error: 'Sign in to connect with OAuth',
      });
      setActiveId(platform.id);
      return;
    }

    const primaryEmail = user.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      patch(platform.id, {
        status: 'editing',
        error: 'Verify your email before connecting accounts',
      });
      setActiveId(platform.id);
      return;
    }

    patch(platform.id, { status: 'connecting', error: undefined });
    setActiveId(platform.id);
    try {
      await onBeforeOAuthRedirect?.();
      const externalAccount = await user.createExternalAccount({
        strategy: platform.oauthStrategy,
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
        return;
      }
      patch(platform.id, { status: 'editing', error: 'Could not start OAuth' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already connected')) {
        await user.reload();
        await runOAuthImport(platform);
      } else {
        patch(platform.id, { status: 'editing', error: msg });
        setActiveId(platform.id);
      }
    }
  };

  // After OAuth redirect (or already-linked accounts), import once into the tile.
  useEffect(() => {
    if (!oauthReady || !isUserLoaded) return;

    for (const platform of PLATFORMS) {
      if (platform.id !== 'github' && platform.id !== 'linkedin') continue;
      if (!platformUsesOAuth(platform)) continue;
      if (!isOAuthAccountConnected(platform.id)) continue;
      if (oauthAutoTried.current[platform.id]) continue;
      if (states[platform.id]?.status !== 'idle') continue;
      if (!importOAuth) continue;

      oauthAutoTried.current[platform.id] = true;
      void runOAuthImport(platform, { silent: true });
    }
  }, [importOAuth, isOAuthAccountConnected, isUserLoaded, oauthReady, runOAuthImport, states]);

  const disconnect = (id: PlatformId) => {
    if (id === 'github' || id === 'linkedin') {
      oauthAutoTried.current[id] = true;
    }
    delete skipBadgeEntrance.current[id];
    patch(id, {
      status: 'idle',
      identity: null,
      input: '',
      error: undefined,
      badgeCorner: PLATFORMS.find((p) => p.id === id)?.badgeCorner ?? 'br',
    });
    if (focusId === id) setFocusId(null);
    if (lastConfirm?.platform.id === id) setLastConfirm(null);
    setActiveId(null);
    onPlatformDisconnected?.(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div
        className={cn(ONBOARDING_CONSTELLATION_STAGE, 'min-h-[440px] sm:min-h-[520px]')}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeEditor();
        }}
      >
        {/* Cap field width so % seats stay clustered on wide viewports.
            Equal side inset + centered cloud so left/right gaps match. */}
        <div
          ref={fieldRef}
          className="absolute bottom-3 left-4 right-4 top-4 mx-auto w-auto max-w-[900px] sm:top-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor();
          }}
        >
          {seatedPlatforms.map((platform) => {
            const state = states[platform.id];
            const isActive = activeId === platform.id;
            const isEditing = isActive && (state.status === 'editing' || state.status === 'error');
            const isImporting = state.status === 'importing';
            const isConnecting = state.status === 'connecting';
            const isBusy = isImporting || isConnecting;
            const isConnected = state.status === 'connected';
            const isExpanding = expandingId === platform.id;
            const usesOAuth = platformUsesOAuth(platform);
            const dimmed = expandingId != null && expandingId !== platform.id;
            const width = isExpanding ? expandedWidth(platform) : platform.size;
            const height = isExpanding ? expandedHeight(platform) : platform.size;
            const rgb = hexToRgb(platform.brand);
            const pos = positions[platform.id];
            const expandedPlatform = expandingId
              ? (seatedPlatforms.find((p) => p.id === expandingId) ?? null)
              : null;
            const neighborDelay = constellationNeighborDelay(
              platform,
              expandedPlatform,
              stageSize.w,
              stageSize.h
            );

            const choreo = reduceMotion
              ? { duration: 0 }
              : {
                  duration: CONSTELLATION_DURATION,
                  ease: CONSTELLATION_EASE,
                  delay: isExpanding ? 0 : neighborDelay,
                };

            const cornerRadius = isExpanding ? 16 : Math.round(platform.size * 0.28);
            const canOpen = !isEditing && !isBusy;
            const showEditor = isExpanding && (isEditing || isBusy);
            const showBusyIdle = isBusy && !isExpanding;

            return (
              <motion.div
                key={platform.id}
                className={cn('absolute z-10 will-change-transform', isExpanding && 'z-30')}
                initial={false}
                animate={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                }}
                transition={{
                  left: choreo,
                  top: choreo,
                }}
                style={{ transform: 'translate(-50%, -50%)' }}
              >
                <motion.div
                  animate={reduceMotion || expandingId ? { y: 0 } : { y: [0, -5, 0] }}
                  transition={
                    reduceMotion || expandingId
                      ? { duration: 0.5, ease: CONSTELLATION_EASE }
                      : {
                          duration: platform.driftDuration,
                          delay: platform.driftDelay,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }
                  }
                >
                  <motion.div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canOpen) openEditor(platform);
                    }}
                    className={cn(
                      'relative cursor-pointer border border-border/50 bg-card/90 backdrop-blur-sm',
                      isConnected && !isExpanding ? 'overflow-visible' : 'overflow-hidden',
                      isConnected && 'ring-1 ring-border/40'
                    )}
                    initial={false}
                    animate={{
                      width,
                      height,
                      borderRadius: cornerRadius,
                      opacity: dimmed ? 0.4 : 1,
                      scale: isConnected && !isExpanding ? CONNECTED_SCALE : 1,
                      boxShadow: isExpanding
                        ? `0 16px 40px -18px rgba(${rgb}, 0.38), 0 0 0 1px rgba(${rgb}, 0.1)`
                        : isConnected
                          ? `0 8px 22px -14px rgba(${rgb}, 0.28), 0 1px 2px rgba(0,0,0,0.04)`
                          : '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                    transition={choreo}
                    style={{
                      backgroundColor: `hsla(${platform.tint} / ${isConnected ? 0.45 : 0.88})`,
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${platform.label} · ${platform.fieldLabel}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (canOpen) openEditor(platform);
                      }
                    }}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {isConnected && state.identity ? (
                        <motion.div
                          key="connected"
                          initial={
                            skipBadgeEntrance.current[platform.id]
                              ? false
                              : { opacity: 0, scale: 0.92 }
                          }
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          className="absolute inset-0 overflow-visible"
                        >
                          <ConnectedAvatar
                            platform={platform}
                            identity={state.identity}
                            badgeCorner={state.badgeCorner}
                            animateBadge={!skipBadgeEntrance.current[platform.id]}
                          />
                        </motion.div>
                      ) : showEditor ? (
                        <motion.div
                          key="editor"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.28, delay: 0.18, ease: CONSTELLATION_EASE }}
                          className={cn(
                            'absolute inset-0',
                            usesOAuth
                              ? 'flex flex-col gap-2 px-3 py-2.5'
                              : 'flex items-center gap-2.5 px-3'
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {usesOAuth ? (
                            <>
                              <div className="flex items-center gap-2">
                                <div
                                  className="relative flex shrink-0 items-center justify-center rounded-xl bg-background/90 ring-1 ring-inset ring-border/40"
                                  style={{ width: 36, height: 36 }}
                                >
                                  {isBusy ? (
                                    <ConnectingRing brand={platform.brand} size={36} />
                                  ) : null}
                                  <BrandIcon id={platform.id} className="h-[48%] w-[48%]" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-medium text-foreground">
                                    {platform.label}
                                    <span className="ml-1.5 font-normal text-muted-foreground">
                                      {platform.fieldLabel}
                                    </span>
                                  </p>
                                  <p className="truncate text-[10px] text-muted-foreground">
                                    Connect or paste a link
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  onClick={closeEditor}
                                  aria-label="Close"
                                  disabled={isBusy}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              <Button
                                size="sm"
                                disabled={isBusy || !isUserLoaded}
                                onClick={() => void runOAuthConnect(platform)}
                                className="h-8 w-full gap-2 text-xs"
                              >
                                {isConnecting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <BrandIcon id={platform.id} className="h-3.5 w-3.5" />
                                )}
                                {isConnecting
                                  ? 'Connecting…'
                                  : isOAuthAccountConnected(platform.id as OAuthPlatformId)
                                    ? `Import with ${platform.label}`
                                    : `Connect ${platform.label}`}
                              </Button>

                              <div className="flex items-center gap-2">
                                <span className="h-px flex-1 bg-border/60" />
                                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  or paste link
                                </span>
                                <span className="h-px flex-1 bg-border/60" />
                              </div>

                              <div className="flex gap-1.5">
                                <Input
                                  autoFocus
                                  value={state.input}
                                  disabled={isBusy}
                                  placeholder={platform.placeholder}
                                  onChange={(e) => patch(platform.id, { input: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void runImport(platform);
                                    if (e.key === 'Escape') closeEditor();
                                  }}
                                  className="h-8 border-border/50 bg-background text-xs shadow-none"
                                />
                                <Button
                                  size="sm"
                                  disabled={isBusy || !state.input.trim()}
                                  onClick={() => void runImport(platform)}
                                  className="h-8 shrink-0 px-2.5 text-xs"
                                >
                                  {isImporting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    'Import'
                                  )}
                                </Button>
                              </div>

                              {state.error ? (
                                <p className="truncate text-[10px] text-destructive">
                                  {state.error}
                                </p>
                              ) : (
                                <p className="truncate text-[10px] text-muted-foreground">
                                  {platform.hint}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <div
                                className="relative flex shrink-0 items-center justify-center rounded-xl bg-background/90 ring-1 ring-inset ring-border/40"
                                style={{ width: height * 0.62, height: height * 0.62 }}
                              >
                                {isImporting ? (
                                  <ConnectingRing brand={platform.brand} size={height * 0.62} />
                                ) : null}
                                <BrandIcon id={platform.id} className="h-[48%] w-[48%]" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <p className="truncate text-[11px] font-medium text-foreground">
                                    {platform.label}
                                    <span className="ml-1.5 font-normal text-muted-foreground">
                                      {platform.fieldLabel}
                                    </span>
                                  </p>
                                  <button
                                    type="button"
                                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    onClick={closeEditor}
                                    aria-label="Close"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="flex gap-1.5">
                                  <Input
                                    autoFocus
                                    value={state.input}
                                    disabled={isImporting}
                                    placeholder={platform.placeholder}
                                    onChange={(e) => patch(platform.id, { input: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') void runImport(platform);
                                      if (e.key === 'Escape') closeEditor();
                                    }}
                                    className="h-8 border-border/50 bg-background text-xs shadow-none"
                                  />
                                  <Button
                                    size="sm"
                                    disabled={isImporting || !state.input.trim()}
                                    onClick={() => void runImport(platform)}
                                    className="h-8 shrink-0 px-2.5 text-xs"
                                  >
                                    {isImporting ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      'Import'
                                    )}
                                  </Button>
                                </div>
                                {state.error ? (
                                  <p className="mt-1 truncate text-[10px] text-destructive">
                                    {state.error}
                                  </p>
                                ) : (
                                  <p className="mt-1 truncate text-[10px] text-muted-foreground">
                                    {platform.hint}
                                  </p>
                                )}
                              </div>
                            </>
                          )}
                        </motion.div>
                      ) : showBusyIdle ? (
                        <motion.div
                          key="busy-idle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
                        >
                          <div
                            className="relative flex items-center justify-center"
                            style={{
                              width: platform.size >= 110 ? 56 : platform.size >= 90 ? 48 : 40,
                              height: platform.size >= 110 ? 56 : platform.size >= 90 ? 48 : 40,
                            }}
                          >
                            <ConnectingRing
                              brand={platform.brand}
                              size={platform.size >= 110 ? 56 : platform.size >= 90 ? 48 : 40}
                            />
                            <BrandIcon
                              id={platform.id}
                              className={cn(
                                platform.size >= 110
                                  ? 'h-7 w-7'
                                  : platform.size >= 90
                                    ? 'h-6 w-6'
                                    : 'h-5 w-5'
                              )}
                            />
                          </div>
                          <span className="px-2 text-center text-[10px] font-medium tracking-wide text-muted-foreground">
                            {isConnecting ? 'Connecting…' : 'Importing…'}
                          </span>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="idle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
                        >
                          <BrandIcon
                            id={platform.id}
                            className={cn(
                              platform.size >= 110
                                ? 'h-12 w-12'
                                : platform.size >= 100
                                  ? 'h-11 w-11'
                                  : platform.size >= 90
                                    ? 'h-9 w-9'
                                    : 'h-8 w-8'
                            )}
                          />
                          <span className="px-2 text-center text-[10px] font-medium tracking-wide text-muted-foreground">
                            {platform.label}
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {lastConfirm ? (
          <motion.aside
            key={lastConfirm.platform.id + lastConfirm.identity.handle}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className={cn(ONBOARDING_SURFACE, ONBOARDING_SURFACE_PAD, 'shrink-0')}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="relative h-11 w-11 shrink-0">
                  <div className="absolute inset-0 overflow-hidden rounded-full ring-1 ring-border/40">
                    {lastConfirm.identity.avatarUrl ? (
                      <Image
                        src={lastConfirm.identity.avatarUrl}
                        alt=""
                        fill
                        sizes="44px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-xs font-semibold text-white"
                        style={{ background: lastConfirm.platform.brand }}
                      >
                        {initials(lastConfirm.identity.displayName)}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card ring-2 ring-background">
                    <BrandIcon id={lastConfirm.platform.id} className="h-3 w-3" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className={ONBOARDING_CARD_TITLE}>{lastConfirm.identity.displayName}</h2>
                    <span className={ONBOARDING_SUCCESS_PILL}>
                      <Check className="h-3 w-3" />
                      Connected
                    </span>
                  </div>
                  <p className={`mt-0.5 truncate ${ONBOARDING_CARD_DESCRIPTION}`}>
                    {lastConfirm.identity.handle}
                  </p>
                  {lastConfirm.identity.secondary ? (
                    <p className={`mt-1 line-clamp-2 ${ONBOARDING_CARD_DESCRIPTION}`}>
                      {lastConfirm.identity.secondary}
                    </p>
                  ) : null}
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {lastConfirm.identity.essentials.map((item) => (
                      <li key={item} className={ONBOARDING_QUIET_PILL}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {lastConfirm.identity.sourceUrl ? (
                  <a
                    href={lastConfirm.identity.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  >
                    Open
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => disconnect(lastConfirm.platform.id)}
                  className="rounded-lg border border-border/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
