'use client';

import { useEffect, useState } from 'react';

import type { BrandKind } from '@/lib/brand-logo';

import { BrandMark } from './brand-mark';
import { FollioPeek } from './follio-peek';

type InsightPayload = {
  name: string;
  description: string | null;
  summary: string;
  extract: string;
  sourceUrl: string | null;
  siteUrl: string | null;
};

interface FollioBrandPeekProps {
  name: string;
  url?: string | null;
  kind: BrandKind;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Company or school peek. The timeline stays a name and a logo; a click loads
 * the public description the same way logos are resolved.
 */
export function FollioBrandPeek({
  name,
  url,
  kind,
  disabled = false,
  children,
  className,
}: FollioBrandPeekProps) {
  const [insight, setInsight] = useState<InsightPayload | null | undefined>(undefined);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!requested || disabled) return;

    const params = new URLSearchParams({ name, kind });
    if (url?.trim()) params.set('url', url.trim());

    const controller = new AbortController();
    fetch(`/api/brand/insight?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setInsight(null);
          return;
        }
        const body = (await response.json()) as { insight?: InsightPayload };
        setInsight(body.insight ?? null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setInsight(null);
      });

    return () => controller.abort();
  }, [requested, disabled, name, kind, url]);

  const siteUrl = url?.trim() || insight?.siteUrl || null;
  const kindLabel = kind === 'school' ? 'school' : 'company';
  const body = insight ? insight.extract || insight.summary : null;

  return (
    <FollioPeek
      label={`About ${name}`}
      disabled={disabled}
      trigger={
        <span onPointerEnter={() => setRequested(true)} onFocus={() => setRequested(true)}>
          {children}
        </span>
      }
      className={className}
      onOpenChange={(open) => {
        if (open) setRequested(true);
      }}
    >
      <div className="space-y-3 break-words">
        <div className="flex items-start gap-3">
          <BrandMark name={name} url={url} kind={kind} className="h-11 w-11 rounded-xl" />
          <div className="min-w-0 pt-0.5">
            <p className="text-[15px] font-semibold leading-snug text-foreground">{name}</p>
            {insight?.description ? (
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                {insight.description}
              </p>
            ) : null}
          </div>
        </div>

        {insight === undefined ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Looking up this {kindLabel}…
          </p>
        ) : body ? (
          <p className="text-[13px] leading-relaxed text-foreground/85">{body}</p>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            No public profile found for this {kindLabel}.
          </p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          {siteUrl ? (
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground/80 underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Visit website
            </a>
          ) : null}
          {insight?.sourceUrl ? (
            <a
              href={insight.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
            >
              Wikipedia
            </a>
          ) : null}
        </div>
      </div>
    </FollioPeek>
  );
}
