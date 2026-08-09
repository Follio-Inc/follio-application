import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('onboarding complete profile field updates', () => {
  it('does not retain blank summary/headline/location via || coalescing', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'app/api/onboarding/complete/route.ts'),
      'utf8'
    );

    expect(src).not.toContain('summary: mergedProfile.summary || user.profile.summary');
    expect(src).not.toContain('summary: reviewedData.profile.summary || user.profile.summary');
    expect(src).toContain('summary: mergedProfile.summary ?? user.profile.summary');
    expect(src).toContain('summary: reviewedData.profile.summary ?? user.profile.summary');
    expect(src).toContain('headline: reviewedData.profile.headline ?? user.profile.headline');
    expect(src).toContain('location: reviewedData.profile.location ?? user.profile.location');
  });
});
