'use client';

import { useUser } from '@clerk/nextjs';
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Link2,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Share2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getResumeUrl } from '@/lib/url';

import type { ContentVisibility } from '@prisma/client';

// ── Types ───────────────────────────────────────────────────────────────

/**
 * Minimal profile shape required by ShareDialog.
 * Accepts both FullProfile (from builder) and lightweight objects (from resumes dashboard).
 */
export interface ShareDialogProfile {
  handle: string;
  firstName: string | null;
  resumeVisibility?: ContentVisibility | null;
}

export interface ShareDialogProps {
  profile: ShareDialogProfile;
  /** Controlled open state (optional). When provided, the dialog is externally controlled. */
  open?: boolean;
  /** Callback when the open state changes (required when `open` is provided). */
  onOpenChange?: (open: boolean) => void;
  /**
   * Called before the dialog opens API-dependent actions (e.g. fetching unlisted key).
   * Use this to activate the correct profile when sharing from the resumes dashboard.
   */
  onBeforeOpen?: () => Promise<void>;
  /** Called after visibility is successfully persisted so the parent can sync local state. */
  onVisibilityChange?: (visibility: ContentVisibility) => void;
  /** When true, hides the default trigger button (use with controlled open/onOpenChange). */
  hideTrigger?: boolean;
}

type VisibilityOption = {
  value: ContentVisibility;
  label: string;
  description: string;
  icon: typeof Globe;
  color: string;
  badgeVariant: 'default' | 'secondary' | 'outline';
};

// A resume contains personal contact details, so it deliberately has no
// openly-public mode — only a secure (unguessable) link or fully private.
const VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: 'UNLISTED',
    label: 'Unlisted',
    description: 'Only people with the secure link',
    icon: Link2,
    color: 'text-yellow-600',
    badgeVariant: 'secondary',
  },
  {
    value: 'PRIVATE',
    label: 'Private',
    description: 'Only you can see this',
    icon: EyeOff,
    color: 'text-muted-foreground',
    badgeVariant: 'outline',
  },
];

// ── Webmail Providers ────────────────────────────────────────────────────

interface WebmailProvider {
  /** Display name shown on the button. */
  name: string;
  /** Small inline SVG logo for the button. */
  logo: React.ReactNode;
  /** Build a compose URL with pre-filled subject and body. */
  buildComposeUrl: (subject: string, body: string) => string;
}

// ── Provider Logos (inline SVGs, 14×14) ─────────────────────────────────

const GMAIL_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <path fill="#4caf50" d="M45 16.2l-5 2.75-8 4.5V40h11c1.1 0 2-.9 2-2V16.2z" />
    <path fill="#1e88e5" d="M3 16.2l3.04 1.67L14 22.45V40H3c-1.1 0-2-.9-2-2V16.2z" />
    <path fill="#e53935" d="M35 11.2L24 19.45 13 11.2 12 17 24 25.45 36 17z" />
    <path fill="#c62828" d="M3 12.298V16.2l11 6.25V11.2L9.876 8.859z" />
    <path fill="#fbc02d" d="M45 12.298V16.2l-10 5.65V11.2l3.34-2.155z" />
  </svg>
);

const OUTLOOK_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <path
      fill="#1976d2"
      d="M28 13h14.533C43.343 13 44 13.657 44 14.467v19.066c0 .81-.657 1.467-1.467 1.467H28V13z"
    />
    <path fill="#1565c0" d="M28 13l8 7.5L44 13z" />
    <path fill="#2196f3" d="M28 35l8-7.5 8 7.5z" />
    <rect fill="#0d47a1" x="2" y="11" width="22" height="26" rx="1.5" />
    <ellipse fill="#fff" cx="13" cy="24" rx="6" ry="7.5" />
    <ellipse fill="#0d47a1" cx="13" cy="24" rx="3.5" ry="5" />
  </svg>
);

const YAHOO_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <path fill="#6001d2" d="M4 4h40v40H4z" rx="4" />
    <path fill="#fff" d="M13.5 14l6.5 11v9h4v-9l6.5-11h-4.5L22 22.5 17.5 14z" />
    <circle fill="#fff" cx="34" cy="16" r="2.5" />
  </svg>
);

