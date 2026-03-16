'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Briefcase, ChevronDown, Eye, EyeOff, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { notifyProfileUpdated } from '@/lib/events';
import { useReorderPersist } from '@/lib/hooks/use-reorder-persist';
import { bulletsToHtml, htmlToBullets } from '@/lib/html-utils';
import { cn } from '@/lib/utils';

import { SortableCardList } from '../components/sortable-card-list';

import type { WorkExperience } from '@/types';
import type { DateExtractor } from '../components/sortable-card-list';

const experienceDateExtractor: DateExtractor<WorkExperience> = (exp) => ({
  start: exp.startDate ? new Date(exp.startDate) : null,
  end: exp.endDate ? new Date(exp.endDate) : null,
});

interface ExperienceSectionProps {
  experiences: WorkExperience[];
  profileId: string;
  onUpdate: (experiences: WorkExperience[]) => void;
  /** Called when the section enters or exits inline-editing mode. */
  onEditingStateChange?: (isEditing: boolean) => void;
  /** When provided, auto-starts editing this entry and renders only the form. */
  autoEditId?: string | 'new';
  /** Called after save/cancel/delete in auto-edit mode to return to the entry list. */
  onEditComplete?: () => void;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

const emptyExperience: Partial<WorkExperience> = {
  company: '',
  role: '',
  location: '',
  locationType: undefined,
  employmentType: undefined,
  startDate: new Date(),
  endDate: null,
  isCurrent: false,
  bullets: [],
  tags: [],
};

export function ExperienceSection({
  experiences,
  onUpdate,
  onEditingStateChange,
  autoEditId,
  onEditComplete,
}: ExperienceSectionProps) {
  /** The id of the item being edited, or 'new' for a new item, or null when idle. */
  const [editingId, setEditingId] = useState<string | null>(autoEditId ?? null);
  const [formData, setFormData] = useState<Partial<WorkExperience>>(() => {
    if (autoEditId && autoEditId !== 'new') {
      const exp = experiences.find((e) => e.id === autoEditId);
      return exp ? { ...exp } : { ...emptyExperience };
    }
    return { ...emptyExperience };
  });
  const [tagInput, setTagInput] = useState('');
  /** Local HTML state for the rich text editor — initialized from bullets, stays as HTML while editing. */
  const [highlightsHtml, setHighlightsHtml] = useState(() => bulletsToHtml(formData.bullets));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Ref for the editing form — used for scroll-into-view. */
  const editingFormRef = useRef<HTMLDivElement>(null);

  const isEditing = editingId !== null;

  // Notify parent whenever editing state changes
  useEffect(() => {
    onEditingStateChange?.(isEditing);
  }, [isEditing, onEditingStateChange]);

  /** Snapshot of the experiences array before editing started — used to revert on cancel. */
  const snapshotRef = useRef<WorkExperience[]>(autoEditId ? [...experiences] : []);

  const persistOrder = useReorderPersist<WorkExperience>('workExperience', onUpdate);

  const handleReorder = useCallback(
    (reordered: WorkExperience[]) => {
      persistOrder(reordered);
    },
    [persistOrder]
  );

  // ── Inline editing helpers ──────────────────────

  const startEditing = (experience?: WorkExperience) => {
    snapshotRef.current = [...experiences];
    setError(null);
    setTagInput('');

    if (experience) {
      setEditingId(experience.id);
      setFormData({ ...experience });
      // Prefer the stored bulletsHtml (preserves alignment, bullet style, etc.)
      // Fall back to reconstructing from bullets[] for backward compat
      const storedHtml = experience.bulletsHtml;
      setHighlightsHtml(storedHtml || bulletsToHtml(experience.bullets));
    } else {
      setEditingId('new');
      setFormData({ ...emptyExperience });
      setHighlightsHtml('');
    }
  };

  const cancelEditing = () => {
    // Revert preview to the snapshot taken when editing began
    if (editingId && editingId !== 'new') {
      onUpdate(snapshotRef.current);
    }
    setEditingId(null);
    setFormData(emptyExperience);
    setHighlightsHtml('');
    setError(null);
    setTagInput('');
    if (autoEditId) onEditComplete?.();
  };

  const updateField = <K extends keyof WorkExperience>(field: K, value: WorkExperience[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Push real-time preview updates for existing items when formData changes.
  // We use refs for editingId and experiences so the effect only fires when
  // formData actually changes — not on every parent re-render.
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  const experiencesRef = useRef(experiences);
  experiencesRef.current = experiences;

  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const id = editingIdRef.current;
    if (!id || id === 'new') return;

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      const updated = experiencesRef.current.map((e) => (e.id === id ? { ...e, ...formData } : e));
      onUpdate(updated);
    }, 150);

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  // ── CRUD handlers ──────────────────────────────

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        company: formData.company,
        role: formData.role,
        location: formData.location || undefined,
        locationType: formData.locationType || undefined,
        employmentType: formData.employmentType || undefined,
        startDate: formData.startDate,
        endDate: formData.isCurrent ? null : formData.endDate,
        isCurrent: formData.isCurrent || false,
        bullets: formData.bullets || [],
        bulletsHtml: formData.bulletsHtml || highlightsHtml || undefined,
        tags: formData.tags || [],
      };

