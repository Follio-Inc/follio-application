'use client';

import { Award, ExternalLink, Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';

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
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { notifyProfileUpdated } from '@/lib/events';
import { useReorderPersist } from '@/lib/hooks/use-reorder-persist';
import { cn } from '@/lib/utils';

import { SortableCardList } from '../components/sortable-card-list';

import type { Award as AwardType } from '@/types';
import type { DateExtractor } from '../components/sortable-card-list';

const awardDateExtractor: DateExtractor<AwardType> = (award) => ({
  start: award.date ? new Date(award.date) : null,
  end: null,
});

interface AwardsSectionProps {
  awards: AwardType[];
  profileId: string;
  onUpdate: (awards: AwardType[]) => void;
  autoEditId?: string | 'new';
  onEditComplete?: () => void;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

const emptyAward: Partial<AwardType> = {
  title: '',
  issuer: '',
  date: undefined,
  description: '',
  url: '',
};

export function AwardsSection({
  awards,
  onUpdate,
  autoEditId,
  onEditComplete,
  embedded,
}: AwardsSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(!!autoEditId);
  const [editingAward, setEditingAward] = useState<AwardType | null>(() => {
    if (autoEditId && autoEditId !== 'new') {
      return awards.find((a) => a.id === autoEditId) ?? null;
    }
    return null;
  });
  const [formData, setFormData] = useState<Partial<AwardType>>(() => {
    if (autoEditId && autoEditId !== 'new') {
      const a = awards.find((a) => a.id === autoEditId);
      return a ? { ...a, date: a.date ? new Date(a.date) : undefined } : { ...emptyAward };
    }
    return { ...emptyAward };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistOrder = useReorderPersist<AwardType>('award', onUpdate);

  const handleReorder = useCallback(
    (reordered: AwardType[]) => {
      persistOrder(reordered, awards);
    },
    [persistOrder, awards]
  );

  const toggleVisibility = async (award: AwardType) => {
    const newValue = !(award.isVisible ?? true);
    // Optimistic update
    onUpdate(awards.map((a) => (a.id === award.id ? { ...a, isVisible: newValue } : a)));
    try {
      const response = await fetch(`/api/profile/awards/${award.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: newValue }),
      });
      if (!response.ok) throw new Error('Failed to update visibility');
      notifyProfileUpdated();
    } catch {
      // Revert on error
      onUpdate(awards.map((a) => (a.id === award.id ? { ...a, isVisible: !newValue } : a)));
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open && autoEditId) onEditComplete?.();
  };

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
      if (autoEditId) onEditComplete?.();
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
    if (Number.isNaN(d.getTime())) return '';
    // Month-precision dates are stored as UTC; format in UTC to keep the month stable.
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  // ── Inline form (auto-edit mode) ──

  const renderInlineForm = () => (
    <div className="space-y-4 rounded-lg border-2 border-primary/30 bg-muted/30 p-4 shadow-md ring-2 ring-primary/10">
      <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        {editingAward ? 'Editing award' : 'Adding new award'} — save or discard to continue
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-2">
        <Label>Award Title *</Label>
        <Input
          value={formData.title || ''}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Best Innovation Award"
        />
      </div>

      <div className="space-y-2">
        <Label>Issuing Organization</Label>
        <Input
          value={formData.issuer || ''}
          onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
          placeholder="Company or organization name"
        />
      </div>

      <div className="space-y-2">
        <Label>Date Received</Label>
        <Input
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
        <Label>Description</Label>
        <RichTextEditor
          value={formData.description || ''}
          onChange={(html) => setFormData({ ...formData, description: html })}
          placeholder="Brief description of the award..."
          minHeight="120px"
        />
      </div>

      <div className="space-y-2">
        <Label>Link (optional)</Label>
        <Input
          type="url"
          value={formData.url || ''}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button
          onClick={handleSave}
          disabled={!formData.title || isLoading}
          size="sm"
          className="gap-2"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEditComplete?.()}
          disabled={isLoading}
          className="gap-2"
        >
          <X className="mr-1 h-4 w-4" />
          Discard
        </Button>
      </div>
    </div>
  );

  // Auto-edit mode: render only the inline form
  if (autoEditId) {
    return renderInlineForm();
  }

  const addButton = (
    <Button onClick={() => handleOpenDialog()} size={embedded ? 'sm' : 'default'} className="gap-2">
      <Plus className="h-4 w-4" />
      Add Award
    </Button>
  );

  const awardsList = (
    <div className={cn(!embedded && 'rounded-xl bg-muted/40 p-4')}>
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
        <SortableCardList
          items={awards}
          onReorder={handleReorder}
          dateExtractor={awardDateExtractor}
          disabled={isLoading}
          renderItem={(award) => (
            <div
              className={cn(
                'group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50',
                award.isVisible === false && 'opacity-50'
              )}
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
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleVisibility(award)}
                      title={award.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                    >
                      {award.isVisible === false ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenDialog(award)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(award.id)}
                      title="Delete"
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
          )}
        />
      )}
    </div>
  );

  const dialog = (
    <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
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
            <RichTextEditor
              value={formData.description || ''}
              onChange={(html) => setFormData({ ...formData, description: html })}
              placeholder="Brief description of the award..."
              minHeight="120px"
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
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
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
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Add awards, honors, and recognition you&apos;ve received
          </p>
          {addButton}
        </div>
        {awardsList}
        {dialog}
      </div>
    );
  }

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
          {addButton}
        </div>
      </CardHeader>
      <CardContent>
        {awardsList}
        {dialog}
      </CardContent>
    </Card>
  );
}
