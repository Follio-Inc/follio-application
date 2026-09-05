import type { PdfLayout } from '@/lib/document-design';
import { db } from '@/lib/db';
import { hashDocumentPdfSource } from '@/lib/document-pdf/source-hash';
import { logger } from '@/lib/logger';

const cacheLogger = logger.child({ source: 'document-pdf-cache' });

export type DocumentPdfKind = 'resume' | 'cover_letter';

export interface DocumentPdfCacheKey {
  kind: DocumentPdfKind;
  subjectId: string;
  layout: PdfLayout;
}

export async function readCachedDocumentPdf(
  key: DocumentPdfCacheKey,
  html: string
): Promise<Buffer | null> {
  const sourceHash = hashDocumentPdfSource(html, key.layout);
  try {
    const row = await db.documentPdfCache.findUnique({
      where: {
        kind_subjectId_layout: {
          kind: key.kind,
          subjectId: key.subjectId,
          layout: key.layout,
        },
      },
    });
    if (!row || row.sourceHash !== sourceHash) return null;
    return Buffer.from(row.pdf);
  } catch (error) {
    cacheLogger.warn('PDF cache read failed', { error, kind: key.kind, subjectId: key.subjectId });
    return null;
  }
}

export async function writeCachedDocumentPdf(
  key: DocumentPdfCacheKey,
  html: string,
  pdf: Buffer
): Promise<void> {
  const sourceHash = hashDocumentPdfSource(html, key.layout);
  try {
    await db.documentPdfCache.upsert({
      where: {
        kind_subjectId_layout: {
          kind: key.kind,
          subjectId: key.subjectId,
          layout: key.layout,
        },
      },
      create: {
        kind: key.kind,
        subjectId: key.subjectId,
        layout: key.layout,
        sourceHash,
        pdf,
      },
      update: {
        sourceHash,
        pdf,
      },
    });
  } catch (error) {
    cacheLogger.warn('PDF cache write failed', { error, kind: key.kind, subjectId: key.subjectId });
  }
}
