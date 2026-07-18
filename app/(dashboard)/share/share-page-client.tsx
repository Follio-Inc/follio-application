'use client';

import { useState } from 'react';

import { ShareSection } from '@/app/(dashboard)/builder/sections/share-section';
import { isPortfolioEnabled } from '@/lib/features';
import type { FullProfile } from '@/types';

interface SharePageClientProps {
  profile: FullProfile;
}

export function SharePageClient({ profile }: SharePageClientProps) {
  const [currentProfile, setCurrentProfile] = useState(profile);

  const handleProfileUpdate = (updates: Partial<FullProfile>) => {
    setCurrentProfile((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Share & Publish</h1>
          <p className="text-muted-foreground">
            {isPortfolioEnabled()
              ? 'Control visibility and share your resume & portfolio'
              : 'Control visibility and share your resume'}
          </p>
        </div>
        <ShareSection profile={currentProfile} onUpdateAction={handleProfileUpdate} />
      </div>
    </div>
  );
}
