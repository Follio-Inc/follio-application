/**
 * Portfolio Template System — Public API
 */

export { PORTFOLIO_THUMBNAIL_FOCUS_ATTR } from './types';

export type {
  TemplateCopy,
  TemplateKit,
  TemplateKitMeta,
  TemplatePortfolio,
  TemplateProfileData,
  TemplateRendererProps,
  TemplateSectionConfig,
  TemplateSectionProps,
  TemplateSectionType,
  TemplateStyleConfig,
} from './types';

export { normalizeProfileForTemplate } from './normalizer';
export { getAllTemplates, getDefaultTemplateId, getTemplate, getTemplateMeta } from './registry';
