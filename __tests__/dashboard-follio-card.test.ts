import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('dashboard Follio card', () => {
  it('does not offer an edit action on the Follio itself', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'app/(dashboard)/dashboard/dashboard-client.tsx'),
      'utf8'
    );

    expect(src).not.toContain('Pencil');
    expect(src).not.toContain('href="/builder"');
    expect(src).toContain('QrCode');
    expect(src).toContain('FollioShareDialog');
  });

  it('keeps resume editing on the resume list', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'app/(dashboard)/dashboard/dashboard-resumes-section.tsx'),
      'utf8'
    );

    expect(src).toContain('handleOpenInBuilder');
    expect(src).toContain('Edit');
  });
});
