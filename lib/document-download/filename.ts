/**
 * Shared download filename sanitization for paper documents.
 */

export function formatDocumentDownloadFilename(
  title: string | null | undefined,
  fallback: string
): string {
  const sanitized = (title ?? '')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return sanitized || fallback;
}
