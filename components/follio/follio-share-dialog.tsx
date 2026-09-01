'use client';

import { Check, Copy, Share2, UserRoundPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FollioIdentity } from '@/lib/follio-identity';

import { useSaveContact } from './use-save-contact';

interface FollioShareDialogProps {
  identity: FollioIdentity;
  /** Server-rendered QR for `identity.follioUrl`. */
  qrSvg: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The career-fair moment: the owner opens this and holds the phone out to be
 * scanned. Everything a visitor needs is one action away.
 */
export function FollioShareDialog({ identity, qrSvg, open, onOpenChange }: FollioShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const { save, saved } = useSaveContact(identity);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    return () => clearTimeout(timer.current);
  }, []);

  const displayUrl = identity.follioUrl.replace(/^https?:\/\//, '');

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(identity.follioUrl);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the link is printed below the QR to read or type.
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({
        title: `${identity.fullName} on Follio`,
        text: identity.headline ?? undefined,
        url: identity.follioUrl,
      });
    } catch {
      // Visitor dismissed the OS share sheet.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share this Follio</DialogTitle>
          <DialogDescription>
            Scan the code or send the link. It opens {identity.shortName}&apos;s contact details,
            resume, and work.
          </DialogDescription>
        </DialogHeader>

        {qrSvg ? (
          <div className="mx-auto w-full max-w-[15rem] rounded-xl border border-border/60 bg-white p-3">
            <div
              className="aspect-square w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
              // Generated server-side by our own QR renderer — no external input.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              role="img"
              aria-label={`QR code for ${displayUrl}`}
            />
          </div>
        ) : null}

        <p className="text-center font-mono text-[13px] text-muted-foreground">{displayUrl}</p>

        <div className="grid gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={copyLink}>
            {copied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
          {canNativeShare ? (
            <Button type="button" variant="outline" className="gap-2" onClick={nativeShare}>
              <Share2 className="h-4 w-4" aria-hidden />
              Share
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="gap-2" onClick={save}>
            {saved ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <UserRoundPlus className="h-4 w-4" aria-hidden />
            )}
            {saved ? 'Added to contacts' : 'Save contact'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
