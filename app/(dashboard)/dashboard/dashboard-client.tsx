'use client';

import { Check, Copy, ExternalLink, Globe, Link2, Lock, Pencil, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { ShareDialog } from '@/components/share-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isPortfolioEnabled } from '@/lib/features';
import { getPortfolioUrl } from '@/lib/url';
import { cn } from '@/lib/utils';

import {
  DashboardCoverLettersSection,
  type DashboardCoverLetterItem,
} from './dashboard-cover-letters-section';
import { DashboardResumesSection, type DashboardResumeItem } from './dashboard-resumes-section';
import { DashboardSectionHeader } from './dashboard-section-header';
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
  coverLetters: DashboardCoverLetterItem[];
  activeProfileId: string | null;
  primaryProfileId: string | null;
  activeCoverLetterId: string | null;
  /** Open documents tab to cover letters when set */
  initialDocumentsTab?: 'resumes' | 'cover-letters';
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

const documentsTabTriggerClass = cn(
  'relative h-auto rounded-none border-0 bg-transparent px-0 pb-3 pt-0 shadow-none',
  'text-sm font-medium text-muted-foreground',
  'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform',
  'data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none',
  'data-[state=active]:after:scale-x-100',
  'focus-visible:ring-0 focus-visible:ring-offset-0'
);

// ─── Component ────────────────────────────────────────────────────

export function DashboardClient({ data }: DashboardClientProps) {
  const {
    portfolioProfile,
    resumes,
    coverLetters,
    activeProfileId,
    primaryProfileId,
    activeCoverLetterId,
    initialDocumentsTab = 'resumes',
  } = data;
  const portfolioEnabled = isPortfolioEnabled();
  const [copied, setCopied] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [portfolioVisibility, setPortfolioVisibility] = useState(
    portfolioProfile.portfolioVisibility
  );
  const [documentsTab, setDocumentsTab] = useState(initialDocumentsTab);

  const portfolioUrl = getPortfolioUrl(portfolioProfile.handle);
  const displayUrl = portfolioUrl.replace(/^https?:\/\//, '');

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
    <div className="space-y-8 sm:space-y-10">
      <h1 className="sr-only">Dashboard</h1>

      {/* ── Portfolio (public site) ─────────────────────────────── */}
      {portfolioEnabled && (
        <section className="space-y-3">
          <DashboardSectionHeader title="Portfolio">
            <VisibilityBadge visibility={portfolioVisibility} />
          </DashboardSectionHeader>

          <div className="surface-raised overflow-hidden">
            <PortfolioThumbnail handle={portfolioProfile.handle} />

            {/* Compact meta + actions on one row */}
            <div className="flex flex-col gap-3 border-t border-border/60 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-3">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate font-medium text-foreground">{displayUrl}</span>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        onClick={() => void handleCopy()}
                        aria-label={copied ? 'Copied' : 'Copy link'}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {copied ? 'Copied!' : 'Copy link'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" className="gap-1.5" asChild>
                  <Link href="/dashboard/portfolio/edit">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <Link href={`/u/${portfolioProfile.handle}`} target="_blank">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setShareDialogOpen(true)}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {portfolioEnabled && (
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
      )}

      {portfolioEnabled && <div className="hairline border-t" aria-hidden />}

      {/* ── Documents: resumes + cover letters ─────────────────── */}
      <section className="space-y-4">
        <Tabs
          value={documentsTab}
          onValueChange={(v) => setDocumentsTab(v as typeof documentsTab)}
          className="space-y-4"
        >
          <div className="border-b border-border/60">
            <TabsList className="h-auto w-full justify-start gap-6 rounded-none bg-transparent p-0">
              <TabsTrigger value="resumes" className={documentsTabTriggerClass}>
                <span className="inline-flex items-center gap-2">
                  Resumes
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums leading-none text-muted-foreground">
                    {resumes.length}
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="cover-letters" className={documentsTabTriggerClass}>
                <span className="inline-flex items-center gap-2">
                  Cover letters
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums leading-none text-muted-foreground">
                    {coverLetters.length}
                  </span>
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="resumes" className="mt-0 focus-visible:outline-none">
            <DashboardResumesSection
              initialResumes={resumes}
              initialActiveProfileId={activeProfileId}
              initialPrimaryProfileId={primaryProfileId}
              embedded
            />
          </TabsContent>

          <TabsContent value="cover-letters" className="mt-0 focus-visible:outline-none">
            <DashboardCoverLettersSection
              initialCoverLetters={coverLetters}
              initialActiveCoverLetterId={activeCoverLetterId}
              embedded
            />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

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
