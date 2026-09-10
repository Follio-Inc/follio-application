'use client';

import { FollioPage } from '@/components/follio/follio-page';
import { PublicProfileChrome } from '@/components/public-profile-chrome';
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
}

export function IdentityViewer({
  identity,
  qrSvg,
  authState,
  profileHandle,
  visibility = 'PRIVATE',
  embed = false,
}: IdentityViewerProps) {
  const page = <FollioPage identity={identity} qrSvg={qrSvg} />;

  if (embed) {
    return (
      <PublicProfileChrome authState="anonymous" profileHandle={profileHandle}>
        <main>{page}</main>
      </PublicProfileChrome>
    );
  }

  const ownerBanner =
    authState !== 'owner'
      ? null
      : visibility === 'PRIVATE'
        ? 'This Follio is private. Set it to Public or Unlisted to share. Your attached resume uses the same visibility.'
        : visibility === 'UNLISTED'
          ? 'This Follio is unlisted. Only people with the link can open it. Your attached resume uses the same visibility.'
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
