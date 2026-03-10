/**
 * Portfolio Template System — Public API
 */

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
