'use client';

import { GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import type { WorkExperience } from '@/types';

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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExperience, setEditingExperience] = useState<WorkExperience | null>(null);
  const [formData, setFormData] = useState<Partial<WorkExperience>>(emptyExperience);
  const [tagInput, setTagInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenDialog = (experience?: WorkExperience) => {
    if (experience) {
      setEditingExperience(experience);
      setFormData(experience);
    } else {
      setEditingExperience(null);
      setFormData(emptyExperience);
    }
    setError(null);
    setIsDialogOpen(true);
  };

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

      if (editingExperience) {
        // Update existing experience
        const response = await fetch(`/api/profile/experiences/${editingExperience.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update experience');
        }

        const { experience } = await response.json();
        const updatedExperiences = experiences.map((exp) =>
          exp.id === editingExperience.id ? experience : exp
        );
        onUpdate(updatedExperiences);
      } else {
        // Create new experience
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

      setIsDialogOpen(false);
      setFormData(emptyExperience);
      setEditingExperience(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !(formData.tags || []).includes(tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((t) => t !== tag),
    }));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Work Experience</CardTitle>
          <CardDescription>Add your professional experience</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Experience
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingExperience ? 'Edit' : 'Add'} Experience</DialogTitle>
            </DialogHeader>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Company *</Label>
                  <Input
                    value={formData.company || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, company: e.target.value }))}
                    placeholder="Google"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role *</Label>
                  <Input
                    value={formData.role || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
                    placeholder="Senior Software Engineer"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input
                    value={formData.location || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="San Francisco, CA"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location Type</Label>
                  <Select
                    value={formData.locationType || ''}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        locationType: value as WorkExperience['locationType'],
                      }))
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
                      setFormData((prev) => ({
                        ...prev,
                        employmentType: value as WorkExperience['employmentType'],
                      }))
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
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, isCurrent: checked }))
                    }
                  />
                  <Label>Currently working here</Label>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="month"
                    value={
                      formData.startDate
                        ? new Date(formData.startDate).toISOString().slice(0, 7)
                        : ''
                    }
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, startDate: new Date(e.target.value) }))
                    }
                  />
                </div>
                {!formData.isCurrent && (
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="month"
                      value={
                        formData.endDate ? new Date(formData.endDate).toISOString().slice(0, 7) : ''
                      }
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, endDate: new Date(e.target.value) }))
                      }
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
                    // Keep empty lines while typing, but store only non-empty ones
                    setFormData((prev) => ({
                      ...prev,
                      bullets: lines.filter((l) => l.trim().length > 0),
                    }));
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
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  />
                  <Button type="button" onClick={addTag} variant="secondary">
                    Add
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(formData.tags || []).map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!formData.company || !formData.role || isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {experiences.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No work experience added yet. Click &quot;Add Experience&quot; to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {experiences.map((exp) => (
              <div
                key={exp.id}
                className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="cursor-move text-muted-foreground">
                  <GripVertical className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{exp.role}</h4>
                      <p className="text-sm text-muted-foreground">{exp.company}</p>
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
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(exp)}
                        disabled={isLoading}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(exp.id)}
                        disabled={isLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {exp.tags && exp.tags.length > 0 && (
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
