'use client';

import { cn } from '@/lib/utils';
import { Palette, Shield, User } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type SettingsTab = 'account' | 'appearance' | 'privacy';

interface NavItem {
  id: SettingsTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

// ============================================================================
// Navigation Items
// ============================================================================

const NAV_ITEMS: NavItem[] = [
  {
    id: 'account',
    label: 'Account',
    icon: User,
    description: 'Identity, contact & session',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    description: 'Theme & display',
  },
  {
    id: 'privacy',
    label: 'Data & Privacy',
    icon: Shield,
    description: 'Export & account deletion',
  },
];

// ============================================================================
// Sidebar Navigation (Desktop)
// ============================================================================

interface SettingsNavProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

/**
 * Desktop sidebar navigation for Settings page.
 * Renders a vertical list of nav items. Hidden below `lg` breakpoint.
 */
export function SettingsDesktopNav({ activeTab, onTabChange }: SettingsNavProps) {
  return (
    <nav className="w-full" aria-label="Settings navigation">
      <div className="sticky top-6 rounded-xl border bg-card p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Mobile / tablet horizontal tab navigation for Settings page.
 * Renders a scrollable tab bar. Hidden at `lg` breakpoint and above.
 */
export function SettingsMobileNav({ activeTab, onTabChange }: SettingsNavProps) {
  return (
    <div className="mb-6">
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { NAV_ITEMS };
