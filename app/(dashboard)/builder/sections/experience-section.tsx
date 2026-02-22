'use client';

import {
  Briefcase,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { notifyProfileUpdated } from '@/lib/events';
import { useReorderPersist } from '@/lib/hooks/use-reorder-persist';
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

export function ExperienceSection({ experiences, onUpdate }: ExperienceSectionProps) {
  /** The id of the item being edited, or 'new' for a new item, or null when idle. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<WorkExperience>>(emptyExperience);
  const [tagInput, setTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Snapshot of the experiences array before editing started — used to revert on cancel. */
  const snapshotRef = useRef<WorkExperience[]>([]);

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
    } else {
      setEditingId('new');
      setFormData({ ...emptyExperience });
    }
  };

  const cancelEditing = () => {
    // Revert preview to the snapshot taken when editing began
    if (editingId && editingId !== 'new') {
      onUpdate(snapshotRef.current);
    }
    setEditingId(null);
    setFormData(emptyExperience);
    setError(null);
    setTagInput('');
  };

  /**
   * Update a single form field and push a real-time preview update
   * for existing items so the resume preview reflects changes instantly.
   */
  const updateField = <K extends keyof WorkExperience>(field: K, value: WorkExperience[K]) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // Push real-time update for existing items
      if (editingId && editingId !== 'new') {
        const updatedExperiences = experiences.map((e) =>
          e.id === editingId ? { ...e, ...updated } : e
        );
        onUpdate(updatedExperiences);
      }

      return updated;
    });
  };

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
    <div className="space-y-4 rounded-lg border border-primary/20 bg-muted/30 p-4">
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
        <Textarea
          value={(formData.bullets || []).join('\n')}
          onChange={(e) => {
            const lines = e.target.value.split('\n');
            updateField(
              'bullets',
              lines.filter((l) => l.trim().length > 0) as WorkExperience['bullets']
            );
          }}
          placeholder="One highlight per line, e.g.:\nLed migration from REST to GraphQL\nReduced bundle size by 45%"
          rows={5}
        />
        <p className="text-xs text-muted-foreground">One highlight per line</p>
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
          size="sm"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={isLoading}>
          <X className="mr-1 h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Work Experience</CardTitle>
            <CardDescription>Add your professional experience</CardDescription>
          </div>
          <Button onClick={() => startEditing()} className="gap-2" disabled={editingId === 'new'}>
            <Plus className="h-4 w-4" />
            Add Experience
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Inline form for adding a new experience */}
        {editingId === 'new' && <div className="mb-4">{renderInlineForm()}</div>}

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
            <SortableCardList
              items={experiences}
              onReorder={handleReorder}
              dateExtractor={experienceDateExtractor}
              disabled={isLoading || editingId !== null}
              renderItem={(exp) => (
                <div>
                  {/* Collapsed card view */}
                  <div
                    className={cn(
                      'group flex items-start gap-4 rounded-lg border p-4 transition-colors',
                      editingId === exp.id ? 'border-primary/30 bg-muted/30' : 'hover:bg-muted/50',
                      exp.isVisible === false && editingId !== exp.id && 'opacity-50'
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Briefcase className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            if (!editingId) startEditing(exp);
                          }}
                        >
                          <h4 className="font-medium">{exp.role || 'Untitled Role'}</h4>
                          <p className="text-sm text-muted-foreground">
                            {exp.company || 'Company'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(exp.startDate).toLocaleDateString('en-US', {
                              month: 'short',
                              year: 'numeric',
                            })}
                            {' - '}
                            {exp.isCurrent
                              ? 'Present'
                              : exp.endDate
                                ? new Date(exp.endDate).toLocaleDateString('en-US', {
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleVisibility(exp)}
                            title={exp.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                          >
                            {exp.isVisible === false ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          {editingId === exp.id ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={cancelEditing}
                              title="Collapse"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEditing(exp)}
                              disabled={editingId !== null}
                              title="Edit"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(exp.id)}
                            disabled={isLoading}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {editingId !== exp.id && exp.tags && exp.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {exp.tags.slice(0, 5).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {exp.tags.length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{exp.tags.length - 5}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded inline edit form */}
                  {editingId === exp.id && <div className="mt-2">{renderInlineForm()}</div>}
                </div>
              )}
            />
          )
        )}
      </CardContent>
    </Card>
  );
}
