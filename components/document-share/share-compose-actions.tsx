'use client';

import { Check, ClipboardCopy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { copyTextToClipboard, openWebmailCompose, type WebmailProvider } from '@/lib/share';
import { cn } from '@/lib/utils';

export interface ShareComposeActionsProps {
  message: string;
  subject: string;
  webmail: WebmailProvider | null;
  /** Visual density — resume dialog uses compact; private dialog uses default. */
  density?: 'compact' | 'default';
  /** Layout of the action row. */
  align?: 'start' | 'end';
  className?: string;
  /** Label for the webmail button. */
  webmailLabelMode?: 'open' | 'send';
  /** Button order — private share prefers copy first; link share prefers webmail first. */
  actionsOrder?: 'copy-first' | 'webmail-first';
}

/**
 * Shared Copy message + optional webmail compose actions.
 * Used by link-based ShareDialog and private document share.
 */
export function ShareComposeActions({
  message,
  subject,
  webmail,
  density = 'default',
  align = 'start',
  className,
  webmailLabelMode = 'open',
  actionsOrder = 'copy-first',
}: ShareComposeActionsProps) {
  const [copied, setCopied] = useState(false);
  const compact = density === 'compact';

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(message);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleWebmail = () => {
    openWebmailCompose(webmail, subject, message);
  };

  const webmailLabel = webmail
    ? webmailLabelMode === 'send'
      ? `Send via ${webmail.name}`
      : `Open in ${webmail.name}`
    : null;

  const copyButton = (
    <Button
      type="button"
      variant={copied && compact ? 'outline' : compact ? 'default' : 'outline'}
      size="sm"
      className={cn('gap-1.5', compact && 'h-7 px-3 text-xs')}
      onClick={() => void handleCopy()}
    >
      {copied ? <Check className={cn(compact ? 'h-3 w-3 text-primary' : 'h-3.5 w-3.5')} /> : null}
      {!copied ? <ClipboardCopy className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} /> : null}
      {copied ? (compact ? 'Copied!' : 'Copied') : 'Copy message'}
    </Button>
  );

  const webmailButton =
    webmail && webmailLabel ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn('gap-1.5', compact && 'h-7 px-3 text-xs')}
        onClick={handleWebmail}
      >
        {webmail.logo}
        {webmailLabel}
      </Button>
    ) : null;

  return (
    <div
      className={cn(
        'flex flex-wrap gap-2',
        align === 'end' && 'items-center justify-end',
        className
      )}
    >
      {actionsOrder === 'webmail-first' ? (
        <>
          {webmailButton}
          {copyButton}
        </>
      ) : (
        <>
          {copyButton}
          {webmailButton}
        </>
      )}
    </div>
  );
}
