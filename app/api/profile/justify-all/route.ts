import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { bulletsToHtml, isHtmlFullyJustified, justifyHtmlContent } from '@/lib/html-utils';
import { logger } from '@/lib/logger';

/**
 * POST /api/profile/justify-all
 *
 * Bulk-justify all rich-text HTML content in the user's active profile.
 * Writes `text-align: justify` into stored editor HTML. Does not apply a
 * preview-only CSS overlay.
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
        select: { id: true, bulletsHtml: true, bullets: true },
      });
      for (const exp of experiences) {
        if (exp.bulletsHtml && !isHtmlFullyJustified(exp.bulletsHtml)) {
          await tx.workExperience.update({
            where: { id: exp.id },
            data: { bulletsHtml: justifyHtmlContent(exp.bulletsHtml) },
          });
        } else if (!exp.bulletsHtml && exp.bullets.length > 0) {
          await tx.workExperience.update({
            where: { id: exp.id },
            data: { bulletsHtml: bulletsToHtml(exp.bullets) },
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

      // ── Skill groups ──
      const skillGroups = await tx.skillGroup.findMany({
        where: { profileId },
        select: { id: true, skillsHtml: true },
      });
      for (const group of skillGroups) {
        if (group.skillsHtml && !isHtmlFullyJustified(group.skillsHtml)) {
          await tx.skillGroup.update({
            where: { id: group.id },
            data: { skillsHtml: justifyHtmlContent(group.skillsHtml) },
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

      // ── Profile summary ──
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { summary: true },
      });

      if (profile?.summary && !isHtmlFullyJustified(profile.summary)) {
        await tx.profile.update({
          where: { id: profileId },
          data: {
            summary: justifyHtmlContent(profile.summary),
            updatedAt: new Date(),
          },
        });
      } else {
        await tx.profile.update({
          where: { id: profileId },
          data: { updatedAt: new Date() },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to justify-all content', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
