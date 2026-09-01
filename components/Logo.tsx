'use client';

import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  href?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** When true, shows the full logo with "Follio" text. When false, shows only the "F" icon. */
  showText?: boolean;
  className?: string;
}

/** Dimensions for the icon-only (short) logo */
const iconSizeMap = {
  sm: { width: 20, height: 20 },
  md: { width: 28, height: 28 },
  lg: { width: 36, height: 36 },
  xl: { width: 44, height: 44 },
};

/** Height constraint + max-height class for the full logo */
const fullSizeMap = {
  sm: { width: 80, height: 20, className: 'max-h-5' },
  md: { width: 100, height: 26, className: 'max-h-[26px]' },
  lg: { width: 120, height: 32, className: 'max-h-8' },
  xl: { width: 148, height: 38, className: 'max-h-[38px]' },
};

export function Logo({ href, size = 'md', showText = true, className = '' }: LogoProps) {
  const isFullLogo = showText;
  const sizeEntry = isFullLogo ? fullSizeMap[size] : iconSizeMap[size];
  // Short mark = geometric "F" (`follio-mark.png`). `follio-icon.png` is kept as an alias.
  const src = isFullLogo ? '/logo/follio-logo-full.png' : '/logo/follio-mark.png';
  const alt = isFullLogo ? 'Follio' : 'Follio';
  const heightClass = isFullLogo ? (sizeEntry as (typeof fullSizeMap)['md']).className : '';

  const content = (
    <div className={`flex items-center ${className}`}>
      <Image
        src={src}
        alt={alt}
        width={sizeEntry.width}
        height={sizeEntry.height}
        className={`object-contain ${heightClass} w-auto`}
        priority
      />
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="flex items-center">
        {content}
      </Link>
    );
  }

  return content;
}

export default Logo;
