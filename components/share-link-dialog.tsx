'use client';

import { Check, Copy, Link2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * ShareLinkDialog
 *
 * Lightweight share dialog for visitors to a public resume page who
 * are *not* the resume's owner. Owners get the full `<ShareDialog>`
 * (which includes visibility controls, regenerate-key, webmail
 * compose, etc.) — visitors only need to be able to copy the link
 * to the page they're already looking at.
 *
 * Intentionally minimal: a single read-only URL field with a copy
 * affordance. No API calls, no auth assumptions.
 */
interface ShareLinkDialogProps {
  /** The URL to share — typically the current page URL. */
  shareUrl: string;
  /** Display name of the resume owner, used to build the dialog copy. */
  ownerFirstName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COPY_FEEDBACK_MS = 2000;

export function ShareLinkDialog({
  shareUrl,
  ownerFirstName,
  open,
  onOpenChange,
}: ShareLinkDialogProps) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending feedback timers on unmount or close to avoid setting
  // state on an unmounted component.
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // Reset copied indicator whenever the dialog reopens.
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // Fallback for non-secure contexts (e.g. http://localhost over LAN).
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopied(true);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch (err) {
      console.error('Failed to copy share link:', err);
    }
  }, [shareUrl]);

  const subject = ownerFirstName?.trim()
    ? `Share ${ownerFirstName.trim()}'s resume`
    : 'Share this resume';

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {subject}
            </DialogTitle>
            <DialogDescription>
              Copy the link below to share this resume with anyone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 font-mono text-xs"
              aria-label="Shareable link"
            />
            <Button
              type="button"
              onClick={handleCopy}
              variant={copied ? 'default' : 'outline'}
              className="shrink-0 gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
