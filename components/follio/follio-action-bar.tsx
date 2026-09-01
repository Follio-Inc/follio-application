'use client';

import { Check, FileText, QrCode, UserRoundPlus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { FollioIdentity } from '@/lib/follio-identity';
import { cn } from '@/lib/utils';

import { useSaveContact } from './use-save-contact';

interface FollioActionBarProps {
  identity: FollioIdentity;
  /** Revealed once the connect block scrolls out of view. */
  visible: boolean;
  onShare?: () => void;
}

/**
 * Phone-only bar that keeps saving a contact reachable no matter how far down
 * the page a visitor has read. Hidden on larger screens, where the connect
 * block stays close enough to the top to find again.
 */
export function FollioActionBar({ identity, visible, onShare }: FollioActionBarProps) {
  const { save, saved } = useSaveContact(identity);

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur',
        'px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-200 sm:hidden',
        visible ? 'translate-y-0' : 'translate-y-full'
      )}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-2">
        <Button type="button" className="flex-1 gap-2" onClick={save} tabIndex={visible ? 0 : -1}>
          {saved ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <UserRoundPlus className="h-4 w-4" aria-hidden />
          )}
          {saved ? 'Saved' : 'Save contact'}
        </Button>

        {identity.doors.resume ? (
          <Button asChild variant="outline" size="icon" className="shrink-0">
            <Link href={identity.resumeHref} aria-label="Resume" tabIndex={visible ? 0 : -1}>
              <FileText className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : null}

        {onShare ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={onShare}
            aria-label="Share this Follio"
            tabIndex={visible ? 0 : -1}
          >
            <QrCode className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
