import {
  SiBehance,
  SiDevdotto,
  SiDribbble,
  SiFacebook,
  SiGithub,
  SiGitlab,
  SiHashnode,
  SiInstagram,
  SiMedium,
  SiStackoverflow,
  SiSubstack,
  SiThreads,
  SiTiktok,
  SiX,
  SiYoutube,
} from '@icons-pack/react-simple-icons';
import { Globe, Link2 } from 'lucide-react';
import type { ComponentType } from 'react';

import type { FollioLinkKind } from '@/lib/follio-identity';
import { cn } from '@/lib/utils';

/**
 * Real platform logos for the "Elsewhere" links, from the open-source Simple
 * Icons set. `color="default"` renders a brand in its official color; the marks
 * left monochrome below are near-black or near-white, so they follow the theme
 * foreground instead of disappearing on a dark background.
 */

type IconProps = { className?: string; color?: string };
type Entry = { Icon: ComponentType<IconProps>; brand?: boolean };

/** Simple Icons removed LinkedIn at the brand's request, so we supply its mark. */
function LinkedInIcon({ className, color }: IconProps) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill={color === 'default' ? '#0A66C2' : 'currentColor'}
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}

const ICONS: Record<FollioLinkKind, Entry> = {
  github: { Icon: SiGithub },
  linkedin: { Icon: LinkedInIcon, brand: true },
  twitter: { Icon: SiX },
  medium: { Icon: SiMedium },
  substack: { Icon: SiSubstack, brand: true },
  hashnode: { Icon: SiHashnode, brand: true },
  devto: { Icon: SiDevdotto },
  dribbble: { Icon: SiDribbble, brand: true },
  behance: { Icon: SiBehance, brand: true },
  youtube: { Icon: SiYoutube, brand: true },
  instagram: { Icon: SiInstagram, brand: true },
  facebook: { Icon: SiFacebook, brand: true },
  tiktok: { Icon: SiTiktok },
  threads: { Icon: SiThreads },
  stackoverflow: { Icon: SiStackoverflow, brand: true },
  gitlab: { Icon: SiGitlab, brand: true },
  website: { Icon: Globe },
  other: { Icon: Link2 },
};

interface LinkIconProps {
  kind: FollioLinkKind;
  className?: string;
}

export function LinkIcon({ kind, className }: LinkIconProps) {
  const { Icon, brand } = ICONS[kind] ?? ICONS.other;

  // `contents` keeps the SVG's own sizing within the flex pill while the span
  // hides the decorative mark from assistive tech (the link carries the label).
  return (
    <span className="contents" aria-hidden>
      <Icon
        className={cn(className, brand ? undefined : 'text-foreground/80')}
        {...(brand ? { color: 'default' } : {})}
      />
    </span>
  );
}
