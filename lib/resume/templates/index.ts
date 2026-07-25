export type {
  ResumeAtelierRailSectionType,
  ResumeSidebarSectionType,
  ResumeTemplateId,
  ResumeTemplateMeta,
} from './types';

export {
  isResumeAtelierRailSectionType,
  isResumeSidebarSectionType,
  RESUME_ATELIER_RAIL_SECTION_TYPES,
  RESUME_SIDEBAR_SECTION_TYPES,
} from './types';

export {
  buildDefaultDesignForTemplate,
  buildDesignForTemplateSwitch,
  DEFAULT_RESUME_TEMPLATE_ID,
  getAllResumeTemplates,
  getResumeTemplate,
  getResumeTemplateId,
  getTemplateDefaultShowPhoto,
  isValidResumeTemplateId,
  sanitizeResumeDesign,
} from './registry';

export {
  buildOnboardingResumePreviewProfile,
  buildSparseResumePreviewProfile,
  hasSufficientResumePreviewData,
  isUsingSampleResumePreview,
  resolveResumeTemplatePreviewProfile,
  TEMPLATE_PREVIEW_IN_BUILDER,
  TEMPLATE_PREVIEW_ON_CREATE,
  type OnboardingResumePreviewDraft,
  type ResumePreviewSufficiencyInput,
  type ResumeTemplatePreviewDataPolicy,
} from './preview-profile';

export { buildResumePreviewSections, RESUME_TEMPLATE_SAMPLE_PROFILE } from './sample-profile';
