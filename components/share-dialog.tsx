'use client';

import { useUser } from '@clerk/nextjs';
import {
  AlertTriangle,
  Check,
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

import { ShareComposeActions } from '@/components/document-share/share-compose-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import type { CoverLetterVisibility } from '@/lib/cover-letter';
import { isPortfolioEnabled } from '@/lib/features';
import {
  buildLinkShareEmailSubject,
  buildLinkShareMessage,
  copyTextToClipboard,
  detectWebmailProvider,
  type LinkShareKind,
} from '@/lib/share';
import { getPortfolioUrl, getResumeUrl, getUnlistedCoverLetterUrl } from '@/lib/url';

import type { ContentVisibility } from '@prisma/client';

// ── Types ───────────────────────────────────────────────────────────────

/**
 * One share dialog for all link-capable documents.
 * Cover letters omit Public — Unlisted | Private only (same order as resume).
 */
export type ShareDialogVariant = 'resume' | 'portfolio' | 'cover-letter';

/**
 * Minimal profile shape required by ShareDialog for resume / portfolio.
 * Accepts both FullProfile (from builder) and lightweight objects (from resumes dashboard).
 */
export interface ShareDialogProfile {
  /** Profile / resume id — used to detect when another resume is already public. */
  id?: string;
  handle: string;
  firstName: string | null;
  resumeTitle?: string | null;
  resumeVisibility?: ContentVisibility | null;
  portfolioVisibility?: ContentVisibility | null;
}

export interface ShareDialogProps {
  /**
   * Profile for resume / portfolio sharing.
   * Optional when `variant="cover-letter"` (use `coverLetterId` instead).
   */
  profile?: ShareDialogProfile;
  /** Which content type to share. Defaults to resume. */
  variant?: ShareDialogVariant;
  /** Required when `variant="cover-letter"`. */
  coverLetterId?: string;
  /** Current cover letter visibility (PRIVATE | UNLISTED). */
  coverLetterVisibility?: CoverLetterVisibility;
  /** First name for share message when sharing a cover letter. */
  firstName?: string | null;
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
  /**
   * Vanity username for the public resume URL (follio.me/{username}).
   * Falls back to profile.handle when omitted; refreshed from /api/resumes on open.
   */
  vanityUsername?: string | null;
}

type VisibilityOption = {
  value: ContentVisibility;
  label: string;
  description: string;
  icon: typeof Globe;
  color: string;
  badgeVariant: 'default' | 'secondary' | 'outline';
};

const UNLISTED_OPTION: VisibilityOption = {
  value: 'UNLISTED',
  label: 'Unlisted',
  description: 'Only people with the secure link',
  icon: Link2,
  color: 'text-foreground',
  badgeVariant: 'secondary',
};

const PRIVATE_OPTION: VisibilityOption = {
  value: 'PRIVATE',
  label: 'Private',
  description: 'Only you can see this',
  icon: EyeOff,
  color: 'text-muted-foreground',
  badgeVariant: 'outline',
};

// Resumes: Public → Unlisted → Private
const RESUME_VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Anyone can view at your Follio URL',
    icon: Globe,
    color: 'text-foreground',
    badgeVariant: 'default',
  },
  UNLISTED_OPTION,
  PRIVATE_OPTION,
];

const PORTFOLIO_VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Anyone can view your portfolio',
    icon: Globe,
    color: 'text-foreground',
    badgeVariant: 'default',
  },
  UNLISTED_OPTION,
  PRIVATE_OPTION,
];

// Cover letters: Unlisted → Private (same order as resume, Public omitted)
const COVER_LETTER_VISIBILITY_OPTIONS: VisibilityOption[] = [UNLISTED_OPTION, PRIVATE_OPTION];

function normalizeResumeVisibility(v: ContentVisibility | null | undefined): ContentVisibility {
  return v ?? 'PRIVATE';
}

function normalizePortfolioVisibility(v: ContentVisibility | null | undefined): ContentVisibility {
  return v ?? 'PUBLIC';
}

function normalizeCoverLetterVisibility(
  v: CoverLetterVisibility | ContentVisibility | null | undefined
): ContentVisibility {
  return v === 'UNLISTED' ? 'UNLISTED' : 'PRIVATE';
}

