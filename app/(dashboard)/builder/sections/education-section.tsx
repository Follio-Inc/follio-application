'use client';

import { Eye, EyeOff, GraduationCap, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Switch } from '@/components/ui/switch';
import { notifyProfileUpdated } from '@/lib/events';
import { isHtmlEmpty } from '@/lib/html-utils';
import { useReorderPersist } from '@/lib/hooks/use-reorder-persist';
import { emptyToNull } from '@/lib/validations';
import { cn, parseMonthInput, toMonthInputValue } from '@/lib/utils';

import { EntryInlineForm } from '../components/entry-inline-form';
import { SortableCardList } from '../components/sortable-card-list';
import { useEntryFormDirty, type RegisterEntryEditGuard } from '../lib/entry-edit-guard';

import type { Education } from '@/types';
import type { DateExtractor } from '../components/sortable-card-list';

const educationDateExtractor: DateExtractor<Education> = (edu) => ({
  start: edu.startDate ? new Date(edu.startDate) : null,
  end: edu.endDate ? new Date(edu.endDate) : null,
});

interface EducationSectionProps {
  educations: Education[];
  profileId: string;
  onUpdate: (educations: Education[]) => void;
  /** When provided, auto-opens the edit dialog for this entry. */
  autoEditId?: string | 'new';
  /** Called when editing completes (save/cancel/close) in auto-edit mode. */
  onEditComplete?: () => void;
  /** Registers dirty-state with the parent Back control in focused edit mode. */
  onRegisterEditGuard?: RegisterEntryEditGuard;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

const emptyEducation: Partial<Education> = {
  institution: '',
  degree: '',
  fieldOfStudy: '',
  location: '',
  startDate: null,
  endDate: null,
  isCurrent: false,
  gpa: '',
  description: '',
  activities: [],
  honors: [],
};

export function EducationSection({
  educations,
  onUpdate,
  autoEditId,
  onEditComplete,
  onRegisterEditGuard,
  embedded,
}: EducationSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(!!autoEditId);
  const [editingEducation, setEditingEducation] = useState<Education | null>(() => {
    if (autoEditId && autoEditId !== 'new') {
      return educations.find((e) => e.id === autoEditId) ?? null;
    }
    return null;
  });
  const [formData, setFormData] = useState<Partial<Education>>(() => {
    if (autoEditId && autoEditId !== 'new') {
      const edu = educations.find((e) => e.id === autoEditId);
      return edu ? { ...edu } : { ...emptyEducation };
    }
    return { ...emptyEducation };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { resetBaseline, actionsRef, attentionKey } = useEntryFormDirty(formData, {
    enabled: Boolean(autoEditId),
    onRegister: onRegisterEditGuard,
  });

  const persistOrder = useReorderPersist<Education>('education', onUpdate);

  const snapshotRef = useRef<Education[]>(autoEditId ? [...educations] : []);
  const skipRevertRef = useRef(false);
  const editingId =
    editingEducation?.id ?? (autoEditId && autoEditId !== 'new' ? autoEditId : null);
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  const educationsRef = useRef(educations);
  educationsRef.current = educations;
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revertPreview = useCallback(() => {
    onUpdate(snapshotRef.current);
  }, [onUpdate]);

  useEffect(() => {
    const id = editingIdRef.current;
    if (!id) return;
    if (!autoEditId && !isDialogOpen) return;

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      const updated = educationsRef.current.map((edu) =>
        edu.id === id
          ? {
              ...edu,
              ...formData,
              gpa: emptyToNull(formData.gpa),
              degree: emptyToNull(formData.degree),
              fieldOfStudy: emptyToNull(formData.fieldOfStudy),
              location: emptyToNull(formData.location),
              description: isHtmlEmpty(formData.description)
                ? null
                : (formData.description ?? null),
            }
          : edu
      );
      onUpdate(updated);
    }, 150);

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, isDialogOpen, autoEditId]);

  const handleReorder = useCallback(
    (reordered: Education[]) => {
      persistOrder(reordered, educations);
    },
    [persistOrder, educations]
  );

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      if (!skipRevertRef.current && editingEducation) {
        revertPreview();
      }
      skipRevertRef.current = false;
      if (autoEditId) onEditComplete?.();
    }
  };

  const handleOpenDialog = (education?: Education) => {
    snapshotRef.current = [...educations];
    skipRevertRef.current = false;
    if (education) {
      setEditingEducation(education);
      const next = { ...education };
      setFormData(next);
      resetBaseline(next);
    } else {
      setEditingEducation(null);
      const next = { ...emptyEducation };
      setFormData(next);
      resetBaseline(next);
    }
    setError(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        institution: formData.institution,
        degree: emptyToNull(formData.degree),
        fieldOfStudy: emptyToNull(formData.fieldOfStudy),
        location: emptyToNull(formData.location),
        startDate: formData.startDate,
        endDate: formData.isCurrent ? null : formData.endDate,
        isCurrent: formData.isCurrent || false,
        gpa: emptyToNull(formData.gpa),
        description: isHtmlEmpty(formData.description) ? null : (formData.description ?? null),
        activities: formData.activities || [],
        honors: formData.honors || [],
      };

      if (editingEducation) {
        // Update existing education
        const response = await fetch(`/api/profile/education/${editingEducation.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update education');
        }

        const { education } = await response.json();
        const updatedEducations = educations.map((edu) =>
          edu.id === editingEducation.id ? education : edu
        );
        onUpdate(updatedEducations);
      } else {
        // Create new education
        const response = await fetch('/api/profile/education', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create education');
        }

        const { education } = await response.json();
        onUpdate([...educations, education]);
      }

      skipRevertRef.current = true;
      setIsDialogOpen(false);
      setFormData(emptyEducation);
      setEditingEducation(null);
      notifyProfileUpdated();
      if (autoEditId) onEditComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (educationId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/education/${educationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete education');
      }

      onUpdate(educations.filter((edu) => edu.id !== educationId));
      notifyProfileUpdated();
      if (autoEditId) onEditComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Inline form (auto-edit mode) ──

  const renderInlineForm = () => (
    <EntryInlineForm
      banner={
        editingEducation
          ? 'Editing education — save or discard to continue'
          : 'Adding new education — save or discard to continue'
      }
      error={error}
      onSave={handleSave}
      onDiscard={() => {
        revertPreview();
        onEditComplete?.();
      }}
      canSave={Boolean(formData.institution)}
      isSaving={isLoading}
      actionsRef={actionsRef}
      attentionKey={attentionKey}
      onDelete={editingEducation ? () => void handleDelete(editingEducation.id) : undefined}
    >
      <div className="space-y-2">
        <Label>Institution *</Label>
        <Input
          value={formData.institution || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, institution: e.target.value }))}
          placeholder="Stanford University"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Degree</Label>
          <Input
            value={formData.degree || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, degree: e.target.value }))}
            placeholder="Bachelor of Science"
          />
        </div>
        <div className="space-y-2">
          <Label>Field of Study</Label>
          <Input
            value={formData.fieldOfStudy || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, fieldOfStudy: e.target.value }))}
            placeholder="Computer Science"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Location</Label>
          <Input
            value={formData.location || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
            placeholder="Stanford, CA"
          />
        </div>
        <div className="space-y-2">
          <Label>GPA</Label>
          <Input
            value={formData.gpa || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, gpa: e.target.value }))}
            placeholder="3.9"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={formData.isCurrent || false}
          onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isCurrent: checked }))}
        />
        <Label>Currently studying here</Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Start Date</Label>
          <Input
            type="month"
            value={toMonthInputValue(formData.startDate)}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                startDate: parseMonthInput(e.target.value),
              }))
            }
          />
        </div>
        {!formData.isCurrent && (
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              type="month"
              value={toMonthInputValue(formData.endDate)}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  endDate: parseMonthInput(e.target.value),
                }))
              }
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Description / Activities</Label>
        <RichTextEditor
          value={formData.description || ''}
          onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
          placeholder="Relevant coursework, clubs, activities..."
          minHeight="120px"
        />
      </div>
    </EntryInlineForm>
  );

  // Auto-edit mode: render only the inline form
  if (autoEditId) {
    return renderInlineForm();
  }

  const toggleVisibility = async (education: Education) => {
    const newValue = !(education.isVisible ?? true);
    // Optimistic update
    onUpdate(educations.map((e) => (e.id === education.id ? { ...e, isVisible: newValue } : e)));
    try {
      const response = await fetch(`/api/profile/education/${education.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: newValue }),
      });
      if (!response.ok) throw new Error('Failed to update visibility');
      notifyProfileUpdated();
    } catch {
      // Revert on error
      onUpdate(educations.map((e) => (e.id === education.id ? { ...e, isVisible: !newValue } : e)));
    }
  };

  const addButton = (
    <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button
          onClick={() => handleOpenDialog()}
          className="gap-2"
          size={embedded ? 'sm' : 'default'}
        >
          <Plus className="h-4 w-4" />
          Add Education
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editingEducation ? 'Edit' : 'Add'} Education</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Institution *</Label>
            <Input
              value={formData.institution || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, institution: e.target.value }))}
              placeholder="Stanford University"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Degree</Label>
              <Input
                value={formData.degree || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, degree: e.target.value }))}
                placeholder="Bachelor of Science"
              />
            </div>
            <div className="space-y-2">
              <Label>Field of Study</Label>
              <Input
                value={formData.fieldOfStudy || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, fieldOfStudy: e.target.value }))}
                placeholder="Computer Science"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={formData.location || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Stanford, CA"
              />
            </div>
            <div className="space-y-2">
              <Label>GPA</Label>
              <Input
                value={formData.gpa || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, gpa: e.target.value }))}
                placeholder="3.9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={formData.isCurrent || false}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isCurrent: checked }))
              }
            />
            <Label>Currently studying here</Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="month"
                value={toMonthInputValue(formData.startDate)}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    startDate: parseMonthInput(e.target.value),
                  }))
                }
              />
            </div>
            {!formData.isCurrent && (
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="month"
                  value={toMonthInputValue(formData.endDate)}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      endDate: parseMonthInput(e.target.value),
                    }))
                  }
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Description / Activities</Label>
            <RichTextEditor
              value={formData.description || ''}
              onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
              placeholder="Relevant coursework, clubs, activities..."
              minHeight="120px"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!formData.institution || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const educationList = (
    <div className={cn(!embedded && 'rounded-xl bg-muted/40 p-4')}>
      {educations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No education added yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your educational background to showcase your qualifications
          </p>
          <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Add Education
          </Button>
        </div>
      ) : (
        <div>
          <SortableCardList
            items={educations}
            onReorder={handleReorder}
            dateExtractor={educationDateExtractor}
            disabled={isLoading}
            renderItem={(edu) => (
              <div
                className={cn(
                  'group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50',
                  edu.isVisible === false && 'opacity-50'
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <GraduationCap className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-medium">
                        {edu.degree} {edu.fieldOfStudy && `in ${edu.fieldOfStudy}`}
                      </h4>
                      <p className="text-sm text-muted-foreground">{edu.institution}</p>
                      <p className="text-xs text-muted-foreground">
                        {edu.startDate &&
                          new Date(edu.startDate).toLocaleDateString('en-US', {
                            month: 'short',
                            year: 'numeric',
                          })}
                        {edu.startDate && ' - '}
                        {edu.isCurrent
                          ? 'Present'
                          : edu.endDate
                            ? new Date(edu.endDate).toLocaleDateString('en-US', {
                                month: 'short',
                                year: 'numeric',
                              })
                            : ''}
                        {edu.gpa && ` • GPA: ${edu.gpa}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleVisibility(edu)}
                        title={edu.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                      >
                        {edu.isVisible === false ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenDialog(edu)}
                        disabled={isLoading}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(edu.id)}
                        disabled={isLoading}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Add your educational background</p>
          {addButton}
        </div>
        {educationList}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription>Add your educational background</CardDescription>
          {addButton}
        </div>
      </CardHeader>
      <CardContent>{educationList}</CardContent>
    </Card>
  );
}
