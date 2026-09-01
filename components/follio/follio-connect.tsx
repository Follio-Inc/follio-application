'use client';

import { Check, Copy, Mail, Phone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FollioIdentity } from '@/lib/follio-identity';
import { unveilContactValue } from '@/lib/follio-identity';
import { copyTextToClipboard } from '@/lib/share';
import { cn } from '@/lib/utils';

import { FOLLIO_CHIP, FOLLIO_CHIP_INTERACTIVE } from './chip';

interface FollioConnectProps {
  identity: FollioIdentity;
  /** Display-only mode for the dashboard preview. */
  interactive?: boolean;
}

/**
 * Email and phone stay behind Contact until the visitor asks. Tokens in the
 * page payload are cloaked so scrapers never see a raw `@` or phone number.
 */
export function FollioConnect({ identity, interactive = true }: FollioConnectProps) {
  const { contact } = identity;
  const hasContact = Boolean(contact.email || contact.phone);
  const [open, setOpen] = useState(false);

  if (!hasContact) return null;

  const className = cn(FOLLIO_CHIP, 'w-full', interactive && FOLLIO_CHIP_INTERACTIVE);

  const body = (
    <>
      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      Contact
    </>
  );

  if (!interactive) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={className}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Contact ${identity.shortName}`}
        >
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2" sideOffset={8}>
        {open ? <RevealedContact identity={identity} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function RevealedContact({ identity }: { identity: FollioIdentity }) {
  const email = identity.contact.email ? unveilContactValue(identity.contact.email) : null;
  const phone = identity.contact.phone ? unveilContactValue(identity.contact.phone) : null;
  const phoneDisplay = identity.contact.phoneDisplay
    ? unveilContactValue(identity.contact.phoneDisplay)
    : phone;

  return (
    <ul className="space-y-1">
      {email ? (
        <RevealedRow
          icon={Mail}
          label="Email"
          value={email}
          href={`mailto:${email}`}
          copyValue={email}
        />
      ) : null}
      {phone ? (
        <RevealedRow
          icon={Phone}
          label="Phone"
          value={phoneDisplay ?? phone}
          href={`tel:${phone}`}
          copyValue={phoneDisplay ?? phone}
        />
      ) : null}
    </ul>
  );
}

interface RevealedRowProps {
  icon: typeof Mail;
  label: string;
  value: string;
  href: string;
  copyValue: string;
}

function RevealedRow({ icon: Icon, label, value, href, copyValue }: RevealedRowProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await copyTextToClipboard(copyValue);
    if (!ok) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <li className="flex items-center gap-1">
      <a
        href={href}
        className="flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={`${label}: ${value}`}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{value}</span>
      </a>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground"
        onClick={() => void copy()}
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
      </Button>
    </li>
  );
}