function getInitialVisibility(
  variant: ShareDialogVariant,
  profile: ShareDialogProfile | undefined,
  coverLetterVisibility: CoverLetterVisibility | undefined
): ContentVisibility {
  if (variant === 'cover-letter') {
    return normalizeCoverLetterVisibility(coverLetterVisibility);
  }
  if (variant === 'portfolio') {
    return normalizePortfolioVisibility(profile?.portfolioVisibility);
  }
  return normalizeResumeVisibility(profile?.resumeVisibility);
}

function variantMeta(variant: ShareDialogVariant) {
  if (variant === 'portfolio') {
    return {
      contentLabel: 'portfolio',
      dialogTitle: 'Share Portfolio',
      dialogDescription: 'Control access and share your portfolio.',
      triggerTooltip: 'Share your portfolio',
      privateLinkHint: 'Change access to Public or Unlisted to get a link.',
      privateMessageHint: 'Make your portfolio Public or Unlisted to get a shareable message.',
      linkKind: 'portfolio' as LinkShareKind,
    };
  }
  if (variant === 'cover-letter') {
    return {
      contentLabel: 'cover letter',
      dialogTitle: 'Share Cover Letter',
      dialogDescription:
        'Control access and share your cover letter. Cover letters cannot be public.',
      triggerTooltip: 'Share your cover letter',
      privateLinkHint: 'Change access to Unlisted to get a link.',
      privateMessageHint: 'Make your cover letter Unlisted to get a shareable message.',
      linkKind: 'cover-letter' as LinkShareKind,
    };
  }
  return {
    contentLabel: 'resume',
    dialogTitle: 'Share Resume',
    dialogDescription: 'Control access and share your resume. Only one resume can be public.',
    triggerTooltip: 'Share your resume',
    privateLinkHint: 'Change access to Public or Unlisted to get a link.',
    privateMessageHint: 'Make your resume Public or Unlisted to get a shareable message.',
    linkKind: 'resume' as LinkShareKind,
  };
}

/**
 * Shared share dialog for resume, portfolio, and cover letter.
 * Same chrome and Unlisted → Private order everywhere; Public only on resume/portfolio.
 */
