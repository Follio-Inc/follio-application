'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Check, ClipboardCopy, Loader2, RotateCcw, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';

import { BrandIcon } from './brand-icons';
import {
  CONSTELLATION_DURATION,
  CONSTELLATION_EASE,
  PLATFORMS,
  PLATFORM_BY_ID,
  badgeCornerClass,
  constellationNeighborDelay,
  expandedWidth,
  hexToRgb,
  layoutConstellation,
  previewPlatformIdentity,
  type LayoutPoint,
  type PlatformDef,
  type PlatformId,
  type PreviewIdentity,
} from './platforms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ONBOARDING_CARD_DESCRIPTION,
  ONBOARDING_CARD_TITLE,
  ONBOARDING_CONSTELLATION_STAGE,
  ONBOARDING_DROPZONE,
  ONBOARDING_QUIET_PILL,
  ONBOARDING_SUCCESS_PILL,
  ONBOARDING_SURFACE,
  ONBOARDING_SURFACE_PAD,
} from '@/lib/onboarding-ui';
import { cn } from '@/lib/utils';

type TileStatus = 'idle' | 'editing' | 'importing' | 'connected' | 'error';

interface TileState {
  status: TileStatus;
  input: string;
  identity: PreviewIdentity | null;
  error?: string;
}

type SeatMap = Record<PlatformId, LayoutPoint>;

const SEATS_STORAGE_KEY = 'follio-lab-import-constellation-seats';

function defaultSeats(): SeatMap {
  return Object.fromEntries(PLATFORMS.map((p) => [p.id, { x: p.x, y: p.y }])) as SeatMap;
}

function loadSeats(): SeatMap {
  if (typeof window === 'undefined') return defaultSeats();
  try {
    const raw = sessionStorage.getItem(SEATS_STORAGE_KEY);
    if (!raw) return defaultSeats();
    const parsed = JSON.parse(raw) as Partial<SeatMap>;
    const base = defaultSeats();
    for (const p of PLATFORMS) {
      const seat = parsed[p.id];
      if (seat && typeof seat.x === 'number' && typeof seat.y === 'number') {
        base[p.id] = {
          x: Math.min(95, Math.max(5, seat.x)),
          y: Math.min(95, Math.max(5, seat.y)),
        };
      }
    }
    return base;
  } catch {
    return defaultSeats();
  }
}

function seatsToSnippet(seats: SeatMap): string {
  const lines = PLATFORMS.map((p) => {
    const s = seats[p.id];
    return `  ${p.id}: { x: ${Number(s.x.toFixed(1))}, y: ${Number(s.y.toFixed(1))} },`;
  });
  return `// Lab constellation seats — paste into platforms.ts\n{\n${lines.join('\n')}\n}`;
}

function emptyStates(): Record<PlatformId, TileState> {
  return Object.fromEntries(
    PLATFORMS.map((p) => [p.id, { status: 'idle', input: '', identity: null }])
  ) as Record<PlatformId, TileState>;
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
}: {
  platform: PlatformDef;
  identity: PreviewIdentity;
}) {
  const corner = badgeCornerClass(platform.badgeCorner);
  const badge = Math.round(platform.size * 0.34);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        className="relative overflow-hidden rounded-full shadow-[0_8px_24px_-12px_rgba(0,0,0,0.28)] ring-2 ring-background"
        style={{ width: '78%', height: '78%' }}
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

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.08 }}
        className={cn(
          'absolute z-10 flex items-center justify-center rounded-full bg-card shadow-[0_4px_14px_-4px_rgba(0,0,0,0.28)] ring-2 ring-background',
          corner
        )}
        style={{ width: badge, height: badge }}
        title={platform.label}
      >
        <BrandIcon id={platform.id} className="h-[55%] w-[55%]" />
      </motion.div>
    </div>
  );
}

export interface ConstellationFieldProps {
  onConnectedChange?: (count: number) => void;
}

