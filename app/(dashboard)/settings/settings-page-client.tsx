'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

import type { ContactInfo } from '@prisma/client';

import DataSourcesPageClient from '@/app/(dashboard)/builder/data-sources/data-sources-client';
import type { FullProfile } from '@/types';

import { AccountSection, type AccountContactUpdatePayload } from './_sections/account-section';
import { AiAssistantsSection } from './_sections/ai-assistants-section';
import { AppearanceSection } from './_sections/appearance-section';
import { PrivacySection } from './_sections/privacy-section';
import { SettingsDesktopNav, SettingsMobileNav, type SettingsTab } from './_sections/settings-nav';

// ============================================================================
// Types
// ============================================================================

/** Settings page needs the full profile for the Data Sources tab */
export type SettingsProfile = FullProfile;

interface SettingsPageClientProps {
  profile: SettingsProfile;
}

// ============================================================================
// Component
// ============================================================================

const VALID_TABS: SettingsTab[] = [
  'account',
  'appearance',
  'data-sources',
  'privacy',
  'ai-assistants',
];

function resolveInitialTab(param: string | null): SettingsTab {
  if (param && VALID_TABS.includes(param as SettingsTab)) {
    return param as SettingsTab;
  }
  return 'account';
}

export function SettingsPageClient({ profile }: SettingsPageClientProps) {
  const searchParams = useSearchParams();
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    resolveInitialTab(searchParams.get('tab'))
  );

  const handleProfileUpdate = useCallback((updates: Partial<FullProfile>) => {
    setCurrentProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleContactUpdate = useCallback((updates: AccountContactUpdatePayload) => {
    setCurrentProfile((prev) => ({
      ...prev,
      contactInfo: prev.contactInfo
        ? { ...prev.contactInfo, ...updates }
        : ({ ...updates } as unknown as ContactInfo),
    }));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      {/* Page header */}
      <header className="mb-10 border-b border-border/60 pb-8">
        <p className="text-eyebrow">Settings</p>
        <h1 className="text-display mt-3 text-3xl">Manage your account</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Update your profile, appearance, connected data sources, AI assistants, and privacy
          preferences.
        </p>
      </header>

      {/* Mobile tabs (shown above content on smaller screens) */}
      <div className="lg:hidden">
        <SettingsMobileNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Desktop: sidebar + content */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
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

          {activeTab === 'data-sources' && <DataSourcesPageClient profile={currentProfile} />}

          {activeTab === 'privacy' && <PrivacySection profile={currentProfile} />}

          {activeTab === 'ai-assistants' && <AiAssistantsSection />}
        </section>
      </div>
    </div>
  );
}
