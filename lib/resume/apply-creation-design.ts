/**
 * Persist a template design chosen during upload/blank creation.
 * Shared by dashboard new-resume flows after the creation gallery.
 */

import { getResumeTemplateId, getTemplateDefaultShowPhoto } from '@/lib/resume/templates';
import type { ResumeDesign } from '@/types';

export async function applyCreationResumeDesign(design: ResumeDesign): Promise<void> {
  const showPhoto = getTemplateDefaultShowPhoto(getResumeTemplateId(design.templateId));

  const [designResponse, photoResponse] = await Promise.all([
    fetch('/api/profile/resume-design', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(design),
    }),
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeShowPhoto: showPhoto }),
    }),
  ]);

  if (!designResponse.ok) {
    throw new Error('Failed to save resume template');
  }
  if (!photoResponse.ok) {
    // Design saved; photo default is best-effort for creation.
    console.error('Failed to sync resume photo visibility after template pick');
  }
}
