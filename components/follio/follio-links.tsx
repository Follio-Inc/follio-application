import type { FollioLink } from '@/lib/follio-identity';
import { cn } from '@/lib/utils';

import { FollioSection } from './follio-section';
import { LinkIcon } from './link-icon';

interface FollioLinksProps {
  links: FollioLink[];
  interactive?: boolean;
}

/**
 * Compact pills rather than stacked cards. Six full-width rows of platform name
 * plus handle read as a directory and dominate the page; the platform icon and
 * name already carry everything a stranger needs to choose one.
 */
export function FollioLinks({ links, interactive = true }: FollioLinksProps) {
  if (links.length === 0) return null;

  return (
    <FollioSection title="Elsewhere">
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => {
          const className = cn(
            'inline-flex items-center gap-2 rounded-full border border-border/70 px-3.5 py-2',
            'text-[13px] font-medium text-foreground transition-colors',
            interactive && 'hover:border-foreground/25 hover:bg-muted/50'
          );

          const body = (
            <>
              <LinkIcon kind={link.kind} className="h-[15px] w-[15px] shrink-0" />
              {link.label}
            </>
          );

          return (
            <li key={link.id}>
              {interactive ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  // The handle is dropped from the visible pill, so keep it in
                  // the accessible name for anyone using a screen reader.
                  aria-label={link.detail ? `${link.label} — ${link.detail}` : link.label}
                  className={cn(
                    className,
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
                  )}
                >
                  {body}
                </a>
              ) : (
                <span className={className}>{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </FollioSection>
  );
}
