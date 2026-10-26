import { auth } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { interactiveTransactionOptions } from '@/lib/db-transaction';
import { isHtmlEmpty } from '@/lib/html-utils';
import { scheduleResumeRefresh } from '@/lib/resume/schedule-refresh';
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

    // Category names are unique per resume (a database index); say which one clashes instead of
    // failing the whole save with a 500.
    const seenNames = new Set<string>();
    for (const group of prepared) {
      if (seenNames.has(group.name)) {
        return NextResponse.json(
          {
            error: `Two categories are called "${group.name}". Give each category a different name.`,
          },
          { status: 400 }
        );
      }
      seenNames.add(group.name);
    }

    const result = await db.$transaction(async (tx) => {
      const existingGroups = await tx.skillGroup.findMany({
        where: { profileId },
        select: { id: true, name: true },
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

      // Renames are saved one group at a time, so swapping two names ("A"→"B", "B"→"A") or giving
      // a new group a name another group is leaving would clash midway. Park renamed groups on a
      // placeholder name first; the loop below gives them their final names.
      const currentNames = new Map(existingGroups.map((g) => [g.id, g.name]));
      for (const group of prepared) {
        if (!group.id || !keepIds.has(group.id)) continue;
        if (currentNames.get(group.id) === group.name) continue;
        await tx.skillGroup.update({
          where: { id: group.id },
          data: { name: `__renaming_${group.id}` },
        });
      }

      // One read for the skills that remain. Looking each name up again adds a
      // round trip per skill and can expire this transaction on a full resume.
      const skillsByName = new Map(
        (await tx.skill.findMany({ where: { profileId } })).map((skill) => [skill.name, skill])
      );

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
        const currentSkills = [...skillsByName.values()].filter(
          (skill) => skill.groupId === skillGroup.id
        );
        const removedIds = new Set(
          currentSkills
            .filter((skill) => !desiredKeys.has(skill.name.toLowerCase()))
            .map((skill) => skill.id)
        );

        if (removedIds.size > 0) {
          await tx.skill.deleteMany({ where: { id: { in: [...removedIds] } } });
          for (const skill of currentSkills) {
            if (removedIds.has(skill.id)) skillsByName.delete(skill.name);
          }
        }

        const groupSkills = [];
        for (const name of group.skills) {
          const existing = skillsByName.get(name);

          if (existing) {
            const updated = await tx.skill.update({
              where: { id: existing.id },
              data: {
                groupId: skillGroup.id,
                sortOrder: skillSortOrder++,
                updatedAt: new Date(),
              },
            });
            skillsByName.set(name, updated);
            groupSkills.push(updated);
          } else {
            const created = await tx.skill.create({
              data: {
                profileId,
                name,
                groupId: skillGroup.id,
                sortOrder: skillSortOrder++,
                source: 'MANUAL',
              },
            });
            skillsByName.set(name, created);
            groupSkills.push(created);
          }
        }

        skillGroups.push({
          ...skillGroup,
          skills: groupSkills.sort((a, b) => a.sortOrder - b.sortOrder),
        });
      }

      const skills = [...skillsByName.values()].sort((a, b) => a.sortOrder - b.sortOrder);

      return { skills, skillGroups };
    }, interactiveTransactionOptions);

    scheduleResumeRefresh(profileId);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Two categories have the same name. Give each category a different name.' },
        { status: 409 }
      );
    }
    console.error('Error syncing skill groups:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
