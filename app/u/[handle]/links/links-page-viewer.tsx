'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { ProfileNavbar } from '@/components/profile-navbar';
import { PortfolioLinkBanner } from '../portfolio-link-banner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

import type { PublicProfile } from '@/types';

interface LinksPageViewerProps {
  profile: PublicProfile;
  authState: 'owner' | 'authenticated' | 'anonymous';
  profileHandle: string;
}

export function LinksPageViewer({ profile, authState, profileHandle }: LinksPageViewerProps) {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'User';

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <ProfileNavbar authState={authState} profileHandle={profileHandle} />

      {/* Portfolio cross-link banner */}
      <PortfolioLinkBanner profileHandle={profileHandle} />

      <main className="container max-w-lg py-12 pb-24">
        {/* Profile header */}
        <div className="mb-8 flex flex-col items-center text-center">
          {profile.avatarUrl ? (
            <Avatar className="mb-4 h-20 w-20">
              <AvatarImage src={profile.avatarUrl} alt={fullName} />
              <AvatarFallback className="text-xl font-bold">
                {(profile.firstName?.[0] || '?').toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-2xl font-bold text-primary">
              {(profile.firstName?.[0] || '?').toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-bold">{fullName}</h1>
          {profile.headline && (
            <p className="mt-1 text-sm text-muted-foreground">{profile.headline}</p>
          )}
        </div>

        {/* Links list */}
        {profile.links && profile.links.length > 0 ? (
          <div className="space-y-3">
            {profile.links.map((link) => (
              <Button
                key={link.id}
                variant="outline"
                asChild
                className="flex h-auto w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left transition-all hover:scale-[1.01] hover:shadow-md"
              >
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <span className="font-medium">{link.label || link.type}</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              </Button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">No links available.</p>
          </div>
        )}
      </main>

      <footer className="border-t bg-background py-6">
        <div className="container text-center text-sm text-muted-foreground">
          <p>
            Built with{' '}
            <Link href="/" className="font-medium text-primary hover:underline">
              Follio
            </Link>{' '}
            — Your professional identity, everywhere.
          </p>
        </div>
      </footer>
    </div>
  );
}
