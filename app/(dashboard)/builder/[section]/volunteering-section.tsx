'use client';

import { ExternalLink, Eye, EyeOff, Heart, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { notifyProfileUpdated } from '@/lib/events';
import { cn } from '@/lib/utils';

import { SortableCardList } from '../components/sortable-card-list';

import type { ProfileSection, VolunteeringItem, VolunteeringSectionContent } from '@/types';
import type { DateExtractor } from '../components/sortable-card-list';

/**
 * Parses free-text dates like "Jan 2023" into Date objects for sorting.
 * Returns null if parsing fails.
 */
function parseFreeTextDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

const volunteeringDateExtractor: DateExtractor<VolunteeringItem> = (item) => ({
  start: parseFreeTextDate(item.startDate),
  end: parseFreeTextDate(item.endDate),
});

interface VolunteeringSectionProps {
  section: ProfileSection | null;
  profileId: string;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

const emptyItem: Partial<VolunteeringItem> = {
  organization: '',
  role: '',
  cause: '',
  description: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  url: '',
};

export function VolunteeringSection({ section, embedded }: VolunteeringSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VolunteeringItem | null>(null);
  const [formData, setFormData] = useState<Partial<VolunteeringItem>>(emptyItem);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse existing content — use local state so toggling is instant
  const initialContent = (section?.customContent as unknown as VolunteeringSectionContent) || {
    items: [],
  };
  const [items, setItems] = useState<VolunteeringItem[]>(initialContent.items || []);

  const handleReorder = useCallback(
    async (reordered: VolunteeringItem[]) => {
      if (!section) return;
      setItems(reordered);
      try {
        const response = await fetch(`/api/profile/sections/${section.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customContent: { items: reordered } }),
        });
        if (!response.ok) throw new Error('Failed to save');
        notifyProfileUpdated();
      } catch {
        setItems(items);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, section]
  );

  if (!section) {
    return (
      <div className="py-12 text-center">
        <Heart className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 font-medium">Section not found</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          This section doesn&apos;t exist or has been deleted.
        </p>
      </div>
    );
  }

  const handleOpenDialog = (item?: VolunteeringItem) => {
    if (item) {
      setEditingItem(item);
      setFormData(item);
    } else {
      setEditingItem(null);
      setFormData({ ...emptyItem, id: Date.now().toString() });
    }
    setError(null);
    setIsDialogOpen(true);
  };

  const saveContent = async (newContent: VolunteeringSectionContent) => {
    const response = await fetch(`/api/profile/sections/${section.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customContent: newContent }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save');
    }

    return response.json();
  };

  const handleSaveItem = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const newItem: VolunteeringItem = {
        id: formData.id || Date.now().toString(),
        organization: formData.organization || '',
        role: formData.role || '',
        cause: formData.cause,
        description: formData.description,
        startDate: formData.startDate,
        endDate: formData.isCurrent ? undefined : formData.endDate,
        isCurrent: formData.isCurrent,
        url: formData.url,
      };

      let newItems: VolunteeringItem[];
      if (editingItem) {
        newItems = items.map((item) => (item.id === editingItem.id ? newItem : item));
      } else {
        newItems = [...items, newItem];
      }

      await saveContent({ items: newItems });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this volunteering experience?')) return;

    setIsLoading(true);
    try {
      const newItems = items.filter((item) => item.id !== itemId);
      await saveContent({ items: newItems });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItemVisibility = async (item: VolunteeringItem) => {
    const newValue = !(item.isVisible ?? true);
    const newItems = items.map((i) => (i.id === item.id ? { ...i, isVisible: newValue } : i));
    // Optimistic update
    setItems(newItems);
    try {
      await saveContent({ items: newItems });
      notifyProfileUpdated();
    } catch {
      // Revert on error
      setItems(items);
    }
  };

  const addButton = (
    <Button onClick={() => handleOpenDialog()} size={embedded ? 'sm' : 'default'} className="gap-2">
      <Plus className="h-4 w-4" />
      Add Experience
    </Button>
  );

  const volunteeringList = (
    <div className={cn(!embedded && 'rounded-xl bg-muted/40 p-4')}>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Heart className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No volunteering added yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add volunteer experiences to showcase your community involvement
          </p>
          <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Add Experience
          </Button>
        </div>
      ) : (
        <SortableCardList
          items={items}
          onReorder={handleReorder}
          dateExtractor={volunteeringDateExtractor}
          disabled={isLoading}
          renderItem={(item) => (
            <div
              className={cn(
                'group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50',
                item.isVisible === false && 'opacity-50'
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Heart className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-medium">{item.role}</h4>
                    <p className="text-sm text-muted-foreground">{item.organization}</p>
                    {item.cause && (
                      <p className="text-xs text-muted-foreground">Cause: {item.cause}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleItemVisibility(item)}
                      title={item.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                    >
                      {item.isVisible === false ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenDialog(item)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteItem(item.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {(item.startDate || item.endDate || item.isCurrent) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.startDate}
                    {(item.endDate || item.isCurrent) && ' — '}
                    {item.isCurrent ? 'Present' : item.endDate}
                  </p>
                )}
                {item.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                )}
                {item.url && (
                  <a
                    href={item.url}
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
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingItem ? 'Edit Volunteering' : 'Add Volunteering'}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4">
          <div className="space-y-2">
            <Label htmlFor="organization">Organization *</Label>
            <Input
              id="organization"
              value={formData.organization || ''}
              onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
              placeholder="Organization name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Input
              id="role"
              value={formData.role || ''}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              placeholder="Your role or position"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cause">Cause</Label>
            <Input
              id="cause"
              value={formData.cause || ''}
              onChange={(e) => setFormData({ ...formData, cause: e.target.value })}
              placeholder="e.g., Education, Environment, Health"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                value={formData.startDate || ''}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                placeholder="e.g., Jan 2023"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                value={formData.endDate || ''}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                placeholder="e.g., Dec 2023"
                disabled={formData.isCurrent}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="isCurrent"
              checked={formData.isCurrent || false}
              onCheckedChange={(checked) => setFormData({ ...formData, isCurrent: checked })}
            />
            <Label htmlFor="isCurrent">I currently volunteer here</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <RichTextEditor
              value={formData.description || ''}
              onChange={(html) => setFormData({ ...formData, description: html })}
              placeholder="Describe your contributions and impact..."
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
          <Button
            onClick={handleSaveItem}
            disabled={isLoading || !formData.organization || !formData.role}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingItem ? 'Save Changes' : 'Add Experience'}
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
            Add your volunteer work and community involvement
          </p>
          {addButton}
        </div>
        {volunteeringList}
        {dialog}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Volunteering</CardTitle>
            <CardDescription>Add your volunteer work and community involvement</CardDescription>
          </div>
          {addButton}
        </div>
      </CardHeader>
      <CardContent>
        {volunteeringList}
        {dialog}
      </CardContent>
    </Card>
  );
}
