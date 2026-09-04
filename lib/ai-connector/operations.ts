import { z } from 'zod';

export const ProposeSummarySchema = z
  .object({
    headline: z.string().max(200).optional(),
    summary: z.string().max(5000).optional(),
  })
  .refine((value) => Boolean(value.headline?.trim() || value.summary?.trim()), {
    message: 'Provide a headline, a summary, or both.',
  });

export const ProposeExperienceSchema = z.object({
  company: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  startDate: z.string().min(4).max(40),
  endDate: z.string().max(40).optional(),
  isCurrent: z.boolean().optional(),
  location: z.string().max(100).optional(),
  bullets: z.array(z.string().max(500)).max(20).optional(),
});

export const ProposeProjectSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  url: z.string().max(500).optional(),
  techStack: z.array(z.string().max(50)).max(20).optional(),
  highlights: z.array(z.string().max(200)).max(10).optional(),
});

export const ApplyDraftSchema = z.object({
  draftId: z.string().min(1),
});

export type ProposeSummaryInput = z.infer<typeof ProposeSummarySchema>;
export type ProposeExperienceInput = z.infer<typeof ProposeExperienceSchema>;
export type ProposeProjectInput = z.infer<typeof ProposeProjectSchema>;

export type DraftOperation =
  | { type: 'update_summary'; headline?: string; summary?: string }
  | {
      type: 'add_experience';
      company: string;
      role: string;
      startDate: string;
      endDate?: string;
      isCurrent?: boolean;
      location?: string;
      bullets?: string[];
    }
  | {
      type: 'add_project';
      title: string;
      description?: string;
      url?: string;
      techStack?: string[];
      highlights?: string[];
    };

export function operationFromSummary(input: ProposeSummaryInput): DraftOperation {
  return {
    type: 'update_summary',
    ...(input.headline?.trim() ? { headline: input.headline.trim() } : {}),
    ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
  };
}

export function operationFromExperience(input: ProposeExperienceInput): DraftOperation {
  return {
    type: 'add_experience',
    company: input.company.trim(),
    role: input.role.trim(),
    startDate: input.startDate.trim(),
    ...(input.endDate?.trim() ? { endDate: input.endDate.trim() } : {}),
    ...(input.isCurrent !== undefined ? { isCurrent: input.isCurrent } : {}),
    ...(input.location?.trim() ? { location: input.location.trim() } : {}),
    ...(input.bullets && input.bullets.length > 0
      ? { bullets: input.bullets.map((bullet) => bullet.trim()).filter(Boolean) }
      : {}),
  };
}

export function operationFromProject(input: ProposeProjectInput): DraftOperation {
  return {
    type: 'add_project',
    title: input.title.trim(),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.url?.trim() ? { url: input.url.trim() } : {}),
    ...(input.techStack && input.techStack.length > 0 ? { techStack: input.techStack } : {}),
    ...(input.highlights && input.highlights.length > 0 ? { highlights: input.highlights } : {}),
  };
}

export function describeOperation(operation: DraftOperation): string {
  switch (operation.type) {
    case 'update_summary':
      if (operation.headline && operation.summary) {
        return `Update headline and summary`;
      }
      if (operation.headline) return `Update headline to “${operation.headline}”`;
      return 'Update summary';
    case 'add_experience':
      return `Add role: ${operation.role} at ${operation.company}`;
    case 'add_project':
      return `Add project: ${operation.title}`;
  }
}

export function summarizeOperations(operations: DraftOperation[]): string {
  if (operations.length === 0) return 'No changes yet';
  if (operations.length === 1) return describeOperation(operations[0]);
  return operations
    .map((operation, index) => `${index + 1}. ${describeOperation(operation)}`)
    .join('\n');
}

export function isDraftOperation(value: unknown): value is DraftOperation {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return type === 'update_summary' || type === 'add_experience' || type === 'add_project';
}

export function parseOperations(value: unknown): DraftOperation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDraftOperation);
}
