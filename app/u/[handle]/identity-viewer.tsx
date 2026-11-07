'use client';

import { FollioPage } from '@/components/follio/follio-page';
import { PublicProfileChrome } from '@/components/public-profile-chrome';
import { ResumePresentationNav } from '@/components/resume-presentation/resume-presentation-nav';
import type { FollioIdentity, FollioVisibility } from '@/lib/follio-identity';
import type { PublicProfileAuthState } from '@/lib/public-profile-chrome';

interface IdentityViewerProps {
  identity: FollioIdentity;
  qrSvg: string | null;
  authState: PublicProfileAuthState;
  profileHandle: string;
  /** Owner-only banner: Public has none, Unlisted and Private explain access. */
  visibility?: FollioVisibility;
  /** Dashboard thumbnail: the live Follio as a visitor would see it. */
  embed?: boolean;
  /** `token` / `key` query so unlisted access survives the view switch. */
  accessQuery?: string;
}

export function IdentityViewer({
  identity,
  qrSvg,
  authState,
  profileHandle,
  visibility = 'PRIVATE',
  embed = false,
  accessQuery = '',
}: IdentityViewerProps) {
  const page = (
    <>
      {embed ? null : (
        <div className="flex justify-center px-5 pt-6 sm:pt-8">
          <ResumePresentationNav
            handle={profileHandle}
            current="follio"
            accessQuery={accessQuery}
          />
        </div>
      )}
      <FollioPage identity={identity} qrSvg={qrSvg} />
    </>
  );

  if (embed) {
    return (
      <PublicProfileChrome authState="anonymous" profileHandle={profileHandle}>
        {/* Snapshot only — the dashboard thumbnail must not scroll this document. */}
        <style>{`html, body { overflow: hidden !important; height: auto !important; }`}</style>
        <main>{page}</main>
      </PublicProfileChrome>
    );
  }

  const ownerBanner =
    authState !== 'owner'
      ? null
      : visibility === 'PRIVATE'
        ? 'This Follio view is private. Set the resume to Public or Unlisted to share it.'
        : visibility === 'UNLISTED'
          ? 'This Follio view is unlisted. Only people with the link can open it.'
          : null;

  return (
    <PublicProfileChrome authState={authState} profileHandle={profileHandle}>
      <main>
        {ownerBanner ? (
          <p className="border-b border-border/60 bg-muted/40 px-5 py-3 text-center text-sm text-muted-foreground">
            {ownerBanner}
          </p>
        ) : null}
        {page}
      </main>
    </PublicProfileChrome>
  );
}
