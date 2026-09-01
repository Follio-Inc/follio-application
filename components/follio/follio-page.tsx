'use client';

import { QrCode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { splitFollioLinks, type FollioIdentity } from '@/lib/follio-identity';
import { cn } from '@/lib/utils';

import { FollioAbout } from './follio-about';
import { FollioActionBar } from './follio-action-bar';
import { FollioConnect } from './follio-connect';
import { FollioDoors } from './follio-doors';
import { FollioEducation } from './follio-education';
import { FollioExperience } from './follio-experience';
import { FollioHero } from './follio-hero';
import { FollioLinks } from './follio-links';
import { FollioShareDialog } from './follio-share-dialog';
import { FollioSkills } from './follio-skills';

interface FollioPageProps {
  identity: FollioIdentity;
  /** Server-rendered QR for the share sheet. Omit to hide sharing. */
  qrSvg?: string | null;
  /** Display-only mode: no links, no downloads. */
  interactive?: boolean;
  className?: string;
}

/**
 * A person's Follio, read in the order a stranger needs it: who they are, how
 * to reach them, where to go deeper, then a short informative summary of where
 * they have worked and studied. Everything longer lives behind the doors.
 */
export function FollioPage({
  identity,
  qrSvg = null,
  interactive = true,
  className,
}: FollioPageProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [actionBarVisible, setActionBarVisible] = useState(false);
  const connectRef = useRef<HTMLDivElement>(null);

  const canShare = interactive && Boolean(qrSvg);

  useEffect(() => {
    const target = connectRef.current;
    if (!interactive || !target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setActionBarVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [interactive]);

  const { about, experience, education, skills } = identity;
  const { github, linkedin, elsewhere } = splitFollioLinks(identity.links);
  const hasDepth =
    Boolean(about) ||
    experience.length > 0 ||
    education.length > 0 ||
    skills.length > 0 ||
    elsewhere.length > 0;
  const hasContact = Boolean(identity.contact.email || identity.contact.phone);
  const hasDoors = identity.doors.resume || identity.doors.work || Boolean(github || linkedin);

  return (
    <div className={cn('relative', className)}>
      {/* Ambient warmth behind the hero so the page opens rather than starts flat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-muted/60 to-transparent"
      />

      <div className="relative mx-auto w-full max-w-2xl px-5 pb-24 pt-10 sm:px-8 sm:pb-20 sm:pt-16">
        <FollioHero identity={identity} interactive={interactive} />

        <div ref={connectRef} className="mt-8 space-y-2">
          <FollioConnect identity={identity} interactive={interactive} />
          <FollioDoors identity={identity} interactive={interactive} />
        </div>

        {hasDepth ? (
          <div className="mt-10 space-y-9">
            {about ? <FollioAbout about={about} /> : null}
            {experience.length > 0 ? (
              <FollioExperience experience={experience} interactive={interactive} />
            ) : null}
            {education.length > 0 ? (
              <FollioEducation education={education} interactive={interactive} />
            ) : null}
            {skills.length > 0 ? <FollioSkills skills={skills} /> : null}
            <FollioLinks links={elsewhere} interactive={interactive} />
          </div>
        ) : null}

        {!hasDepth && !hasContact && !hasDoors ? (
          <p className="mt-10 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
            This Follio is still being set up.
          </p>
        ) : null}

        {canShare ? (
          <div className="mt-12 border-t border-border/60 pt-6">
            <Button
              type="button"
              variant="ghost"
              className="gap-2 text-muted-foreground"
              onClick={() => setShareOpen(true)}
            >
              <QrCode className="h-4 w-4" aria-hidden />
              Share this Follio
            </Button>
          </div>
        ) : null}
      </div>

      {interactive && (hasContact || identity.doors.resume) ? (
        <FollioActionBar
          identity={identity}
          visible={actionBarVisible}
          onShare={canShare ? () => setShareOpen(true) : undefined}
        />
      ) : null}

      {canShare ? (
        <FollioShareDialog
          identity={identity}
          qrSvg={qrSvg}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      ) : null}
    </div>
  );
}
