import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('dashboard resumes', () => {
  it('shows resumes only, with a Follio view on each', () => {
    const client = readFileSync(
      resolve(process.cwd(), 'app/(dashboard)/dashboard/dashboard-client.tsx'),
      'utf8'
    );
    const section = readFileSync(
      resolve(process.cwd(), 'app/(dashboard)/dashboard/dashboard-resumes-section.tsx'),
      'utf8'
    );

    expect(client).not.toContain('Your Follio');
    expect(client).not.toContain('FollioAttachRail');
    expect(client).toContain('DashboardResumesSection');
    expect(section).toContain('ResumeThumbnail');
    expect(section).not.toContain('ResumePresentationSwitch');
    expect(section).toContain('View Follio');
    expect(section).toContain('handleOpenInBuilder');
  });
});
