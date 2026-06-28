/**
 * Runtime validation for editor-submitted portfolio drafts.
 *
 * The editor sends a full TemplatePortfolio draft to the server. Because this
 * data is persisted and later rendered on the public page, we validate its
 * shape with zod before trusting it — failing fast at the API boundary.
 */

import { z } from 'zod';

import type { TemplatePortfolio } from './types';

const sectionTypeSchema = z.enum([
  'navigation',
  'hero',
  'about',
  'experience',
  'projects',
  'skills',
  'education',
  'certifications',
  'awards',
  'github',
  'blog',
  'contact',
  'footer',
]);

const sectionSchema = z.object({
  id: z.string().min(1),
  type: sectionTypeSchema,
  enabled: z.boolean(),
  order: z.number().int(),
  overrides: z.record(z.unknown()).optional(),
});

// Copy: required string fields are always present; extended fields are optional.
const copySchema = z
  .object({
    heroHeadline: z.string(),
    heroSubtext: z.string(),
    aboutTitle: z.string(),
    aboutText: z.string(),
    contactTitle: z.string(),
    contactSubtext: z.string(),
    primaryCtaLabel: z.string(),
    seoTitle: z.string(),
    seoDescription: z.string(),
    sectionIntros: z.record(z.string()).optional(),
    sectionHeadings: z
      .record(z.object({ eyebrow: z.string().optional(), title: z.string().optional() }))
      .optional(),
    projectNarratives: z.record(z.string()).optional(),
    experienceNarrative: z.string().nullable().optional(),
    githubNarrative: z.string().nullable().optional(),
    writingNarrative: z.string().nullable().optional(),
    pullQuote: z.string().nullable().optional(),
  })
  .passthrough();

const styleSchema = z
  .object({
    accentColor: z.string(),
    fontFamily: z.string(),
  })
  .passthrough();

const overridesSchema = z
  .object({
    avatarUrl: z.string().nullable().optional(),
    projectImages: z.record(z.string().nullable()).optional(),
    portraitStyle: z.enum(['style-1', 'style-2', 'style-3', 'style-4', 'style-5']).optional(),
    portraitLayout: z
      .object({
        size: z.enum(['small', 'medium', 'large']).optional(),
        align: z.enum(['left', 'right']).optional(),
      })
      .optional(),
    workStyle: z.enum(['editorial', 'grid', 'gallery']).optional(),
    aboutStyle: z.enum(['sidebar', 'centered', 'statement']).optional(),
    skillsStyle: z.enum(['rows', 'inline', 'columns']).optional(),
  })
  .nullable()
  .optional();

/**
 * Validates a complete TemplatePortfolio. Enrichment is left as an opaque
 * passthrough (it is produced by the AI pipeline, never authored by the editor).
 */
export const templatePortfolioSchema = z
  .object({
    templateId: z.string().min(1),
    copy: copySchema,
    sections: z.array(sectionSchema),
    style: styleSchema,
    enrichment: z.unknown().nullable().optional(),
    overrides: overridesSchema,
  })
  .passthrough();

export type ValidatedTemplatePortfolio = z.infer<typeof templatePortfolioSchema>;

/**
 * Parse and validate an unknown value as a TemplatePortfolio.
 * Throws a ZodError when invalid.
 */
export function parseTemplatePortfolio(value: unknown): TemplatePortfolio {
  return templatePortfolioSchema.parse(value) as unknown as TemplatePortfolio;
}
