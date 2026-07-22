import { describe, expect, it } from 'vitest';

import {
  ONBOARDING_CONSTELLATION_STAGE,
  ONBOARDING_DROPZONE_ACTIVE,
  ONBOARDING_FOOTER,
  ONBOARDING_ICON_WELL,
  ONBOARDING_PAGE_SHELL,
  ONBOARDING_PAGE_TITLE,
  ONBOARDING_SURFACE,
  ONBOARDING_SURFACE_INTERACTIVE,
} from '@/lib/onboarding-ui';

describe('onboarding UI tokens', () => {
  it('exports a coherent surface language for choice and panel cards', () => {
    expect(ONBOARDING_SURFACE).toContain('rounded-2xl');
    expect(ONBOARDING_SURFACE).toContain('border-border/50');
    expect(ONBOARDING_SURFACE).toContain('bg-card/80');
    expect(ONBOARDING_SURFACE_INTERACTIVE).toContain('hover:-translate-y-0.5');
    expect(ONBOARDING_ICON_WELL).toContain('h-11 w-11');
    expect(ONBOARDING_ICON_WELL).toContain('bg-muted/40');
    expect(ONBOARDING_PAGE_SHELL).toContain('max-w-2xl');
    expect(ONBOARDING_PAGE_SHELL).toContain('flex-1');
    expect(ONBOARDING_PAGE_SHELL).toContain('flex-col');
    expect(ONBOARDING_PAGE_SHELL).toContain('min-h-0');
    expect(ONBOARDING_PAGE_TITLE).toContain('text-xl');
    expect(ONBOARDING_PAGE_TITLE).toContain('sm:text-2xl');
    expect(ONBOARDING_FOOTER).toContain('border-border/50');
    expect(ONBOARDING_FOOTER).toContain('mt-auto');
    expect(ONBOARDING_FOOTER).toContain('shrink-0');
    // Primary reserved for CTAs / progress — not dropzone chrome
    expect(ONBOARDING_DROPZONE_ACTIVE).not.toContain('primary');
    expect(ONBOARDING_CONSTELLATION_STAGE).toContain('rounded-2xl');
    expect(ONBOARDING_CONSTELLATION_STAGE).toContain('border-border/50');
    expect(ONBOARDING_CONSTELLATION_STAGE).toContain('bg-muted/30');
  });
});
