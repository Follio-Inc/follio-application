'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
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
        <div className="space-y-3">
          <Label className="sr-only">Select theme</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = theme === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all hover:border-primary/50 ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-muted'
                  }`}
                >
                  {isSelected && (
                    <Badge className="absolute -right-2 -top-2 h-5 w-5 rounded-full p-0">
                      <span className="sr-only">Selected</span>
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </Badge>
                  )}
                  <Icon
                    className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <div className="text-center">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
