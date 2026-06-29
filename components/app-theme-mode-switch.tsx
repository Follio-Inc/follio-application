'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

interface AppThemeModeSwitchProps {
  className?: string;
}

export function AppThemeModeSwitch({ className }: AppThemeModeSwitchProps) {
  const { theme: currentTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = (mounted ? currentTheme : 'system') as ThemeMode;

  return (
    <div className={cn('px-4 py-3', className)}>
      <p className="text-eyebrow mb-2">Theme</p>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1.5">
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = theme === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(option.value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center transition-colors duration-150',
                isSelected
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border/60 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="text-[11px] font-medium leading-none">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
