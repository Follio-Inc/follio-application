'use client';

import { useCallback, useState } from 'react';

import type { ContactInfo, Profile } from '@prisma/client';

import { AccountSection, type AccountContactUpdatePayload } from './_sections/account-section';
import { AppearanceSection } from './_sections/appearance-section';
import { PrivacySection } from './_sections/privacy-section';
import { SettingsDesktopNav, SettingsMobileNav, type SettingsTab } from './_sections/settings-nav';

// ============================================================================
// Types
// ============================================================================

/** Settings page only needs the profile + contact info — not all relations */
export type SettingsProfile = Profile & {
  contactInfo: ContactInfo | null;
};

interface SettingsPageClientProps {
  profile: SettingsProfile;
}

// ============================================================================
// Component
// ============================================================================

export function SettingsPageClient({ profile }: SettingsPageClientProps) {
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  const handleProfileUpdate = useCallback((updates: Partial<Profile>) => {
    setCurrentProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleContactUpdate = useCallback((updates: AccountContactUpdatePayload) => {
    setCurrentProfile((prev) => ({
      ...prev,
      contactInfo: prev.contactInfo
        ? { ...prev.contactInfo, ...updates }
        : ({ ...updates } as ContactInfo),
    }));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your account, preferences, and privacy</p>
      </div>

      {/* Mobile tabs (shown above content on smaller screens) */}
      <div className="lg:hidden">
        <SettingsMobileNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Desktop: sidebar + content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <SettingsDesktopNav activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Content area */}
        <section className="min-w-0" aria-label={`${activeTab} settings`}>
          {activeTab === 'account' && (
            <AccountSection
              profile={currentProfile}
              onProfileUpdateAction={handleProfileUpdate}
              onContactUpdateAction={handleContactUpdate}
            />
          )}

          {activeTab === 'appearance' && <AppearanceSection />}

          {activeTab === 'privacy' && <PrivacySection profile={currentProfile} />}
        </section>
      </div>
    </div>
  );
}
