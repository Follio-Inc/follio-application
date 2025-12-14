'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

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

export function EducationSection({ educations, profileId, onUpdate }: EducationSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Education>>(emptyEducation);

  const handleOpenDialog = (index?: number) => {
    if (index !== undefined) {
      setEditingIndex(index);
      setFormData(educations[index]);
    } else {
      setEditingIndex(null);
      setFormData(emptyEducation);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const newEducations = [...educations];
    
    if (editingIndex !== null) {
      newEducations[editingIndex] = { ...newEducations[editingIndex], ...formData } as Education;
    } else {
      const newEdu = {
        ...formData,
        id: `temp-${Date.now()}`,
        profileId,
        sortOrder: educations.length,
        source: 'MANUAL' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Education;
      newEducations.push(newEdu);
    }
    
    onUpdate(newEducations);
    setIsDialogOpen(false);
    setFormData(emptyEducation);
  };

  const handleDelete = (index: number) => {
    const newEducations = educations.filter((_, i) => i !== index);
    onUpdate(newEducations);
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
              <DialogTitle>{editingIndex !== null ? 'Edit' : 'Add'} Education</DialogTitle>
            </DialogHeader>
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
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isCurrent: checked }))}
                />
                <Label>Currently studying here</Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="month"
                    value={formData.startDate ? new Date(formData.startDate).toISOString().slice(0, 7) : ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value ? new Date(e.target.value) : null }))}
                  />
                </div>
                {!formData.isCurrent && (
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="month"
                      value={formData.endDate ? new Date(formData.endDate).toISOString().slice(0, 7) : ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value ? new Date(e.target.value) : null }))}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Description / Activities</Label>
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Relevant coursework, clubs, activities..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!formData.institution}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {educations.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No education added yet. Click "Add Education" to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {educations.map((edu, index) => (
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
                        {edu.startDate && new Date(edu.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        {edu.startDate && ' - '}
                        {edu.isCurrent ? 'Present' : edu.endDate ? new Date(edu.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}
                        {edu.gpa && ` • GPA: ${edu.gpa}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(index)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(index)}>
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