export function ConstellationField({ onConnectedChange }: ConstellationFieldProps) {
  const reduceMotion = useReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 900, h: 520 });
  const [seats, setSeats] = useState<SeatMap>(defaultSeats);
  const [seatsReady, setSeatsReady] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);
  const [draggingId, setDraggingId] = useState<PlatformId | null>(null);
  const dragRef = useRef<{
    id: PlatformId;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const [states, setStates] = useState(emptyStates);
  const [activeId, setActiveId] = useState<PlatformId | null>(null);
  const [focusId, setFocusId] = useState<PlatformId | null>(null);
  const [lastConfirm, setLastConfirm] = useState<{
    platform: PlatformDef;
    identity: PreviewIdentity;
  } | null>(null);

  useEffect(() => {
    setSeats(loadSeats());
    setSeatsReady(true);
  }, []);

  useEffect(() => {
    if (!seatsReady) return;
    sessionStorage.setItem(SEATS_STORAGE_KEY, JSON.stringify(seats));
  }, [seats, seatsReady]);

  const seatedPlatforms = useMemo(
    () =>
      PLATFORMS.map((p) => ({
        ...p,
        x: seats[p.id]?.x ?? p.x,
        y: seats[p.id]?.y ?? p.y,
      })),
    [seats]
  );

  const connectedCount = useMemo(
    () => PLATFORMS.filter((p) => states[p.id].status === 'connected').length,
    [states]
  );

  const expandingId = useMemo(() => {
    if (!activeId) return null;
    const status = states[activeId]?.status;
    if (status === 'editing' || status === 'importing' || status === 'error') return activeId;
    return null;
  }, [activeId, states]);

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
      if (expandingId || draggingId) return;
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
  }, [draggingId, expandingId]);

  useEffect(() => {
    onConnectedChange?.(connectedCount);
  }, [connectedCount, onConnectedChange]);

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
    if (current.status === 'importing') return;

    if (current.status === 'connected') {
      setFocusId(platform.id);
      setLastConfirm({ platform, identity: current.identity! });
      return;
    }
    setActiveId(platform.id);
    patch(platform.id, { status: 'editing', error: undefined });
  };

  const runImport = async (platform: PlatformDef) => {
    const raw = states[platform.id].input;
    patch(platform.id, { status: 'importing', error: undefined });
    try {
      const identity = await previewPlatformIdentity(platform, raw);
      patch(platform.id, { status: 'connected', identity, error: undefined });
      setActiveId(null);
      setFocusId(platform.id);
      setLastConfirm({ platform, identity });
    } catch (err) {
      patch(platform.id, {
        status: 'editing',
        error: err instanceof Error ? err.message : 'Import failed',
      });
      setActiveId(platform.id);
    }
  };

  const disconnect = (id: PlatformId) => {
    patch(id, { status: 'idle', identity: null, input: '', error: undefined });
    if (focusId === id) setFocusId(null);
    if (lastConfirm?.platform.id === id) setLastConfirm(null);
    setActiveId(null);
  };

  const beginDrag = (platform: PlatformDef, e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const status = states[platform.id]?.status;
    if (status === 'editing' || status === 'importing' || status === 'error') return;
    if (expandingId) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      id: platform.id,
      startX: e.clientX,
      startY: e.clientY,
      originX: seats[platform.id].x,
      originY: seats[platform.id].y,
      moved: false,
    };
    setDraggingId(platform.id);
  };

  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (stageSize.w < 1 || stageSize.h < 1) return;

    const dxPct = ((e.clientX - drag.startX) / stageSize.w) * 100;
    const dyPct = ((e.clientY - drag.startY) / stageSize.h) * 100;
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
      drag.moved = true;
    }

    setSeats((prev) => ({
      ...prev,
      [drag.id]: {
        x: Math.min(95, Math.max(5, drag.originX + dxPct)),
        y: Math.min(95, Math.max(5, drag.originY + dyPct)),
      },
    }));
  };

  const endDrag = (platform: PlatformDef, e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== platform.id) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }

    const wasMoved = drag.moved;
    dragRef.current = null;
    setDraggingId(null);

    if (!wasMoved) {
      openEditor(platform);
    }
  };

  const copySeats = async () => {
    const snippet = seatsToSnippet(seats);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 1600);
    } catch {
      // Fallback: still surface the snippet for manual copy
      window.prompt('Copy seats snippet:', snippet);
    }
  };

  const resetSeats = () => {
    const next = defaultSeats();
    setSeats(next);
    sessionStorage.removeItem(SEATS_STORAGE_KEY);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          Lab arrange · drag marks to place · tap without dragging to open
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={resetSeats}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset seats
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1.5" onClick={() => void copySeats()}>
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copyFlash ? 'Copied' : 'Copy seats'}
          </Button>
        </div>
      </div>

      <div
        className={cn(ONBOARDING_CONSTELLATION_STAGE, 'min-h-[440px] sm:min-h-[520px]')}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeEditor();
        }}
      >
        {/* Cap field width so % seats stay clustered on wide viewports */}
        <div
          ref={fieldRef}
          className="absolute inset-x-0 top-0 bottom-8 mx-auto w-full max-w-[900px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor();
          }}
        >
          <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-6">
            <span className={ONBOARDING_QUIET_PILL}>
              {draggingId
                ? `Moving ${PLATFORM_BY_ID[draggingId].label}`
                : connectedCount === 0
                  ? 'Nothing attached yet'
                  : `${connectedCount} attached · tap a mark to review`}
            </span>
          </div>

          {seatedPlatforms.map((platform) => {
            const state = states[platform.id];
            const isActive = activeId === platform.id;
            const isEditing = isActive && (state.status === 'editing' || state.status === 'error');
            const isImporting = state.status === 'importing';
            const isConnected = state.status === 'connected';
            const isExpanding = expandingId === platform.id;
            const isDragging = draggingId === platform.id;
            const dimmed = expandingId != null && expandingId !== platform.id;
            const width = isExpanding ? expandedWidth(platform.size) : platform.size;
            const height = platform.size;
            const rgb = hexToRgb(platform.brand);
            const pos = positions[platform.id];
            const expandedPlatform = expandingId ? PLATFORM_BY_ID[expandingId] : null;
            const neighborDelay = constellationNeighborDelay(
              platform,
              expandedPlatform,
              stageSize.w,
              stageSize.h
            );

            const choreo =
              reduceMotion || isDragging
                ? { duration: 0 }
                : {
                    duration: CONSTELLATION_DURATION,
                    ease: CONSTELLATION_EASE,
                    delay: isExpanding ? 0 : neighborDelay,
                  };

            const cornerRadius = isExpanding ? 16 : Math.round(platform.size * 0.28);
            const canDrag = !isEditing && !isImporting && !expandingId;

            return (
              <motion.div
                key={platform.id}
                className={cn(
                  'absolute z-10 will-change-transform',
                  isExpanding && 'z-30',
                  isDragging && 'z-40'
                )}
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
                  animate={
                    reduceMotion || expandingId || draggingId ? { y: 0 } : { y: [0, -5, 0] }
                  }
                  transition={
                    reduceMotion || expandingId || draggingId
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
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (canDrag) beginDrag(platform, e);
                    }}
                    onPointerMove={(e) => {
                      if (isDragging) moveDrag(e);
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      if (draggingId === platform.id) endDrag(platform, e);
                    }}
                    onPointerCancel={(e) => {
                      if (draggingId === platform.id) endDrag(platform, e);
                    }}
                    className={cn(
                      'relative overflow-hidden border border-border/50 bg-card/90 backdrop-blur-sm',
                      canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                      isConnected && 'ring-1 ring-border/40',
                      isDragging && 'ring-2 ring-primary/30'
                    )}
                    initial={false}
                    animate={{
                      width,
                      height,
                      borderRadius: cornerRadius,
                      opacity: dimmed ? 0.4 : 1,
                      boxShadow: isExpanding
                        ? `0 16px 40px -18px rgba(${rgb}, 0.38), 0 0 0 1px rgba(${rgb}, 0.1)`
                        : isDragging
                          ? `0 18px 36px -14px rgba(${rgb}, 0.35)`
                          : '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                    transition={choreo}
                    style={{
                      backgroundColor: `hsla(${platform.tint} / ${isConnected ? 0.45 : 0.88})`,
                      touchAction: 'none',
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${platform.label} · ${platform.fieldLabel}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!isEditing && !isImporting) openEditor(platform);
                      }
                    }}
                  >
                  <AnimatePresence mode="wait" initial={false}>
                    {isConnected && state.identity ? (
                      <motion.div
                        key="connected"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        className="absolute inset-0"
                      >
                        <ConnectedAvatar platform={platform} identity={state.identity} />
                      </motion.div>
                    ) : isEditing || isImporting ? (
                      <motion.div
                        key="editor"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.28, delay: 0.18, ease: CONSTELLATION_EASE }}
                        className="absolute inset-0 flex items-center gap-2.5 px-3"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                      Confirmed
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
        ) : (
          <motion.aside
            key="empty-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              ONBOARDING_DROPZONE,
              'shrink-0 px-4 py-5 text-center text-sm text-muted-foreground'
            )}
          >
            Tap a mark and paste a link to confirm essentials here. Try GitHub with a real username
            for a live photo and stats.
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
