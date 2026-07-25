'use client';

import { useMemo } from 'react';

import { ResumeTemplateGallery } from '@/app/(dashboard)/builder/components/resume-template-gallery';
import {
  buildDefaultDesignForTemplate,
  buildSparseResumePreviewProfile,
  DEFAULT_RESUME_TEMPLATE_ID,
  TEMPLATE_PREVIEW_ON_CREATE,
} from '@/lib/resume/templates';
import type { PublicProfile, ResumeDesign } from '@/types';

/**
 * Template gallery for first-time picks after upload / blank.
 *
 * Always uses TEMPLATE_PREVIEW_ON_CREATE (sample when sparse).
 * Do not use this inside the builder Design panel — that path must stay
 * TEMPLATE_PREVIEW_IN_BUILDER via ResumeTemplateGallery’s default.
 */
export function NewResumeTemplatePicker({
  open,
  onOpenChange,
  onSelect,
  profile,
  title = 'Choose a template',
  applyLabel = 'Continue',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (design: ResumeDesign) => void;
  /** When omitted (blank resume), previews use the archetype sample. */
  profile?: PublicProfile;
  title?: string;
  applyLabel?: string;
}) {
  const previewProfile = useMemo(() => profile ?? buildSparseResumePreviewProfile(), [profile]);
  const currentDesign = useMemo(
    () => buildDefaultDesignForTemplate(DEFAULT_RESUME_TEMPLATE_ID),
    []
  );

  return (
    <ResumeTemplateGallery
      profile={previewProfile}
      currentDesign={currentDesign}
      currentTemplateId={DEFAULT_RESUME_TEMPLATE_ID}
      previewDataPolicy={TEMPLATE_PREVIEW_ON_CREATE}
      open={open}
      onOpenChange={onOpenChange}
      hideTrigger
      title={title}
      applyLabel={applyLabel}
      onSelect={onSelect}
    />
  );
}
