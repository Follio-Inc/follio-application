'use client';

import { ArrowRight, Check, Copy, ExternalLink, Globe, Link2, Lock, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const [copied, setCopied] = useState<string | null>(null);

  const portfolioUrl = getPortfolioUrl(portfolioProfile.handle);

  const handleCopy = useCallback(async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API not available
    }
  }, []);

  return (
    <div className="space-y-16">
      {/* ═══════════════════════════════════════════════════════════
          SECTION 1 — Portfolio
          ═══════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader title="Portfolio">
          <VisibilityBadge visibility={portfolioProfile.portfolioVisibility} />
        </SectionHeader>

        <div className="group/portfolio relative mt-4 overflow-hidden rounded-2xl border bg-muted/10 transition-all hover:border-foreground/15 hover:shadow-sm">
          <PortfolioThumbnail handle={portfolioProfile.handle} />
          {/* Soft bottom fade */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/80 to-transparent" />

          {/* Overlay action bar — always visible, highlighted on hover */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-4 pt-10 transition-all duration-200 group-hover/portfolio:from-background group-hover/portfolio:via-background/95">
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 rounded-lg px-3 text-xs shadow-sm"
              onClick={() => {
                if (navigator.share) {
                  void navigator.share({ title: 'My Portfolio', url: portfolioUrl });
                } else {
                  void handleCopy(portfolioUrl, 'portfolio-share');
                }
              }}
            >
              {copied === 'portfolio-share' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Shared</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 rounded-lg px-3 text-xs shadow-sm"
              onClick={() => void handleCopy(portfolioUrl, 'portfolio')}
            >
              {copied === 'portfolio' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Link
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 rounded-lg px-3 text-xs shadow-sm"
              asChild
            >
              <Link href={`/u/${portfolioProfile.handle}`} target="_blank">
                <ExternalLink className="h-3.5 w-3.5" />
                View
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 2 — Resumes
          ═══════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader title="Resumes" count={resumes.length}>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" asChild>
            <Link href="/resumes">
              Manage
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </SectionHeader>

        <div className="mt-5">
          <DashboardResumesSection
            initialResumes={resumes}
            initialActiveProfileId={activeProfileId}
            initialPrimaryProfileId={primaryProfileId}
          />
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

/** Section heading with optional right-side controls. */
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
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-foreground/60">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium tabular-nums leading-none text-muted-foreground">
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
    <Badge
      variant="outline"
      className="h-6 gap-1 border-transparent bg-muted/50 px-1.5 text-[10px] font-normal text-muted-foreground"
    >
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
}
