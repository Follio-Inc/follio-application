'use client';

import { AppearanceModeSwitch } from '@/components/appearance-mode-switch';
import type { ResumeColorTheme } from '@/types';

interface ResumeColorThemeSwitchProps {
  value: ResumeColorTheme;
  onChange: (value: ResumeColorTheme) => void;
  className?: string;
  /** Compact icon-only control for tight headers (e.g. preview panel). */
  variant?: 'default' | 'compact';
}

export function ResumeColorThemeSwitch({
  value,
  onChange,
  className,
  variant = 'default',
}: ResumeColorThemeSwitchProps) {
  return (
    <AppearanceModeSwitch
      value={value}
      onChange={onChange}
      className={className}
      variant={variant}
      ariaLabel="Resume theme"
    />
  );
}
