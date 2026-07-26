'use client';

import { useUser } from '@clerk/nextjs';
import { Download, Lock, MessageSquareText, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ShareComposeActions } from '@/components/document-share/share-compose-actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  buildPrivateDocumentShareEmailSubject,
  buildPrivateDocumentShareMessage,
  detectWebmailProvider,
} from '@/lib/share';

export interface PrivateDocumentShareDialogProps {
  /** e.g. "cover letter" */
  documentLabel: string;
  /** Document title for email subject */
  title: string;
  firstName?: string | null;
  /** Optional: open download dialog from share */
  onDownloadClick?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Show built-in trigger in uncontrolled mode */
  showTrigger?: boolean;
  triggerLabel?: string;
}

/**
 * Private-only share sheet (`ShareDeliveryMode: private`).
 *
 * Generic PDF + email share for documents without visibility controls.
 * Resume / portfolio / cover letter use `ShareDialog` instead.
 */
export function PrivateDocumentShareDialog({
  documentLabel,
  title,
  firstName,
  onDownloadClick,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  showTrigger = true,
  triggerLabel = 'Share',
}: PrivateDocumentShareDialogProps) {
  const { user } = useUser();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen;

  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
  const webmail = useMemo(() => detectWebmailProvider(primaryEmail), [primaryEmail]);

  const [message, setMessage] = useState(() =>
    buildPrivateDocumentShareMessage(firstName, documentLabel)
  );

  useEffect(() => {
    if (open) {
      setMessage(buildPrivateDocumentShareMessage(firstName, documentLabel));
    }
  }, [open, firstName, documentLabel]);

  const subject = buildPrivateDocumentShareEmailSubject(title, documentLabel);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && showTrigger ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">{triggerLabel}</span>
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Share {documentLabel}
          </TooltipContent>
        </Tooltip>
      ) : null}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            Share {documentLabel}
          </DialogTitle>
          <DialogDescription>
            This {documentLabel} stays private in Follio. Share by email or send a PDF — there is no
            public link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-[12px] text-muted-foreground">
            Only you can open this {documentLabel} in Follio. Download a PDF to attach it to your
            email.
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
              <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
              Message
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              className="w-full resize-y rounded-lg border border-border/70 bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Share message"
            />
            <ShareComposeActions
              message={message}
              subject={subject}
              webmail={webmail}
              density="default"
              align="start"
              webmailLabelMode="open"
              actionsOrder="copy-first"
            />
          </div>

          {onDownloadClick ? (
            <>
              <Separator />
              <Button
                type="button"
                className="w-full gap-1.5"
                onClick={() => {
                  setOpen(false);
                  onDownloadClick();
                }}
              >
                <Download className="h-4 w-4" />
                Download PDF to attach
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
