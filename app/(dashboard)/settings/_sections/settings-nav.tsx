'use client';

import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type SettingsTab = 'account' | 'appearance' | 'data-sources' | 'privacy' | 'ai-assistants';

interface NavItem {
  id: SettingsTab;
  label: string;
}

// ============================================================================
// Navigation Items
// ============================================================================

const NAV_ITEMS: NavItem[] = [
  {
    id: 'account',
    label: 'Account',
  },
  {
    id: 'appearance',
    label: 'Appearance',
  },
  {
    id: 'data-sources',
    label: 'Data Sources',
  },
  {
    id: 'privacy',
    label: 'Data & Privacy',
  },
  {
    id: 'ai-assistants',
    label: 'AI assistants',
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
      <div className="sticky top-8 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors duration-150',
                isActive
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              {item.label}
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
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { NAV_ITEMS };
