import { MapPin } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { FollioIdentity } from '@/lib/follio-identity';

import { FollioBrandPeek } from './follio-brand-peek';
import { FollioRolePeek } from './follio-detail-peek';

interface FollioHeroProps {
  identity: FollioIdentity;
  /** Renders company links as plain text. */
  interactive?: boolean;
}

/**
 * The ten-second answer to "who is this?" — the only part of the page a person
 * is guaranteed to read after scanning a QR code.
 */
export function FollioHero({ identity, interactive = true }: FollioHeroProps) {
  const { currentRole, contact } = identity;
  const currentExperience =
    identity.experience.find((item) => item.isCurrent) ?? identity.experience[0] ?? null;

  return (
    <header>
      <Avatar className="h-20 w-20 ring-1 ring-border/60 sm:h-24 sm:w-24">
        {identity.avatarUrl ? (
          <AvatarImage src={identity.avatarUrl} alt={identity.fullName} />
        ) : null}
        <AvatarFallback className="bg-muted text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {identity.initials}
        </AvatarFallback>
      </Avatar>

      {/* The handle is the address people keep — worth showing even when the
          browser URL bar is hidden, as it is on a shared screenshot. */}
      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        @{identity.handle}
      </p>

      <h1 className="text-display mt-2 text-[2rem] text-foreground sm:text-[2.5rem]">
        {identity.fullName}
      </h1>

      {identity.headline ? (
        <p className="mt-3 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          {identity.headline}
        </p>
      ) : null}

      {currentRole || contact.location ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground">
          {currentRole ? (
            <span>
              {currentExperience ? (
                <FollioRolePeek
                  item={currentExperience}
                  disabled={!interactive}
                  className="decoration-border/70 underline-offset-4 hover:underline"
                >
                  {currentRole.role}
                </FollioRolePeek>
              ) : (
                currentRole.role
              )}
              <span className="text-muted-foreground"> at </span>
              <FollioBrandPeek
                name={currentRole.company}
                url={currentRole.companyUrl}
                kind="company"
                disabled={!interactive}
                className="underline decoration-border decoration-1 underline-offset-4 transition-colors hover:decoration-foreground"
              >
                {currentRole.company}
              </FollioBrandPeek>
            </span>
          ) : null}
          {contact.location ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {contact.location}
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
