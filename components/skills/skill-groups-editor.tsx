'use client';

import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { isHtmlEmpty, stripHtmlTags } from '@/lib/html-utils';
import { cn } from '@/lib/utils';

export interface SkillGroupRow {
  id: string;
  name: string;
  /** Rich-text HTML for the skills column (justified by default in the editor) */
  skillsHtml: string;
}

interface SkillGroupsEditorProps {
  groups: SkillGroupRow[];
  onChange: (groups: SkillGroupRow[]) => void;
  /** Controlled: which category accordion is open (null = all collapsed). */
  openId: string | null;
  onOpenChange: (openId: string | null) => void;
  disabled?: boolean;
  className?: string;
  addLabel?: string;
  /** Shared Save / Discard bar — same pattern as entry editors. */
  openActions?: ReactNode;
}

function skillPreview(html: string): string {
  if (isHtmlEmpty(html)) return 'No skills yet';
  const text = stripHtmlTags(html).replace(/\s+/g, ' ').trim();
  if (!text) return 'No skills yet';
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

function categoryTitle(name: string, index: number, total: number): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  return total > 1 ? `Category ${index + 1}` : 'Skills';
}

export function SkillGroupsEditor({
  groups,
  onChange,
  openId,
  onOpenChange,
  disabled = false,
  className,
  addLabel = 'Add category',
  openActions,
}: SkillGroupsEditorProps) {
  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    if (groups.length === 0) {
      if (openId !== null) onOpenChange(null);
      return;
    }
    if (openId && !groups.some((g) => g.id === openId)) {
      onOpenChange(null);
    }
  }, [groups, openId, onOpenChange]);

  const updateRow = (id: string, patch: Partial<Pick<SkillGroupRow, 'name' | 'skillsHtml'>>) => {
    const next = groupsRef.current.map((group) =>
      group.id === id ? { ...group, ...patch } : group
    );
    groupsRef.current = next;
    onChange(next);
  };

  const removeRow = (id: string) => {
    const next = groupsRef.current.filter((group) => group.id !== id);
    groupsRef.current = next;
    onChange(next);
    if (openId === id) onOpenChange(null);
  };

  const addRow = () => {
    const id = `skill-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const next = [
      ...groupsRef.current,
      {
        id,
        name: '',
        skillsHtml: '',
      },
    ];
    groupsRef.current = next;
    onChange(next);
    onOpenChange(id);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        {groups.map((group, index) => {
          const isOpen = openId === group.id;
          const title = categoryTitle(group.name, index, groups.length);
          const preview = skillPreview(group.skillsHtml);

          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-lg border border-border/60 bg-background/50"
            >
              <div className="flex items-center gap-1 p-1.5 sm:p-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(isOpen ? null : group.id)}
                  disabled={disabled}
                  aria-expanded={isOpen}
                  aria-controls={`skill-group-panel-${group.id}`}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left transition-colors',
                    'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                      isOpen && 'rotate-180'
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {title}
                    </span>
                    {!isOpen && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {preview}
                      </span>
                    )}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(group.id)}
                  disabled={disabled || groups.length <= 1}
                  aria-label={`Remove ${title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {isOpen ? (
                <div
                  id={`skill-group-panel-${group.id}`}
                  className="space-y-3 border-t border-border/50 px-3 pb-3 pt-3 sm:px-4 sm:pb-4"
                >
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`skill-category-${group.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Category <span className="font-normal">(optional)</span>
                    </Label>
                    <Input
                      id={`skill-category-${group.id}`}
                      value={group.name}
                      onChange={(e) => updateRow(group.id, { name: e.target.value })}
                      placeholder="e.g. Languages"
                      disabled={disabled}
                      aria-label="Skill category"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Skills</Label>
                    <RichTextEditor
                      value={group.skillsHtml}
                      onChange={(html) => updateRow(group.id, { skillsHtml: html })}
                      placeholder="e.g. Python, Java, TypeScript — or use bullets, bold, etc."
                      minHeight="120px"
                      disabled={disabled}
                    />
                  </div>

                  {openActions}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
        <Plus className="mr-1.5 h-4 w-4" />
        {addLabel}
      </Button>

      <p className="text-xs text-muted-foreground">
        Category is optional. Open one at a time to edit — bold, bullets, and justified by default.
      </p>
    </div>
  );
}
