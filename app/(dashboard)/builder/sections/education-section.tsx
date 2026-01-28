'use client';

import { GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import type { Education } from '@/types';

interface EducationSectionProps {
  educations: Education[];
  profileId: string;
  onUpdate: (educations: Education[]) => void;
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

export function EducationSection({ educations, onUpdate }: EducationSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEducation, setEditingEducation] = useState<Education | null>(null);
  const [formData, setFormData] = useState<Partial<Education>>(emptyEducation);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenDialog = (education?: Education) => {
    if (education) {
      setEditingEducation(education);
      setFormData(education);
    } else {
      setEditingEducation(null);
      setFormData(emptyEducation);
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
        degree: formData.degree || undefined,
        fieldOfStudy: formData.fieldOfStudy || undefined,
        location: formData.location || undefined,
        startDate: formData.startDate,
        endDate: formData.isCurrent ? null : formData.endDate,
        isCurrent: formData.isCurrent || false,
        gpa: formData.gpa || undefined,
        description: formData.description || undefined,
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

      setIsDialogOpen(false);
      setFormData(emptyEducation);
      setEditingEducation(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Education</CardTitle>
          <CardDescription>Add your educational background</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Education
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingEducation ? 'Edit' : 'Add'} Education</DialogTitle>
            </DialogHeader>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Institution *</Label>
                <Input
                  value={formData.institution || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, institution: e.target.value }))
                  }
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
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, fieldOfStudy: e.target.value }))
                    }
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
                    value={
                      formData.startDate
                        ? new Date(formData.startDate).toISOString().slice(0, 7)
                        : ''
                    }
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        startDate: e.target.value ? new Date(e.target.value) : null,
                      }))
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
                        setFormData((prev) => ({
                          ...prev,
                          endDate: e.target.value ? new Date(e.target.value) : null,
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Description / Activities</Label>
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Relevant coursework, clubs, activities..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!formData.institution || isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {educations.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No education added yet. Click &quot;Add Education&quot; to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {educations.map((edu) => (
              <div
                key={edu.id}
                className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="cursor-move text-muted-foreground">
                  <GripVertical className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
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
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(edu)}
                        disabled={isLoading}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(edu.id)}
                        disabled={isLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
