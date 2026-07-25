import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { isHtmlEmpty } from '@/lib/html-utils';
import {
  extractSkillNamesFromHtml,
  parseCommaSeparatedSkills,
  skillsToHtml,
} from '@/lib/skills/groups';

const SyncSkillGroupsSchema = z.object({
  groups: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().max(50),
      skills: z.array(z.string().max(50)).optional(),
      skillsHtml: z.string().max(20000).nullable().optional(),
      sortOrder: z.number().int().optional(),
    })
  ),
});

/**
 * PUT /api/profile/skill-groups/sync
 * Replace the profile's skill groups with category + skill HTML / name lists.
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = SyncSkillGroupsSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { profileId } = await resolveActiveProfileContext(userId);

    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const seenSkills = new Set<string>();
    const prepared = validated.data.groups
      .map((group) => {
        const fromHtml = extractSkillNamesFromHtml(group.skillsHtml);
        const fromArray: string[] = [];
        for (const raw of group.skills ?? []) {
          const parts = raw.includes(',') ? parseCommaSeparatedSkills(raw) : [raw.trim()];
          for (const name of parts) {
            if (!name || name.length > 50) continue;
            fromArray.push(name);
          }
        }

        const skills: string[] = [];
        for (const name of fromHtml.length > 0 ? fromHtml : fromArray) {
          const key = name.toLowerCase();
          if (seenSkills.has(key)) continue;
          seenSkills.add(key);
          skills.push(name);
        }

        const skillsHtml =
          group.skillsHtml && !isHtmlEmpty(group.skillsHtml)
            ? group.skillsHtml
            : skillsToHtml(skills);

        const name =
          group.name.trim() || (skills.length > 0 || !isHtmlEmpty(skillsHtml) ? 'Skills' : '');
        return {
          id: group.id,
          name,
          skills,
          skillsHtml: isHtmlEmpty(skillsHtml) ? null : skillsHtml,
        };
      })
      .filter((group) => group.name.length > 0);

    const result = await db.$transaction(async (tx) => {
      const existingGroups = await tx.skillGroup.findMany({
        where: { profileId },
        select: { id: true },
      });
      const existingIds = new Set(existingGroups.map((g) => g.id));

      const keepIds = new Set(
        prepared
          .map((group) => group.id)
          .filter((id): id is string => typeof id === 'string' && existingIds.has(id))
      );

      for (const group of existingGroups) {
        if (keepIds.has(group.id)) continue;
        await tx.skill.deleteMany({ where: { groupId: group.id } });
        await tx.skillGroup.delete({ where: { id: group.id } });
      }

      await tx.skill.deleteMany({ where: { profileId, groupId: null } });

      const skillGroups = [];
      let skillSortOrder = 0;

      for (let index = 0; index < prepared.length; index++) {
        const group = prepared[index];
        const canReuse = Boolean(group.id && keepIds.has(group.id));

        const skillGroup = canReuse
          ? await tx.skillGroup.update({
              where: { id: group.id! },
              data: {
                name: group.name,
                sortOrder: index,
                skillsHtml: group.skillsHtml,
                updatedAt: new Date(),
              },
            })
          : await tx.skillGroup.create({
              data: {
                profileId,
                name: group.name,
                sortOrder: index,
                skillsHtml: group.skillsHtml,
              },
            });

        const desiredKeys = new Set(group.skills.map((name) => name.toLowerCase()));
        const currentSkills = await tx.skill.findMany({
          where: { groupId: skillGroup.id },
        });

        for (const skill of currentSkills) {
          if (!desiredKeys.has(skill.name.toLowerCase())) {
            await tx.skill.delete({ where: { id: skill.id } });
          }
        }

        for (const name of group.skills) {
          const existing = await tx.skill.findUnique({
            where: {
              profileId_name: { profileId, name },
            },
          });

          if (existing) {
            await tx.skill.update({
              where: { id: existing.id },
              data: {
                groupId: skillGroup.id,
                sortOrder: skillSortOrder++,
                updatedAt: new Date(),
              },
            });
          } else {
            await tx.skill.create({
              data: {
                profileId,
                name,
                groupId: skillGroup.id,
                sortOrder: skillSortOrder++,
                source: 'MANUAL',
              },
            });
          }
        }

        const withSkills = await tx.skillGroup.findUnique({
          where: { id: skillGroup.id },
          include: { skills: { orderBy: { sortOrder: 'asc' } } },
        });
        if (withSkills) skillGroups.push(withSkills);
      }

      const skills = await tx.skill.findMany({
        where: { profileId },
        orderBy: { sortOrder: 'asc' },
      });

      return { skills, skillGroups };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Error syncing skill groups:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
