'use client';

import { useState } from 'react';

import { ContactInfoForm } from '@/app/(dashboard)/builder/sections/basic-info-form';
import { SettingsSection } from '@/app/(dashboard)/builder/sections/settings-section';
import type { FullProfile } from '@/types';

interface SettingsPageClientProps {
  profile: FullProfile;
}

export function SettingsPageClient({ profile }: SettingsPageClientProps) {
  const [currentProfile, setCurrentProfile] = useState(profile);

  const handleProfileUpdate = (updates: Partial<FullProfile>) => {
    setCurrentProfile((prev) => ({ ...prev, ...updates }));
  };

  const handleContactUpdate = (updates: Record<string, unknown>) => {
    setCurrentProfile((prev) => ({
      ...prev,
      contactInfo: prev.contactInfo
        ? { ...prev.contactInfo, ...updates }
        : (updates as FullProfile['contactInfo']),
    }));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Account preferences & configuration</p>
        </div>
        <ContactInfoForm profile={currentProfile} onContactUpdate={handleContactUpdate} />
        <SettingsSection profile={currentProfile} onUpdate={handleProfileUpdate} />
      </div>
    </div>
  );
}