export function ShareDialog({
  profile,
  variant = 'resume',
  coverLetterId,
  coverLetterVisibility,
  firstName: firstNameProp,
  open: controlledOpen,
  onOpenChange,
  onBeforeOpen,
  onVisibilityChange,
  hideTrigger,
  vanityUsername: vanityUsernameProp,
}: ShareDialogProps) {
  const { user: clerkUser } = useUser();
  const isCoverLetter = variant === 'cover-letter';
  const isPortfolio = variant === 'portfolio';

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const visibilityOptions = isCoverLetter
    ? COVER_LETTER_VISIBILITY_OPTIONS
    : isPortfolio
      ? PORTFOLIO_VISIBILITY_OPTIONS
      : RESUME_VISIBILITY_OPTIONS;

  const meta = variantMeta(variant);
  const resolvedFirstName = firstNameProp ?? profile?.firstName ?? null;

  const [contentVisibility, setContentVisibility] = useState<ContentVisibility>(() =>
    getInitialVisibility(variant, profile, coverLetterVisibility)
  );
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savedVisibility, setSavedVisibility] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const [unlistedKey, setUnlistedKey] = useState<string | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [vanityUsername, setVanityUsername] = useState<string>(
    vanityUsernameProp || profile?.handle || ''
  );
  const [pendingPublicConfirm, setPendingPublicConfirm] = useState<{
    title: string;
  } | null>(null);

  const [shareMessage, setShareMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const webmailProvider = useMemo(() => detectWebmailProvider(primaryEmail), [primaryEmail]);

  const shareUrl = isCoverLetter
    ? contentVisibility === 'UNLISTED' && unlistedKey
      ? getUnlistedCoverLetterUrl(unlistedKey)
      : ''
    : isPortfolio
      ? getPortfolioUrl(
          profile?.handle ?? '',
          contentVisibility === 'UNLISTED' ? unlistedKey : null
        )
      : getResumeUrl(
          vanityUsername || profile?.handle || '',
          contentVisibility === 'UNLISTED' ? unlistedKey : null
        );

  const fetchUnlistedKey = useCallback(async () => {
    setIsLoadingKey(true);
    try {
      const path = isCoverLetter
        ? `/api/cover-letters/${coverLetterId}/unlisted-key`
        : '/api/profile/unlisted-key';
      if (isCoverLetter && !coverLetterId) return;
      const res = await fetch(path);
      if (res.ok) {
        const data = await res.json();
        setUnlistedKey(data.unlistedKey ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch unlisted key:', err);
    } finally {
      setIsLoadingKey(false);
    }
  }, [isCoverLetter, coverLetterId]);

  const refreshVanityUsername = useCallback(async () => {
    if (isCoverLetter) return;
    if (vanityUsernameProp) {
      setVanityUsername(vanityUsernameProp);
      return;
    }
    try {
      const res = await fetch('/api/resumes');
      if (res.ok) {
        const data = await res.json();
        if (typeof data.vanityUsername === 'string' && data.vanityUsername) {
          setVanityUsername(data.vanityUsername);
        }
      }
    } catch (err) {
      console.error('Failed to fetch vanity username:', err);
    }
  }, [vanityUsernameProp, isCoverLetter]);

  useEffect(() => {
    if (!open) return;

    setContentVisibility(getInitialVisibility(variant, profile, coverLetterVisibility));
    setShowRegenConfirm(false);
    setSavedVisibility(false);
    setPendingPublicConfirm(null);
    if (!isCoverLetter) {
      setVanityUsername(vanityUsernameProp || profile?.handle || '');
    }

    const init = async () => {
      setIsInitializing(true);
      try {
        if (onBeforeOpen) {
          await onBeforeOpen();
        }
        await Promise.all([fetchUnlistedKey(), refreshVanityUsername()]);
      } finally {
        setIsInitializing(false);
      }
    };
    void init();
  }, [
    open,
    fetchUnlistedKey,
    refreshVanityUsername,
    onBeforeOpen,
    profile,
    vanityUsernameProp,
    variant,
    coverLetterVisibility,
    isCoverLetter,
  ]);

  useEffect(() => {
    if (contentVisibility === 'PRIVATE' || !shareUrl) {
      setShareMessage('');
      return;
    }
    setShareMessage(buildLinkShareMessage(resolvedFirstName, shareUrl, meta.linkKind));
  }, [resolvedFirstName, shareUrl, meta.linkKind, contentVisibility]);

  const persistVisibility = async (value: ContentVisibility) => {
    const prev = contentVisibility;
    setContentVisibility(value);
    setSavingVisibility(true);

    try {
      if (isCoverLetter) {
        if (value === 'PUBLIC') {
          setContentVisibility(prev);
          return;
        }
        const res = await fetch(`/api/cover-letters/${coverLetterId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility: value }),
        });
        if (!res.ok) throw new Error('Failed to update visibility');
      } else {
        const res = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isPortfolio ? { portfolioVisibility: value } : { resumeVisibility: value }
          ),
        });
        if (!res.ok) throw new Error('Failed to update visibility');

        const data = await res.json().catch(() => ({}));
        if (typeof data.vanityUsername === 'string' && data.vanityUsername) {
          setVanityUsername(data.vanityUsername);
        }
      }

      onVisibilityChange?.(value);
      setSavedVisibility(true);
      setTimeout(() => setSavedVisibility(false), 2000);

      if (value === 'UNLISTED' && !unlistedKey) {
        await fetchUnlistedKey();
      }
    } catch (err) {
      console.error('Failed to update visibility:', err);
      setContentVisibility(prev);
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleVisibilityChange = async (value: ContentVisibility) => {
    if (value === contentVisibility) return;

    if (!isCoverLetter && !isPortfolio && value === 'PUBLIC' && profile) {
      try {
        const res = await fetch('/api/resumes');
        if (res.ok) {
          const data = await res.json();
          if (typeof data.vanityUsername === 'string' && data.vanityUsername) {
            setVanityUsername(data.vanityUsername);
          }
          const otherPublic = (
            data.resumes as Array<{
              id: string;
              handle: string;
              resumeTitle: string;
              resumeVisibility: string;
            }>
          ).find(
            (r) =>
              r.resumeVisibility === 'PUBLIC' &&
              r.handle !== profile.handle &&
              (!profile.id || r.id !== profile.id)
          );
          if (otherPublic) {
            setPendingPublicConfirm({
              title: otherPublic.resumeTitle || 'another resume',
            });
            return;
          }
        }
      } catch (err) {
        console.error('Failed to check existing public resume:', err);
      }
    }

    await persistVisibility(value);
  };

  const confirmReplacePublic = async () => {
    setPendingPublicConfirm(null);
    await persistVisibility('PUBLIC');
  };

  const handleRegenerateKey = async () => {
    setIsRegeneratingKey(true);
    try {
      const path = isCoverLetter
        ? `/api/cover-letters/${coverLetterId}/unlisted-key`
        : '/api/profile/unlisted-key';
      const res = await fetch(path, { method: 'POST' });
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

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    const ok = await copyTextToClipboard(shareUrl);
    if (!ok) return;
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  };

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

  const emailSubject = buildLinkShareEmailSubject(resolvedFirstName, meta.linkKind);

  const currentVisibility =
    visibilityOptions.find((v) => v.value === contentVisibility) ?? visibilityOptions[0];
  const CurrentIcon = currentVisibility.icon;

  if (isPortfolio && !isPortfolioEnabled()) {
    return null;
  }

  if (isCoverLetter && !coverLetterId) {
    return null;
  }

  if (!isCoverLetter && !profile) {
    return null;
  }

  return (
    <>
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
                <p>{meta.triggerTooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[480px]">
          <DialogHeader className="px-5 pb-3 pt-5">
            <DialogTitle className="text-base">{meta.dialogTitle}</DialogTitle>
            <DialogDescription className="text-xs">{meta.dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(85vh-80px)] overflow-y-auto">
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
                {visibilityOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = contentVisibility === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void handleVisibilityChange(option.value)}
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
                  <span className="flex items-center gap-1 text-[11px] text-primary">
                    <Check className="h-2.5 w-2.5" />
                    Saved
                  </span>
                )}
              </div>
            </div>

            <Separator />

            <div className="px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-medium text-muted-foreground">Share link</h3>
              </div>

              {contentVisibility === 'PRIVATE' ? (
                <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">{meta.privateLinkHint}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 rounded-md border bg-muted/30 px-2.5 py-1.5">
                      {isLoadingKey && contentVisibility === 'UNLISTED' ? (
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
                      onClick={() => void handleCopyLink()}
                      disabled={isLoadingKey || !shareUrl}
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                    >
                      {copiedLink ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedLink ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>

                  {shareUrl ? (
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
                  ) : null}

                  {contentVisibility === 'UNLISTED' && (
                    <div className="mt-1">
                      {!showRegenConfirm ? (
                        <button
                          type="button"
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
                              type="button"
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

            <div className="px-5 pb-5 pt-4">
              <div className="mb-2 flex items-center gap-2">
                <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-medium text-muted-foreground">Share message</h3>
              </div>

              {contentVisibility === 'PRIVATE' ? (
                <p className="text-xs text-muted-foreground">{meta.privateMessageHint}</p>
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
                    aria-label="Share message"
                  />
                  <ShareComposeActions
                    message={shareMessage}
                    subject={emailSubject}
                    webmail={webmailProvider}
                    density="compact"
                    align="end"
                    webmailLabelMode="send"
                    actionsOrder="webmail-first"
                  />
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingPublicConfirm !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingPublicConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make this your public resume?</AlertDialogTitle>
            <AlertDialogDescription>
              Only one resume can be public. Making this public will switch{' '}
              <strong>{pendingPublicConfirm?.title}</strong> to Unlisted. Your public URL (
              follio.me/{vanityUsername || profile?.handle}) will then show this resume.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingVisibility}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmReplacePublic()}
              disabled={savingVisibility}
            >
              Make this public
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
