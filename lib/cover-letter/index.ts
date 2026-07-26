export {
  COVER_LETTER_DESIGN_DEFAULTS,
  buildCoverLetterDesignStyleAttr,
  buildCoverLetterDesignStyles,
  designFromResumePaper,
  isValidCoverLetterTemplateId,
  mergeCoverLetterDesign,
  parseCoverLetterDesign,
  type CoverLetterDesign,
  type CoverLetterTemplateId,
} from './design';

export {
  COVER_LETTER_CONTENT_DEFAULTS,
  coverLetterBodyParagraphs,
  coverLetterContentPatchSchema,
  mergeCoverLetterContent,
  parseCoverLetterContent,
  pickCoverLetterContent,
  type CoverLetterContent,
} from './content';

export { validateCoverLetterDesignPatch } from './validate-design';

export {
  COVER_LETTER_VISIBILITIES,
  isCoverLetterVisibility,
  normalizeCoverLetterVisibility,
  type CoverLetterVisibility,
} from './visibility';

export const DEFAULT_COVER_LETTER_TITLE = 'Untitled Cover Letter';
