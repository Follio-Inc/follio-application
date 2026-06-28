/**
 * Shared helpers for portfolio media URLs (avatar, project images).
 */

/** True when the URL points at a user-uploaded photo stored by Follio. */
export function isUploadedPhotoUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return url.split('?')[0].startsWith('/api/photos/');
}
