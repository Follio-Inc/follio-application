import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { isHtmlFullyJustified, justifyHtmlContent } from '@/lib/html-utils';
import { logger } from '@/lib/logger';

import type { ResumeDesign } from '@/types';

/**
 * POST /api/profile/justify-all
 *
 * Bulk-justify all rich-text HTML content in the user's active profile.
 * Updates every text field that has a non-justify text-align value and
 * sets the `resumeDesign.justifyAll` CSS flag to `true`.
 *
 * Does NOT modify header fields (name, headline, location, etc.).
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await resolveActiveProfileContext(userId);
    const profileId = context.profileId;

    await db.$transaction(async (tx) => {
      // ── Work Experiences ──
      const experiences = await tx.workExperience.findMany({
        where: { profileId },
        select: { id: true, bulletsHtml: true },
      });
      for (const exp of experiences) {
        if (exp.bulletsHtml && !isHtmlFullyJustified(exp.bulletsHtml)) {
          await tx.workExperience.update({
            where: { id: exp.id },
            data: { bulletsHtml: justifyHtmlContent(exp.bulletsHtml) },
          });
        }
      }

      // ── Education ──
      const educations = await tx.education.findMany({
        where: { profileId },
        select: { id: true, description: true },
      });
      for (const edu of educations) {
        if (edu.description && !isHtmlFullyJustified(edu.description)) {
          await tx.education.update({
            where: { id: edu.id },
            data: { description: justifyHtmlContent(edu.description) },
          });
        }
      }

      // ── Projects ──
      const projects = await tx.project.findMany({
        where: { profileId },
        select: { id: true, description: true },
      });
      for (const proj of projects) {
        if (proj.description && !isHtmlFullyJustified(proj.description)) {
          await tx.project.update({
            where: { id: proj.id },
            data: { description: justifyHtmlContent(proj.description) },
          });
        }
      }

      // ── Awards ──
      const awards = await tx.award.findMany({
        where: { profileId },
        select: { id: true, description: true },
      });
      for (const award of awards) {
        if (award.description && !isHtmlFullyJustified(award.description)) {
          await tx.award.update({
            where: { id: award.id },
            data: { description: justifyHtmlContent(award.description) },
          });
        }
      }

      // ── Custom Sections (publications, volunteering, custom, etc.) ──
      const sections = await tx.profileSection.findMany({
        where: { profileId },
        select: { id: true, customContent: true },
      });
      for (const section of sections) {
        if (!section.customContent) continue;

        const cc = section.customContent as {
          content?: string;
          items?: Array<{ description?: string; [k: string]: unknown }>;
          [k: string]: unknown;
        };

        let changed = false;

        const newContent =
          cc.content && !isHtmlFullyJustified(cc.content)
            ? ((changed = true), justifyHtmlContent(cc.content))
            : cc.content;

        const newItems = (cc.items ?? []).map((item) => {
          if (item.description && !isHtmlFullyJustified(item.description)) {
            changed = true;
            return { ...item, description: justifyHtmlContent(item.description) };
          }
          return item;
        });

        if (changed) {
          await tx.profileSection.update({
            where: { id: section.id },
            data: {
              customContent: { ...cc, content: newContent, items: newItems } as object,
            },
          });
        }
      }

      // ── Profile summary + resumeDesign.justifyAll flag ──
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { summary: true, resumeDesign: true },
      });

      const summaryUpdate: Record<string, unknown> = {};
      if (profile?.summary && !isHtmlFullyJustified(profile.summary)) {
        summaryUpdate.summary = justifyHtmlContent(profile.summary);
      }

      const rawDesign = profile?.resumeDesign as ResumeDesign | null;
      const mergedDesign: ResumeDesign = { ...(rawDesign ?? {}), justifyAll: true };

      await tx.profile.update({
        where: { id: profileId },
        data: {
          ...summaryUpdate,
          resumeDesign: mergedDesign as object,
          updatedAt: new Date(),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to justify-all content', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
