'use client';

import { Clock, Globe, Link2, Lock, type LucideIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { formatRelativeDocumentDate } from './format-relative-document-date';

export type DocumentVisibilityKind = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

export const DOCUMENT_VISIBILITY_CONFIG: Record<
  DocumentVisibilityKind,
  {
    label: string;
    description: string;
    icon: LucideIcon;
  }
> = {
  PUBLIC: {
    label: 'Public',
    description: 'Anyone can view at your Follio URL',
    icon: Globe,
  },
  UNLISTED: {
    label: 'Visible with Link',
    description: 'Only people with the secure link can view this document',
    icon: Link2,
  },
  PRIVATE: {
    label: 'Private',
    description: 'Only you can see this document',
    icon: Lock,
  },
};

interface DocumentVisibilityMetaProps {
  visibility: DocumentVisibilityKind | string;
  updatedAt: string;
  /** Optional overrides for document-specific copy (e.g. "cover letter"). */
  descriptions?: Partial<Record<DocumentVisibilityKind, string>>;
}

/**
 * Visibility icon + label + relative date — shared by resume and cover letter cards.
 */
export function DocumentVisibilityMeta({
  visibility,
  updatedAt,
  descriptions,
}: DocumentVisibilityMetaProps) {
  const kind: DocumentVisibilityKind =
    visibility === 'PUBLIC' || visibility === 'UNLISTED' || visibility === 'PRIVATE'
      ? visibility
      : 'PRIVATE';
  const config = DOCUMENT_VISIBILITY_CONFIG[kind];
  const Icon = config.icon;
  const description = descriptions?.[kind] ?? config.description;

  return (
    <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0 cursor-default items-center gap-1 whitespace-nowrap">
              <Icon className="h-3 w-3 shrink-0" />
              {config.label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span aria-hidden className="shrink-0 text-border">
        •
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
        <Clock className="h-3 w-3 shrink-0" />
        {formatRelativeDocumentDate(updatedAt)}
      </span>
    </div>
  );
}
