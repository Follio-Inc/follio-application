'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { formatPhraseHint, LENS_MARK_CLASS, type LensPhrase } from '@/lib/resume-lens';

interface ResumeLensCardProps {
  phrases: LensPhrase[];
  host: HTMLElement | null;
}

interface CardState {
  phrase: LensPhrase;
  top: number;
  left: number;
}

export function ResumeLensCard({ phrases, host }: ResumeLensCardProps) {
  const [card, setCard] = useState<CardState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!host) return;

    const byId = new Map(phrases.map((p) => [p.id, p]));
    let hoverTimer: number | null = null;

    const hide = () => {
      if (hoverTimer !== null) {
        window.clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      setCard(null);
    };

    const showFromTarget = (target: EventTarget | null, delay: number) => {
      const mark =
        target instanceof Element ? target.closest<HTMLElement>(`mark.${LENS_MARK_CLASS}`) : null;
      if (!mark || !host.contains(mark)) {
        hide();
        return;
      }
      const phrase = byId.get(mark.dataset.lensId ?? '');
      if (!phrase) {
        hide();
        return;
      }

      const place = () => {
        const rect = mark.getBoundingClientRect();
        const width = 280;
        const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
        const below = rect.bottom + 8;
        const top = below + 120 > window.innerHeight ? rect.top - 8 - 96 : below;
        setCard({ phrase, top, left });
      };

      if (hoverTimer !== null) window.clearTimeout(hoverTimer);
      if (delay <= 0) {
        place();
        return;
      }
      hoverTimer = window.setTimeout(place, delay);
    };

    const onPointerOver = (event: PointerEvent) => showFromTarget(event.target, 120);
    const onPointerOut = (event: PointerEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Element && next.closest(`mark.${LENS_MARK_CLASS}`)) return;
      hide();
    };
    const onFocusIn = (event: FocusEvent) => showFromTarget(event.target, 0);
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Element && next.closest(`mark.${LENS_MARK_CLASS}`)) return;
      hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    const onScroll = () => hide();

    host.addEventListener('pointerover', onPointerOver);
    host.addEventListener('pointerout', onPointerOut);
    host.addEventListener('focusin', onFocusIn);
    host.addEventListener('focusout', onFocusOut);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);

    return () => {
      if (hoverTimer !== null) window.clearTimeout(hoverTimer);
      host.removeEventListener('pointerover', onPointerOver);
      host.removeEventListener('pointerout', onPointerOut);
      host.removeEventListener('focusin', onFocusIn);
      host.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [host, phrases]);

  if (!ready || !card || typeof document === 'undefined') return null;

  const locations = card.phrase.occurrences.slice(0, 3);

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[80] w-[280px] rounded-xl border border-border/70 bg-popover px-3.5 py-3 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
      style={{ top: card.top, left: card.left }}
    >
      <p className="text-[13px] font-medium tracking-tight text-foreground">{card.phrase.phrase}</p>
      <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
        {formatPhraseHint(card.phrase)}
      </p>
      {locations.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[12px] leading-5 text-muted-foreground">
          {locations.map((hit) => (
            <li key={`${hit.kind}:${hit.label}`}>{hit.label}</li>
          ))}
        </ul>
      ) : null}
    </div>,
    document.body
  );
}