const AOL_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <rect fill="#1a1a2e" width="48" height="48" rx="4" />
    <text
      x="24"
      y="30"
      textAnchor="middle"
      fill="#fff"
      fontSize="16"
      fontWeight="bold"
      fontFamily="Arial"
    >
      Aol
    </text>
  </svg>
);

const ZOHO_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <rect fill="#f0483e" width="48" height="48" rx="4" />
    <text
      x="24"
      y="31"
      textAnchor="middle"
      fill="#fff"
      fontSize="14"
      fontWeight="bold"
      fontFamily="Arial"
    >
      Z
    </text>
  </svg>
);

/**
 * Map of email domains to their web compose URLs.
 * Easily extensible — just add a new entry for each provider.
 */
const WEBMAIL_PROVIDERS: Record<string, WebmailProvider> = {
  // Google
  'gmail.com': {
    name: 'Gmail',
    logo: GMAIL_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
  'googlemail.com': {
    name: 'Gmail',
    logo: GMAIL_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },

  // Microsoft
  'outlook.com': {
    name: 'Outlook',
    logo: OUTLOOK_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
  'hotmail.com': {
    name: 'Outlook',
    logo: OUTLOOK_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
  'live.com': {
    name: 'Outlook',
    logo: OUTLOOK_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
  'msn.com': {
    name: 'Outlook',
    logo: OUTLOOK_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },

  // Yahoo
  'yahoo.com': {
    name: 'Yahoo Mail',
    logo: YAHOO_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://compose.mail.yahoo.com/?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
  'yahoo.co.in': {
    name: 'Yahoo Mail',
    logo: YAHOO_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://compose.mail.yahoo.com/?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
  'yahoo.co.uk': {
    name: 'Yahoo Mail',
    logo: YAHOO_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://compose.mail.yahoo.com/?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
  'ymail.com': {
    name: 'Yahoo Mail',
    logo: YAHOO_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://compose.mail.yahoo.com/?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },

  // AOL
  'aol.com': {
    name: 'AOL Mail',
    logo: AOL_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://mail.aol.com/webmail-std/en-us/suite#/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },

  // Zoho
  'zoho.com': {
    name: 'Zoho Mail',
    logo: ZOHO_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://mail.zoho.com/zm/#compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
  'zohomail.com': {
    name: 'Zoho Mail',
    logo: ZOHO_LOGO,
    buildComposeUrl: (subject, body) =>
      `https://mail.zoho.com/zm/#compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  },
};

/**
 * Legacy PUBLIC resumes are surfaced as UNLISTED since the resume no longer
 * supports an openly-public mode.
 */
function normalizeResumeVisibility(v: ContentVisibility | null | undefined): ContentVisibility {
  return v === 'PUBLIC' ? 'UNLISTED' : (v ?? 'PRIVATE');
}

/** Detect webmail provider from an email address. Returns null for unsupported domains. */
function detectWebmailProvider(email: string | null | undefined): WebmailProvider | null {
  if (!email) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  return WEBMAIL_PROVIDERS[domain] ?? null;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Build the default share message pre-filled with the user's name and link. */
function buildDefaultMessage(firstName: string | null, shareUrl: string): string {
  const signOff = firstName?.trim() || '';
  return [
    'Hi,',
    '',
    `I'd love to share my resume with you. You can view it here:`,
    shareUrl,
    '',
    'Best,',
    signOff,
  ].join('\n');
}

// ── Component ───────────────────────────────────────────────────────────

export function ShareDialog({
  profile,
  open: controlledOpen,
  onOpenChange,
  onBeforeOpen,
  onVisibilityChange,
  hideTrigger,
}: ShareDialogProps) {
  const { user: clerkUser } = useUser();
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Visibility state.
  const [resumeVisibility, setResumeVisibility] = useState<ContentVisibility>(
    normalizeResumeVisibility(profile.resumeVisibility)
  );
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savedVisibility, setSavedVisibility] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // Link state
  const [unlistedKey, setUnlistedKey] = useState<string | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  // Copyable message state
  const [shareMessage, setShareMessage] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Webmail provider detection from Clerk primary email
  const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const webmailProvider = useMemo(() => detectWebmailProvider(primaryEmail), [primaryEmail]);

  // Computed share URL
  const shareUrl = getResumeUrl(
    profile.handle,
    resumeVisibility === 'UNLISTED' ? unlistedKey : null
  );

  // ── Fetch unlisted key on open ──────────────────────────────────────

  const fetchUnlistedKey = useCallback(async () => {
    setIsLoadingKey(true);
    try {
      const res = await fetch('/api/profile/unlisted-key');
      if (res.ok) {
        const data = await res.json();
        setUnlistedKey(data.unlistedKey ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch unlisted key:', err);
    } finally {
      setIsLoadingKey(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      // Reset visibility state when opening with a (possibly) different profile
      setResumeVisibility(normalizeResumeVisibility(profile.resumeVisibility));
      setShowRegenConfirm(false);
      setSavedVisibility(false);

      const init = async () => {
        setIsInitializing(true);
        try {
          if (onBeforeOpen) {
            await onBeforeOpen();
          }
          await fetchUnlistedKey();
        } finally {
          setIsInitializing(false);
        }
      };
      void init();
    }
  }, [open, fetchUnlistedKey, onBeforeOpen, profile.resumeVisibility]);

  // Re-generate the default message whenever the share URL changes
  useEffect(() => {
    setShareMessage(buildDefaultMessage(profile.firstName ?? null, shareUrl));
  }, [profile.firstName, shareUrl]);

  // ── Visibility change ────────────────────────────────────────────────

  const handleVisibilityChange = async (value: ContentVisibility) => {
    const prev = resumeVisibility;
    setResumeVisibility(value);
    setSavingVisibility(true);

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeVisibility: value }),
      });

      if (!res.ok) throw new Error('Failed to update visibility');

      // Notify parent so it can sync local state
      onVisibilityChange?.(value);

      // Brief success indicator
      setSavedVisibility(true);
      setTimeout(() => setSavedVisibility(false), 2000);

      // If switching to UNLISTED, ensure we have a key
      if (value === 'UNLISTED' && !unlistedKey) {
        await fetchUnlistedKey();
      }
    } catch (err) {
      console.error('Failed to update visibility:', err);
      setResumeVisibility(prev);
    } finally {
      setSavingVisibility(false);
    }
  };

  // ── Regenerate secure link ───────────────────────────────────────────

  const handleRegenerateKey = async () => {
    setIsRegeneratingKey(true);
    try {
      const res = await fetch('/api/profile/unlisted-key', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setUnlistedKey(data.unlistedKey);
      }
    } catch (err) {
      console.error('Failed to regenerate key:', err);
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  // ── Copy link ────────────────────────────────────────────────────────

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // ── Copy message ──────────────────────────────────────────────────────

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement('textarea');
      textarea.value = shareMessage;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    }
  };

  // ── Auto-resize textarea ─────────────────────────────────────────────

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [shareMessage, autoResize]);

  // ── Open webmail compose ──────────────────────────────────────────────

  const handleSendViaEmail = () => {
    if (!webmailProvider) return;
    const firstName = profile.firstName?.trim() || '';
    const subject = `${firstName ? firstName + ' shared' : 'Shared'} a resume with you`;
    const composeUrl = webmailProvider.buildComposeUrl(subject, shareMessage);
    window.open(composeUrl, '_blank', 'noopener,noreferrer');
  };

  // ── Current visibility info ──────────────────────────────────────────

  const currentVisibility =
    VISIBILITY_OPTIONS.find((v) => v.value === resumeVisibility) ?? VISIBILITY_OPTIONS[0];
  const CurrentIcon = currentVisibility.icon;

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 gap-1.5 px-3.5 text-xs shadow-sm"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Share your resume</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[480px]">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Share2 className="h-4 w-4 text-primary" />
            Share Resume
          </DialogTitle>
          <DialogDescription className="text-xs">
            Control access and share your resume.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(85vh-80px)] overflow-y-auto">
          {/* ─── Access Section ──────────────────────────────────────── */}
          <div className="px-5 pb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground">General access</h3>
              <Badge
                variant={currentVisibility.badgeVariant}
                className="h-5 gap-1 px-1.5 text-[10px]"
              >
                <CurrentIcon className={`h-2.5 w-2.5 ${currentVisibility.color}`} />
                {currentVisibility.label}
              </Badge>
            </div>

            <div className="flex gap-1.5">
              {VISIBILITY_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = resumeVisibility === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleVisibilityChange(option.value)}
                    disabled={savingVisibility || isInitializing}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-center transition-colors ${
                      isActive ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/60'
                    } ${savingVisibility || isInitializing ? 'opacity-60' : ''}`}
                  >
                    <Icon
                      className={`h-4 w-4 ${isActive ? option.color : 'text-muted-foreground'}`}
                    />
                    <span
                      className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <p className="text-[11px] text-muted-foreground">{currentVisibility.description}</p>
              {savingVisibility && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Saving…
                </span>
              )}
              {savedVisibility && !savingVisibility && (
                <span className="flex items-center gap-1 text-[11px] text-green-600">
                  <Check className="h-2.5 w-2.5" />
                  Saved
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* ─── Link Section ──────────────────────────────────────── */}
          <div className="px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-xs font-medium text-muted-foreground">Share link</h3>
            </div>

            {resumeVisibility === 'PRIVATE' ? (
              <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-center">
                <p className="text-xs text-muted-foreground">
                  Change access to Public or Unlisted to get a link.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* URL display & copy */}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 rounded-md border bg-muted/30 px-2.5 py-1.5">
                    {isLoadingKey && resumeVisibility === 'UNLISTED' ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Generating...
                      </div>
                    ) : (
                      <code className="block truncate text-[11px] text-muted-foreground">
                        {shareUrl}
                      </code>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                    disabled={isLoadingKey}
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                  >
                    {copiedLink ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedLink ? 'Copied!' : 'Copy'}
                  </Button>
                </div>

                {/* Preview link */}
                <div className="flex items-center justify-end">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <Eye className="h-2.5 w-2.5" />
                    Preview
                    <ExternalLink className="h-2 w-2" />
                  </a>
                </div>

                {/* Regenerate link — cautious two-step */}
                {resumeVisibility === 'UNLISTED' && (
                  <div className="mt-1">
                    {!showRegenConfirm ? (
                      <button
                        onClick={() => setShowRegenConfirm(true)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        Revoke &amp; generate new link
                      </button>
                    ) : (
                      <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                          <p className="text-[11px] text-destructive">
                            This will generate a new link and{' '}
                            <strong>permanently break all previously shared links</strong>. Anyone
                            with the old link will lose access.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={async () => {
                              await handleRegenerateKey();
                              setShowRegenConfirm(false);
                            }}
                            disabled={isRegeneratingKey}
                            size="sm"
                            variant="destructive"
                            className="h-6 gap-1 px-2 text-[11px]"
                          >
                            {isRegeneratingKey ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-2.5 w-2.5" />
                            )}
                            {isRegeneratingKey ? 'Generating...' : 'Revoke & regenerate'}
                          </Button>
                          <button
                            onClick={() => setShowRegenConfirm(false)}
                            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* ─── Copyable Message Section ─────────────────────────── */}
          <div className="px-5 pb-5 pt-4">
            <div className="mb-2 flex items-center gap-2">
              <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-xs font-medium text-muted-foreground">Share message</h3>
            </div>

            {resumeVisibility === 'PRIVATE' ? (
              <p className="text-xs text-muted-foreground">
                Make your resume Public or Unlisted to get a shareable message.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Edit the message below, then copy &amp; paste it into any email or chat.
                </p>
                <textarea
                  ref={textareaRef}
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  className="w-full resize-none overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-foreground outline-none transition-colors focus:ring-1 focus:ring-ring"
                  rows={4}
                  style={{ maxHeight: '12rem' }}
                />
                <div className="flex items-center justify-end gap-2">
                  {webmailProvider && (
                    <Button
                      onClick={handleSendViaEmail}
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 px-3 text-xs"
                    >
                      {webmailProvider.logo}
                      Send via {webmailProvider.name}
                    </Button>
                  )}
                  <Button
                    onClick={handleCopyMessage}
                    size="sm"
                    variant={copiedMessage ? 'outline' : 'default'}
                    className="h-7 gap-1.5 px-3 text-xs"
                  >
                    {copiedMessage ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <ClipboardCopy className="h-3 w-3" />
                    )}
                    {copiedMessage ? 'Copied!' : 'Copy message'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
