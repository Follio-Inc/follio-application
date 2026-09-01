'use client';

import { useState } from 'react';

import { brandLogoSrc, brandMonogram, type BrandKind } from '@/lib/brand-logo';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  name: string;
  /** The company or school's own site, when the person supplied one. */
  url?: string | null;
  kind: BrandKind;
  className?: string;
}

/**
 * Square logo tile beside a company or school, in the shape LinkedIn made
 * familiar. The monogram renders first and the logo layers over it once loaded,
 * so there is never a broken-image flash and never any layout shift.
 */
export function BrandMark({ name, url, kind, className }: BrandMarkProps) {
  const [failed, setFailed] = useState(false);
  const src = brandLogoSrc({ name, url, kind });

  return (
    <span
      className={cn(
        'relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg',
        'bg-card ring-1 ring-inset ring-border/70',
        'shadow-[0_1px_2px_-1px_rgb(0_0_0_/_0.12)]',
        className
      )}
      aria-hidden
    >
      <span className="text-xs font-semibold tracking-tight text-muted-foreground">
        {brandMonogram(name)}
      </span>
      {/* Our route already returns a normalized 128px PNG, so next/image adds nothing. */}
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          // Logos are drawn for light backgrounds, and many ship dark ink on
          // transparency — which would vanish on a dark tile. A white plate
          // keeps every mark legible in both themes.
          className="absolute inset-0 h-full w-full bg-white object-contain p-1"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}
