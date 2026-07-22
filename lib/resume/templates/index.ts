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
} from './registry';
