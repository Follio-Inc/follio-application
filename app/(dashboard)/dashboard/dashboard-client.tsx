'use client';

import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Lock,
  MoreVertical,
  Pencil,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { ShareDialog } from '@/components/share-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getPortfolioUrl } from '@/lib/url';

import { DashboardResumesSection, type DashboardResumeItem } from './dashboard-resumes-section';
import { PortfolioThumbnail } from './portfolio-thumbnail';

// ─── Types ────────────────────────────────────────────────────────

interface ActiveProfile {
  id: string;
  handle: string;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  portfolioVisibility: string;
  resumeVisibility: string;
}

export interface DashboardData {
  portfolioProfile: ActiveProfile;
  resumes: DashboardResumeItem[];
  activeProfileId: string | null;
  primaryProfileId: string | null;
}

interface DashboardClientProps {
  data: DashboardData;
}

// ─── Constants ────────────────────────────────────────────────────

const VISIBILITY_CONFIG: Record<string, { label: string; icon: typeof Globe }> = {
  PUBLIC: { label: 'Public', icon: Globe },
  UNLISTED: { label: 'Unlisted', icon: Link2 },
  PRIVATE: { label: 'Private', icon: Lock },
};

// ─── Component ────────────────────────────────────────────────────

export function DashboardClient({ data }: DashboardClientProps) {
  const { portfolioProfile, resumes, activeProfileId, primaryProfileId } = data;
  const [copied, setCopied] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [portfolioVisibility, setPortfolioVisibility] = useState(
    portfolioProfile.portfolioVisibility
  );

  const portfolioUrl = getPortfolioUrl(portfolioProfile.handle);
  const displayUrl = portfolioUrl.replace(/^https?:\/\//, '');
  const ownerName = [portfolioProfile.firstName, portfolioProfile.lastName]
    .filter(Boolean)
    .join(' ');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(portfolioUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [portfolioUrl]);

  return (
    <div className="space-y-12">
      {/* ═══════════════════════════════════════════════════════════
          Page header
          ═══════════════════════════════════════════════════════════ */}
      <header className="space-y-1.5">
        <p className="text-eyebrow">Workspace</p>
        <h1 className="text-display text-2xl text-foreground sm:text-3xl">
          {ownerName ? `Welcome back, ${portfolioProfile.firstName}` : 'Dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your live portfolio and tailored resumes, all in one place.
        </p>
      </header>

      {/* ═══════════════════════════════════════════════════════════
          Portfolio
          ═══════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionHeader title="Portfolio">
          <VisibilityBadge visibility={portfolioVisibility} />
        </SectionHeader>

        <div className="surface-raised overflow-hidden">
          <PortfolioThumbnail handle={portfolioProfile.handle} />

          {/* Action bar */}
          <div className="space-y-3 border-t border-border/60 p-4">
            {/* URL row */}
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <Globe className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate font-medium text-foreground">{displayUrl}</span>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => void handleCopy()}
                      aria-label={copied ? 'Copied' : 'Copy link'}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {copied ? 'Copied!' : 'Copy link'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Primary actions */}
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-1.5" asChild>
                <Link href="/dashboard/portfolio/edit">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
              </Button>
              <Button size="sm" className="gap-1.5" asChild>
                <Link href={`/u/${portfolioProfile.handle}`} target="_blank">
                  <ExternalLink className="h-3.5 w-3.5" />
                  View
                </Link>
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setShareDialogOpen(true)}>
                <Share2 className="h-3.5 w-3.5" />
                Share
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="ml-auto h-8 w-8 shrink-0"
                    aria-label="More portfolio actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/portfolio/edit" className="gap-2">
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/u/${portfolioProfile.handle}`} target="_blank" className="gap-2">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      View
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    onSelect={(event) => {
                      event.preventDefault();
                      setShareDialogOpen(true);
                    }}
                  >
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleCopy();
                    }}
                  >
                    <Copy className="h-4 w-4 text-muted-foreground" />
                    Copy link
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </section>

      <ShareDialog
        variant="portfolio"
        profile={{
          handle: portfolioProfile.handle,
          firstName: portfolioProfile.firstName,
          portfolioVisibility: portfolioVisibility as 'PUBLIC' | 'UNLISTED' | 'PRIVATE',
        }}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        onVisibilityChange={setPortfolioVisibility}
        hideTrigger
      />

      {/* ═══════════════════════════════════════════════════════════
          Resumes
          ═══════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionHeader title="Resumes" count={resumes.length}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" asChild>
            <Link href="/resumes">
              Manage all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </SectionHeader>

        <DashboardResumesSection
          initialResumes={resumes}
          initialActiveProfileId={activeProfileId}
          initialPrimaryProfileId={primaryProfileId}
        />
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

/** Section heading with optional count and right-side controls. */
function SectionHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <h2 className="text-section-title">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums leading-none text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children && <div className="flex items-center gap-1">{children}</div>}
    </div>
  );
}

/** Tiny pill showing visibility state. */
function VisibilityBadge({ visibility }: { visibility: string }) {
  const config = VISIBILITY_CONFIG[visibility] ?? VISIBILITY_CONFIG.PRIVATE;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className="gap-1.5 border-border/60 font-normal text-muted-foreground">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
