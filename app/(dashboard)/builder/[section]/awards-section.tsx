'use client';

import { Award, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { Award as AwardType } from '@/types';

interface AwardsSectionProps {
  awards: AwardType[];
  profileId: string;
  onUpdate: (awards: AwardType[]) => void;
}

const emptyAward: Partial<AwardType> = {
  title: '',
  issuer: '',
  date: undefined,
  description: '',
  url: '',
};

export function AwardsSection({ awards, profileId, onUpdate }: AwardsSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAward, setEditingAward] = useState<AwardType | null>(null);
  const [formData, setFormData] = useState<Partial<AwardType>>(emptyAward);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenDialog = (award?: AwardType) => {
    if (award) {
      setEditingAward(award);
      setFormData({
        ...award,
        date: award.date ? new Date(award.date) : undefined,
      });
    } else {
      setEditingAward(null);
      setFormData(emptyAward);
    }
    setError(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        title: formData.title,
        issuer: formData.issuer || undefined,
        date: formData.date || undefined,
        description: formData.description || undefined,
        url: formData.url || undefined,
      };

      if (editingAward) {
        const response = await fetch(`/api/profile/awards/${editingAward.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update award');
        }

        const { award } = await response.json();
        const updatedAwards = awards.map((a) => (a.id === editingAward.id ? award : a));
        onUpdate(updatedAwards);
      } else {
        const response = await fetch('/api/profile/awards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create award');
        }

        const { award } = await response.json();
        onUpdate([...awards, award]);
      }

      setIsDialogOpen(false);
      setFormData(emptyAward);
      setEditingAward(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (awardId: string) => {
    if (!confirm('Are you sure you want to delete this award?')) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/awards/${awardId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete award');
      }

      onUpdate(awards.filter((a) => a.id !== awardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Awards & Recognition</CardTitle>
            <CardDescription>
              Add awards, honors, and recognition you&apos;ve received
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Award
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {awards.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Award className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">No awards added yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Add awards and recognition to highlight your achievements
            </p>
            <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Add Award
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {awards.map((award) => (
              <div
                key={award.id}
                className="group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-medium">{award.title}</h4>
                      {award.issuer && (
                        <p className="text-sm text-muted-foreground">{award.issuer}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(award)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(award.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {award.date && (
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(award.date)}</p>
                  )}
                  {award.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {award.description}
                    </p>
                  )}
                  {award.url && (
                    <a
                      href={award.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View details <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingAward ? 'Edit Award' : 'Add Award'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Award Title *</Label>
                <Input
                  id="title"
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Best Innovation Award"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="issuer">Issuing Organization</Label>
                <Input
                  id="issuer"
                  value={formData.issuer || ''}
                  onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
                  placeholder="Company or organization name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date Received</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date ? new Date(formData.date).toISOString().split('T')[0] : ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      date: e.target.value ? new Date(e.target.value) : undefined,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the award..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="url">Link (optional)</Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url || ''}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !formData.title}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingAward ? 'Save Changes' : 'Add Award'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
