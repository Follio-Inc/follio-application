import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('onboarding hard gate', () => {
  it('exposes hasOnboardedProfile as the shared completion check', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/active-profile.ts'), 'utf8');

    expect(src).toContain('export async function hasOnboardedProfile');
    expect(src).toContain('resolveActiveProfileContextOrNull');
  });

  it('gates the dashboard shell with a full-document redirect (not server redirect)', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/(dashboard)/layout.tsx'), 'utf8');

    expect(src).toContain('hasOnboardedProfile');
    expect(src).toContain('ClientRedirect');
    expect(src).toContain('href="/onboarding"');
    expect(src).not.toContain("redirect('/onboarding')");
    expect(src).toContain("export const dynamic = 'force-dynamic'");
  });

  it('requires a Profile on /resumes, not only a User row', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/(dashboard)/resumes/page.tsx'), 'utf8');

    expect(src).toContain('resolveActiveProfileContextOrNull');
    expect(src).toContain("redirect('/onboarding')");
  });

  it('routes authenticated users from / via ClientRedirect', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/page.tsx'), 'utf8');

    expect(src).toContain('hasOnboardedProfile');
    expect(src).toContain('ClientRedirect');
    expect(src).toContain('href="/onboarding"');
    expect(src).toContain('href="/dashboard"');
  });

  it('uses a hard navigation ClientRedirect helper', () => {
    const src = readFileSync(resolve(process.cwd(), 'components/client-redirect.tsx'), 'utf8');

    expect(src).toContain('window.location.replace');
    expect(src).toContain('Loading');
  });

  it('hides workspace menu links until a Profile exists', () => {
    const src = readFileSync(resolve(process.cwd(), 'components/auth/user-menu.tsx'), 'utf8');

    expect(src).toContain('hasWorkspaceAccess');
    expect(src).toContain('setHasWorkspaceAccess(Boolean(data.profile))');
    expect(src).toContain('{hasWorkspaceAccess ? (');
  });
});
