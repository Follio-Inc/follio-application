'use client';

import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Globe,
  LayoutTemplate,
  Link2,
  Lock,
  Pencil,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import type { TemplateOption } from '@/components/portfolio/template-option-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPortfolioUrl } from '@/lib/url';

import { DashboardResumesSection, type DashboardResumeItem } from './dashboard-resumes-section';
import { PortfolioThumbnail } from './portfolio-thumbnail';
import { TemplateGallery } from './template-gallery';

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
  /** Template currently powering the portfolio, if any. */
  currentTemplateId: string | null;
  /** Templates available to switch between. */
  templates: TemplateOption[];
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
  const {
    portfolioProfile,
    resumes,
    activeProfileId,
    primaryProfileId,
    currentTemplateId,
    templates,
  } = data;
  const [copied, setCopied] = useState<string | null>(null);

  const portfolioUrl = getPortfolioUrl(portfolioProfile.handle);
  const displayUrl = portfolioUrl.replace(/^https?:\/\//, '');
  const ownerName = [portfolioProfile.firstName, portfolioProfile.lastName]
    .filter(Boolean)
    .join(' ');

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
          <VisibilityBadge visibility={portfolioProfile.portfolioVisibility} />
        </SectionHeader>

        <div className="surface-raised overflow-hidden">
          <PortfolioThumbnail handle={portfolioProfile.handle} />

          {/* Action bar — calm, persistent, no overlay */}
          <div className="flex flex-col gap-3 border-t border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium text-foreground">{displayUrl}</span>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" asChild>
                <Link href={`/u/${portfolioProfile.handle}`} target="_blank">
                  <ExternalLink className="h-3.5 w-3.5" />
                  View live site
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="gap-1.5" asChild>
                <Link href="/dashboard/portfolio/edit">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
              </Button>
              {templates.length > 1 && (
                <TemplateGallery templates={templates} currentTemplateId={currentTemplateId}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    Template
                  </Button>
                </TemplateGallery>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
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
                    <Check className="h-3.5 w-3.5 text-success" />
                    Shared
                  </>
                ) : (
                  <>
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => void handleCopy(portfolioUrl, 'portfolio')}
              >
                {copied === 'portfolio' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-success" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy link
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

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
