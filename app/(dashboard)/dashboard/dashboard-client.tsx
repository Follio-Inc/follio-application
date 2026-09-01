'use client';

import { Check, Copy, ExternalLink, QrCode } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { FollioShareDialog } from '@/components/follio/follio-share-dialog';
import { Button } from '@/components/ui/button';
import type { FollioIdentity } from '@/lib/follio-identity';
import { copyTextToClipboard } from '@/lib/share';

import { DashboardResumesSection, type DashboardResumeItem } from './dashboard-resumes-section';
import { FollioAttachRail } from './follio-attach-rail';
import { FollioThumbnail } from './follio-thumbnail';

export interface DashboardFollio {
  id: string;
  handle: string;
  status: string;
  displayHost: string;
  url: string;
  identity: FollioIdentity | null;
  qrSvg: string | null;
}

export interface DashboardData {
  follio: DashboardFollio;
  resumes: DashboardResumeItem[];
  activeProfileId: string | null;
  primaryProfileId: string | null;
}

interface DashboardClientProps {
  data: DashboardData;
}

export function DashboardClient({ data }: DashboardClientProps) {
  const { follio, resumes, activeProfileId, primaryProfileId } = data;
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [snapEl, setSnapEl] = useState<HTMLDivElement | null>(null);
  const [attachedResumeEl, setAttachedResumeEl] = useState<HTMLDivElement | null>(null);

  const isPublic = follio.status === 'PUBLIC';
  const displayName = follio.identity?.fullName?.trim() || 'Your Follio';
  const headline = follio.identity?.headline?.trim() || null;
  const canShare = Boolean(follio.identity && follio.qrSvg);

  const handleCopy = useCallback(async () => {
    const ok = await copyTextToClipboard(follio.url);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [follio.url]);

  return (
    <div className="space-y-12">
      <h1 className="sr-only">Your Follio</h1>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-section-title">Your Follio</h2>
          <p className="text-[13px] text-muted-foreground">{isPublic ? 'Public' : 'Private'}</p>
        </div>

        <div className="flex items-stretch">
          {resumes.length > 0 ? (
            <FollioAttachRail from={snapEl} to={attachedResumeEl} />
          ) : (
            <div className="w-6 shrink-0" aria-hidden />
          )}

          <div className="min-w-0 flex-1 space-y-12">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
              <div ref={setSnapEl} className="w-full max-w-[390px] shrink-0">
                <FollioThumbnail handle={follio.handle} href={follio.url} />
              </div>

              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                  {displayName}
                </h3>
                {headline ? (
                  <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{headline}</p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="mt-4 flex min-w-0 items-center gap-2 text-left text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={copied ? 'Link copied' : 'Copy link'}
                >
                  <span className="min-w-0 truncate font-mono text-[12px] tracking-tight">
                    {follio.displayHost}
                  </span>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {canShare ? (
                    <Button size="sm" className="gap-1.5" onClick={() => setShareOpen(true)}>
                      <QrCode className="h-3.5 w-3.5" />
                      Share
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <Link href={follio.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <DashboardResumesSection
              initialResumes={resumes}
              initialActiveProfileId={activeProfileId}
              initialPrimaryProfileId={primaryProfileId}
              attachedResumeRef={setAttachedResumeEl}
            />
          </div>
        </div>
      </section>

      {follio.identity ? (
        <FollioShareDialog
          identity={follio.identity}
          qrSvg={follio.qrSvg}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      ) : null}
    </div>
  );
}
