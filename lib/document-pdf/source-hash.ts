import { createHash } from 'node:crypto';

import type { PdfLayout } from '@/lib/document-design';

export function hashDocumentPdfSource(html: string, layout: PdfLayout): string {
  return createHash('sha256').update(layout).update('\0').update(html).digest('hex');
}
