'use client';

import { FollioPage } from '@/components/follio/follio-page';
import { PublicProfileChrome } from '@/components/public-profile-chrome';
import type { FollioIdentity } from '@/lib/follio-identity';
import type { PublicProfileAuthState } from '@/lib/public-profile-chrome';

interface IdentityViewerProps {
  identity: FollioIdentity;
  qrSvg: string | null;
  authState: PublicProfileAuthState;
  profileHandle: string;
  /** Owner-only: the Follio is not public yet. */
  unpublished?: boolean;
  /** Dashboard thumbnail: the live Follio as a visitor would see it. */
  embed?: boolean;
}

export function IdentityViewer({
  identity,
  qrSvg,
  authState,
  profileHandle,
  unpublished = false,
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

  return (
    <PublicProfileChrome authState={authState} profileHandle={profileHandle}>
      <main>
        {unpublished && authState === 'owner' ? (
          <p className="border-b border-border/60 bg-muted/40 px-5 py-3 text-center text-sm text-muted-foreground">
            Visitors cannot open this Follio yet. Publish it from your dashboard to share the link.
          </p>
        ) : null}
        {page}
      </main>
    </PublicProfileChrome>
  );
}
