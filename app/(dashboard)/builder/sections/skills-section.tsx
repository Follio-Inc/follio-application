'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { SkillGroupsEditor, type SkillGroupRow } from '@/components/skills/skill-groups-editor';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { notifyProfileUpdated } from '@/lib/events';
import { isHtmlEmpty } from '@/lib/html-utils';
import {
  editorRowsToDraftSkillGroups,
  extractSkillNamesFromHtml,
  resolveSkillsHtml,
  skillsToHtml,
} from '@/lib/skills/groups';

import { FormSaveBar } from '../components/form-save-bar';
import { useEntryFormDirty } from '../lib/entry-edit-guard';

import type { Skill, SkillGroup } from '@/types';

interface SkillsSectionProps {
  skills: Skill[];
  skillGroups: (SkillGroup & { skills: Skill[] })[];
  profileId: string;
  onUpdate: (skills: Skill[], skillGroups: (SkillGroup & { skills: Skill[] })[]) => void;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

function isPersistedGroupId(id: string): boolean {
  return (
    !id.startsWith('skill-group-') && !id.startsWith('ungrouped-') && !id.startsWith('skills-')
  );
}

function cloneRows(rows: SkillGroupRow[]): SkillGroupRow[] {
  return rows.map((row) => ({ ...row }));
}

function toEditorRows(
  skills: Skill[],
  skillGroups: (SkillGroup & { skills: Skill[] })[]
): SkillGroupRow[] {
  if (skillGroups.length > 0) {
    const groupedIds = new Set(skillGroups.flatMap((g) => g.skills.map((s) => s.id)));
    const ungrouped = skills.filter((s) => !s.groupId && !groupedIds.has(s.id));
    const rows: SkillGroupRow[] = skillGroups.map((group) => ({
      id: group.id,
      name: group.name === 'Skills' ? '' : group.name,
      skillsHtml: resolveSkillsHtml(
        group.skillsHtml,
        group.skills.map((s) => s.name)
      ),
    }));
    if (ungrouped.length > 0) {
      rows.push({
        id: `ungrouped-${Date.now()}`,
        name: 'Other',
        skillsHtml: skillsToHtml(ungrouped.map((s) => s.name)),
      });
    }
    return rows;
  }

  if (skills.length > 0) {
    return [
      {
        id: `skills-${Date.now()}`,
        name: '',
        skillsHtml: skillsToHtml(skills.map((s) => s.name)),
      },
    ];
  }

  return [{ id: `skill-group-${Date.now()}`, name: '', skillsHtml: '' }];
}

function rowsToPreviewProfile(
  rows: SkillGroupRow[],
  profileId: string
): { skills: Skill[]; skillGroups: (SkillGroup & { skills: Skill[] })[] } {
  const now = new Date(0);
  const skillGroups = editorRowsToDraftSkillGroups(rows).map((group) => ({
    id: group.id,
    profileId,
    name: group.name,
    sortOrder: group.sortOrder,
    skillsHtml: group.skillsHtml,
    createdAt: now,
    updatedAt: now,
    skills: group.skills.map((skill) => ({
      id: skill.id,
      profileId,
      name: skill.name,
      level: null,
      yearsOfExp: null,
      groupId: skill.groupId,
      isVisible: true,
      source: 'MANUAL' as const,
      sortOrder: skill.sortOrder,
      createdAt: now,
      updatedAt: now,
    })),
  }));

  return { skills: skillGroups.flatMap((group) => group.skills), skillGroups };
}

export function SkillsSection({
  skills,
  skillGroups,
  profileId,
  onUpdate,
  embedded,
}: SkillsSectionProps) {
  const [rows, setRows] = useState<SkillGroupRow[]>(() => toEditorRows(skills, skillGroups));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const { isDirty, resetBaseline, getBaseline } = useEntryFormDirty(rows, {
    enabled: true,
  });

  // Keep editor in sync when profile data reloads from outside — never clobber local drafts.
  useEffect(() => {
    if (isDirty) return;
    const next = toEditorRows(skills, skillGroups);
    setRows(next);
    resetBaseline(next);
  }, [skills, skillGroups, isDirty, resetBaseline]);

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const persistedRef = useRef({ skills, skillGroups });

  useEffect(() => {
    if (isDirty) return;
    persistedRef.current = { skills, skillGroups };
  }, [skills, skillGroups, isDirty]);

  // Push draft rows into the resume preview as the user types — same as experience.
  useEffect(() => {
    if (!isDirty) return;
    const timer = window.setTimeout(() => {
      const preview = rowsToPreviewProfile(rows, profileId);
      onUpdateRef.current(preview.skills, preview.skillGroups);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [rows, isDirty, profileId]);

  /** Same contract as entry editors: finish editing → leave the open panel. */
  const closeOpenCategory = useCallback(() => {
    setOpenId(null);
  }, []);

  const handleSave = useCallback(async () => {
    const groups = rows
      .map((row) => {
        const skillsHtml = row.skillsHtml;
        const names = extractSkillNamesFromHtml(skillsHtml);
        return {
          id: isPersistedGroupId(row.id) ? row.id : undefined,
          name: row.name.trim(),
          skills: names,
          skillsHtml: isHtmlEmpty(skillsHtml) ? null : skillsHtml,
        };
      })
      .filter((group) => group.name.length > 0 || group.skills.length > 0)
      .map((group) => ({
        ...group,
        name: group.name || 'Skills',
        skillsHtml: group.skillsHtml ?? skillsToHtml(group.skills),
      }));

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/profile/skill-groups/sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save skills');
      }

      const data = await response.json();
      const nextSkills = (data.skills ?? []) as Skill[];
      const nextGroups = (data.skillGroups ?? []) as (SkillGroup & { skills: Skill[] })[];
      const nextRows = toEditorRows(nextSkills, nextGroups);
      onUpdate(nextSkills, nextGroups);
      setRows(nextRows);
      resetBaseline(nextRows);
      notifyProfileUpdated();
      closeOpenCategory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [rows, onUpdate, resetBaseline, closeOpenCategory]);

  const handleDiscard = useCallback(() => {
    const baseline = cloneRows(getBaseline());
    setRows(baseline);
    resetBaseline(baseline);
    onUpdate(persistedRef.current.skills, persistedRef.current.skillGroups);
    setError(null);
    closeOpenCategory();
  }, [getBaseline, resetBaseline, closeOpenCategory, onUpdate]);

  const skillsContent = (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      <SkillGroupsEditor
        groups={rows}
        onChange={setRows}
        openId={openId}
        onOpenChange={setOpenId}
        disabled={isLoading}
        openActions={
          <FormSaveBar
            show
            canSave={isDirty}
            isSaving={isLoading}
            onSave={handleSave}
            onDiscard={handleDiscard}
            sticky={false}
            variant="entry"
          />
        }
      />
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Optional categories with a full text editor — bold, bullets, and justified by default.
        </p>
        {skillsContent}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          Optional categories with a full text editor — bold, bullets, and justified by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl bg-muted/40 p-4">{skillsContent}</div>
      </CardContent>
    </Card>
  );
}
