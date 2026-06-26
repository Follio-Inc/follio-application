import { describe, expect, it } from 'vitest';

import { isUploadedPhotoUrl } from '@/lib/portfolio/templates/media';

describe('isUploadedPhotoUrl', () => {
  it('accepts Follio serving URLs', () => {
    expect(isUploadedPhotoUrl('/api/photos/abc123')).toBe(true);
    expect(isUploadedPhotoUrl('/api/photos/abc123?v=1700000000')).toBe(true);
  });

  it('rejects social, clerk, and empty values', () => {
    expect(isUploadedPhotoUrl(null)).toBe(false);
    expect(isUploadedPhotoUrl('')).toBe(false);
    expect(isUploadedPhotoUrl('https://img.clerk.com/avatar')).toBe(false);
    expect(isUploadedPhotoUrl('https://avatars.githubusercontent.com/u/1')).toBe(false);
  });
});
