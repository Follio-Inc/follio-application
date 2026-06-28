'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

// ============================================================================
// Types
// ============================================================================

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeOption {
  value: ThemeMode;
  label: string;
  description: string;
  icon: typeof Sun;
}

// ============================================================================
// Constants
// ============================================================================

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Clean and bright',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Easy on the eyes',
    icon: Moon,
  },
  {
    value: 'system',
    label: 'System',
    description: 'Match your device',
    icon: Monitor,
  },
];

// ============================================================================
// Component
// ============================================================================

export function AppearanceSection() {
  const { theme: currentTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = (mounted ? currentTheme : 'system') as ThemeMode;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Choose how Follio looks for you</CardDescription>
      </CardHeader>
      <CardContent>
        <Label className="sr-only">Select theme</Label>
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = theme === option.value;

            return (
              <button
                key={option.value}
                role="radio"
                aria-checked={isSelected}
                onClick={() => setTheme(option.value)}
                className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors duration-150 ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 hover:border-border hover:bg-muted/40'
                }`}
              >
                <Icon
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    isSelected ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
