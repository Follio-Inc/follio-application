/**
 * A resume is one document with two presentations:
 * the traditional paper resume, and a Follio view of the same content.
 */
export type ResumePresentation = 'resume' | 'follio';

export function resumePresentationPath(handle: string, presentation: ResumePresentation): string {
  return presentation === 'follio' ? `/u/${handle}` : `/u/${handle}/resume`;
}

/** Preserve unlisted access when switching presentations. */
export function resumeAccessQuery(params: { token?: string; key?: string }): string {
  const search = new URLSearchParams();
  if (params.token) search.set('token', params.token);
  if (params.key) search.set('key', params.key);
  return search.toString();
}

export function resumePresentationHref(
  handle: string,
  presentation: ResumePresentation,
  accessQuery = ''
): string {
  const path = resumePresentationPath(handle, presentation);
  return accessQuery ? `${path}?${accessQuery}` : path;
}

/** The highlighter opens this reading, not the Follio. */
export function resumeHighlightsPath(handle: string): string {
  return `/u/${handle}/highlights`;
}

export function resumeHighlightsHref(handle: string, accessQuery = ''): string {
  const path = resumeHighlightsPath(handle);
  return accessQuery ? `${path}?${accessQuery}` : path;
}
