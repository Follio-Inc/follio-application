'use client';

import { ArrowUpRight, Download, LayoutGrid, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatDocumentDownloadFilename } from '@/lib/document-download/filename';
import { splitFollioLinks, type FollioIdentity, type FollioLink } from '@/lib/follio-identity';
import { useDocumentDownload } from '@/lib/hooks/use-document-download';
import { cn } from '@/lib/utils';

import { FOLLIO_CHIP, FOLLIO_CHIP_ICON_ACTION, FOLLIO_CHIP_INTERACTIVE } from './chip';
import { LinkIcon } from './link-icon';

interface FollioDoorsProps {
  identity: FollioIdentity;
  interactive?: boolean;
}

/**
 * One Resume chip (open + download) beside GitHub and LinkedIn. Every item is
 * the same size so the row reads as a single set of ways to go deeper.
 */
export function FollioDoors({ identity, interactive = true }: FollioDoorsProps) {
  const { doors } = identity;
  const { github, linkedin } = splitFollioLinks(identity.links);

  if (!doors.resume && !doors.work && !github && !linkedin) return null;

  return (
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="More from this Follio">
      {doors.resume ? <ResumeChip identity={identity} interactive={interactive} /> : null}
      {github ? <SocialChip link={github} interactive={interactive} /> : null}
      {linkedin ? <SocialChip link={linkedin} interactive={interactive} /> : null}
      {doors.work ? (
        <DoorChip href={identity.workHref} label="Work" interactive={interactive} />
      ) : null}
    </nav>
  );
}

interface ResumeChipProps {
  identity: FollioIdentity;
  interactive: boolean;
}

function ResumeChip({ identity, interactive }: ResumeChipProps) {
  const [failed, setFailed] = useState(false);
  const { download, isDownloading } = useDocumentDownload({
    pdfPath: `/api/export/${identity.handle}/pdf`,
    filename: formatDocumentDownloadFilename(identity.fullName, 'Resume'),
    layout: 'letter',
    forwardSearchParams: true,
    onSuccess: () => setFailed(false),
    onError: () => setFailed(true),
  });

  const className = cn(FOLLIO_CHIP, 'min-w-0');

  return (
    <div className={className} role="group" aria-label="Resume">
      <span className="min-w-0 flex-1 truncate text-left">Resume</span>
      {interactive ? (
        <>
          <Link
            href={identity.resumeHref}
            className={FOLLIO_CHIP_ICON_ACTION}
            aria-label="Open resume"
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
          <button
            type="button"
            className={cn(FOLLIO_CHIP_ICON_ACTION, 'disabled:opacity-60')}
            onClick={() => void download()}
            disabled={isDownloading}
            aria-label={
              isDownloading
                ? 'Downloading resume'
                : failed
                  ? 'Download failed, try again'
                  : 'Download resume'
            }
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
          </button>
        </>
      ) : (
        <>
          <span className={FOLLIO_CHIP_ICON_ACTION} aria-hidden>
            <ArrowUpRight className="h-4 w-4" />
          </span>
          <span className={FOLLIO_CHIP_ICON_ACTION} aria-hidden>
            <Download className="h-4 w-4" />
          </span>
        </>
      )}
    </div>
  );
}

interface SocialChipProps {
  link: FollioLink;
  interactive: boolean;
}

const SOCIAL_LABEL: Partial<Record<FollioLink['kind'], string>> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
};

function SocialChip({ link, interactive }: SocialChipProps) {
  const className = cn(FOLLIO_CHIP, 'min-w-0', interactive && FOLLIO_CHIP_INTERACTIVE);
  const name = SOCIAL_LABEL[link.kind] ?? link.label;
  const label = link.detail ? `${name} — ${link.detail}` : name;

  const body = (
    <>
      <LinkIcon kind={link.kind} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{name}</span>
    </>
  );

  if (!interactive) {
    return <span className={className}>{body}</span>;
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={className}
    >
      {body}
    </a>
  );
}

interface DoorChipProps {
  href: string;
  label: string;
  interactive: boolean;
}

function DoorChip({ href, label, interactive }: DoorChipProps) {
  const className = cn(FOLLIO_CHIP, 'min-w-0', interactive && FOLLIO_CHIP_INTERACTIVE);

  const body = (
    <>
      <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </>
  );

  if (!interactive) {
    return <span className={className}>{body}</span>;
  }

  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
