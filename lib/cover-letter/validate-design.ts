import { isValidCoverLetterTemplateId, type CoverLetterDesign } from '@/lib/cover-letter/design';
import { validateDocumentDesign } from '@/lib/document-design';

/**
 * Validate cover letter design extras on top of shared DocumentDesign.
 */
export function validateCoverLetterDesignPatch(body: unknown): {
  valid: boolean;
  data: CoverLetterDesign | null;
  error?: string;
} {
  const shared = validateDocumentDesign(body);
  if (!shared.valid) {
    return { valid: false, data: null, error: shared.error };
  }

  const design: CoverLetterDesign = { ...shared.data };
  if (body && typeof body === 'object' && 'templateId' in body) {
    const templateId = (body as Record<string, unknown>).templateId;
    if (templateId !== undefined) {
      if (!isValidCoverLetterTemplateId(templateId)) {
        return {
          valid: false,
          data: null,
          error: 'templateId must be a valid cover letter template',
        };
      }
      design.templateId = templateId;
    }
  }

  return { valid: true, data: design };
}