      if (editingId && editingId !== 'new') {
        const response = await fetch(`/api/profile/experiences/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update experience');
        }

        const { experience } = await response.json();
        onUpdate(experiences.map((exp) => (exp.id === editingId ? experience : exp)));
      } else {
        const response = await fetch('/api/profile/experiences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create experience');
        }

        const { experience } = await response.json();
        onUpdate([...experiences, experience]);
      }

      setEditingId(null);
      setFormData(emptyExperience);
      setTagInput('');
      notifyProfileUpdated();
      if (autoEditId) onEditComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (experienceId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/experiences/${experienceId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete experience');
      }

      onUpdate(experiences.filter((exp) => exp.id !== experienceId));
      if (editingId === experienceId) {
        setEditingId(null);
        setFormData(emptyExperience);
      }
      notifyProfileUpdated();
      if (autoEditId) onEditComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVisibility = async (experience: WorkExperience) => {
    const newValue = !(experience.isVisible ?? true);
    onUpdate(experiences.map((e) => (e.id === experience.id ? { ...e, isVisible: newValue } : e)));
    try {
      const response = await fetch(`/api/profile/experiences/${experience.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: newValue }),
      });
      if (!response.ok) throw new Error('Failed to update visibility');
      notifyProfileUpdated();
    } catch {
      onUpdate(
        experiences.map((e) => (e.id === experience.id ? { ...e, isVisible: !newValue } : e))
      );
    }
  };

  // ── Tag helpers ──────────────────────────────

  const addTag = () => {
    if (tagInput.trim() && !(formData.tags || []).includes(tagInput.trim())) {
      updateField('tags', [...(formData.tags || []), tagInput.trim()] as WorkExperience['tags']);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    updateField('tags', (formData.tags || []).filter((t) => t !== tag) as WorkExperience['tags']);
  };

  // ── Inline form ──────────────────────────────

  const renderInlineForm = () => (
    <div
      ref={editingFormRef}
      className="space-y-4 rounded-lg border-2 border-primary/30 bg-muted/30 p-4 shadow-md ring-2 ring-primary/10"
    >
      {/* Editing mode banner */}
      <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        {editingId === 'new' ? 'Adding new experience' : 'Editing experience'} — save or discard to
        continue
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Company *</Label>
          <Input
            value={formData.company || ''}
            onChange={(e) => updateField('company', e.target.value)}
            placeholder="Google"
          />
        </div>
        <div className="space-y-2">
          <Label>Role *</Label>
          <Input
            value={formData.role || ''}
            onChange={(e) => updateField('role', e.target.value)}
            placeholder="Senior Software Engineer"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Location</Label>
          <Input
            value={formData.location || ''}
            onChange={(e) => updateField('location', e.target.value)}
            placeholder="San Francisco, CA"
          />
        </div>
        <div className="space-y-2">
          <Label>Location Type</Label>
          <Select
            value={formData.locationType || ''}
            onValueChange={(value) =>
              updateField('locationType', value as WorkExperience['locationType'])
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ONSITE">On-site</SelectItem>
              <SelectItem value="REMOTE">Remote</SelectItem>
              <SelectItem value="HYBRID">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Employment Type</Label>
          <Select
            value={formData.employmentType || ''}
            onValueChange={(value) =>
              updateField('employmentType', value as WorkExperience['employmentType'])
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FULL_TIME">Full-time</SelectItem>
              <SelectItem value="PART_TIME">Part-time</SelectItem>
              <SelectItem value="CONTRACT">Contract</SelectItem>
              <SelectItem value="FREELANCE">Freelance</SelectItem>
              <SelectItem value="INTERNSHIP">Internship</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pt-7">
          <Switch
            checked={formData.isCurrent || false}
            onCheckedChange={(checked) => updateField('isCurrent', checked)}
          />
          <Label>Currently working here</Label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Start Date</Label>
          <Input
            type="month"
            value={formData.startDate ? new Date(formData.startDate).toISOString().slice(0, 7) : ''}
            onChange={(e) => updateField('startDate', new Date(e.target.value))}
          />
        </div>
        {!formData.isCurrent && (
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              type="month"
              value={formData.endDate ? new Date(formData.endDate).toISOString().slice(0, 7) : ''}
              onChange={(e) => updateField('endDate', new Date(e.target.value))}
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Highlights</Label>
        <RichTextEditor
          value={highlightsHtml}
          onChange={(html) => {
            setHighlightsHtml(html);
            // Update bullets (string[]) for backward compat AND bulletsHtml for faithful rendering
            const bullets = htmlToBullets(html);
            setFormData((prev) => ({ ...prev, bullets, bulletsHtml: html }));
          }}
          placeholder="Describe your achievements and responsibilities..."
          minHeight="160px"
          bulletMode
        />
      </div>

      <div className="space-y-2">
        <Label>Skills / Technologies</Label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add a skill..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button type="button" onClick={addTag} variant="secondary">
            Add
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(formData.tags || []).map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive">
                ×
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button
          onClick={handleSave}
          disabled={!formData.company || !formData.role || isLoading}
          className="gap-2"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="outline" onClick={cancelEditing} disabled={isLoading} className="gap-2">
          <X className="mr-1 h-4 w-4" />
          Discard
        </Button>
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────
  // Auto-edit mode: render only the inline form
  if (autoEditId) {
    return renderInlineForm();
  }
  return (
    <Card className="relative">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription>Add your professional experience</CardDescription>
          <Button onClick={() => startEditing()} className="gap-2" disabled={isEditing}>
            <Plus className="h-4 w-4" />
            Add Experience
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl bg-muted/40 p-4">
          {/* Inline form for adding a new experience */}
          <AnimatePresence>
            {editingId === 'new' && (
              <motion.div
                className="mb-4"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                {renderInlineForm()}
              </motion.div>
            )}
          </AnimatePresence>

          {experiences.length === 0 && editingId !== 'new' ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-medium">No work experience added yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Add your professional experience to build a compelling resume
              </p>
              <Button onClick={() => startEditing()} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Add Experience
              </Button>
            </div>
          ) : (
            experiences.length > 0 && (
              <div className="relative">
                {/*
                 * Editing overlay — dims and blocks interaction with the card list
                 * when adding a new item (the form is above the list).
                 */}
                {editingId === 'new' && (
                  <div
                    className="absolute inset-0 z-10 cursor-not-allowed rounded-lg bg-background/60 backdrop-blur-[1px]"
                    onClick={cancelEditing}
                    title="Save or discard your changes first"
                  />
                )}

                <SortableCardList
                  items={experiences}
                  onReorder={handleReorder}
                  dateExtractor={experienceDateExtractor}
                  disabled={isLoading || isEditing}
                  renderItem={(exp) => {
                    const isThisItemEditing = editingId === exp.id;
                    const isAnotherItemEditing = isEditing && !isThisItemEditing;

                    const dateLabel = [
                      new Date(exp.startDate).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      }),
                      exp.isCurrent
                        ? 'Present'
                        : exp.endDate
                          ? new Date(exp.endDate).toLocaleDateString('en-US', {
                              month: 'short',
                              year: 'numeric',
                            })
                          : '',
                    ]
                      .filter(Boolean)
                      .join(' – ');

                    return (
                      <div
                        className={cn(
                          'relative transition-all duration-200',
                          isAnotherItemEditing && 'pointer-events-none select-none opacity-40'
                        )}
                      >
                        {/* Minimised row — always visible */}
                        <div
                          className={cn(
                            'group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                            isThisItemEditing
                              ? 'border-primary/30 bg-muted/30'
                              : 'cursor-pointer hover:bg-muted/50',
                            exp.isVisible === false && !isThisItemEditing && 'opacity-50'
                          )}
                          onClick={() => {
                            if (isThisItemEditing) {
                              cancelEditing();
                            } else if (!isEditing) {
                              startEditing(exp);
                            }
                          }}
                        >
                          <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {exp.role || 'Untitled Role'}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">·</span>
                              <span className="truncate text-xs text-muted-foreground">
                                {exp.company || 'Company'}
                              </span>
                            </div>
                          </div>

                          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                            {dateLabel}
                          </span>

                          {/* Action buttons — visible on hover or when expanded */}
                          <div
                            className={cn(
                              'flex items-center gap-0.5 transition-opacity',
                              isThisItemEditing
                                ? 'opacity-100'
                                : isAnotherItemEditing
                                  ? 'opacity-0'
                                  : 'opacity-0 group-hover:opacity-100'
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleVisibility(exp)}
                              disabled={isEditing && !isThisItemEditing}
                              title={
                                exp.isVisible === false ? 'Show on resume' : 'Hide from resume'
                              }
                            >
                              {exp.isVisible === false ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(exp.id)}
                              disabled={isLoading || isAnotherItemEditing}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <ChevronDown
                              className={cn(
                                'h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200',
                                isThisItemEditing && '-rotate-180 text-muted-foreground'
                              )}
                            />
                          </div>
                        </div>

                        {/* Expanded inline edit form */}
                        <AnimatePresence>
                          {isThisItemEditing && (
                            <motion.div
                              className="mt-2"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              {renderInlineForm()}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  }}
                />
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
