'use client';

import { BookOpen, ExternalLink, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';

import { SortableCardList } from '../components/sortable-card-list';

import type { ProfileSection, PublicationItem, PublicationsSectionContent } from '@/types';
import type { DateExtractor } from '../components/sortable-card-list';

const publicationDateExtractor: DateExtractor<PublicationItem> = (item) => {
  if (!item.date) return { start: null, end: null };
  const parsed = new Date(item.date);
  return { start: isNaN(parsed.getTime()) ? null : parsed, end: null };
};

interface PublicationsSectionProps {
  section: ProfileSection | null;
  profileId: string;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

const emptyItem: Partial<PublicationItem> = {
  title: '',
  publisher: '',
  authors: '',
  date: '',
  description: '',
  url: '',
  doi: '',
};

export function PublicationsSection({ section, embedded }: PublicationsSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PublicationItem | null>(null);
  const [formData, setFormData] = useState<Partial<PublicationItem>>(emptyItem);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse existing content — use local state so toggling is instant
  const initialContent = (section?.customContent as unknown as PublicationsSectionContent) || {
    items: [],
  };
  const [items, setItems] = useState<PublicationItem[]>(initialContent.items || []);

  const handleReorder = useCallback(
    async (reordered: PublicationItem[]) => {
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
        <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 font-medium">Section not found</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          This section doesn&apos;t exist or has been deleted.
        </p>
      </div>
    );
  }

  const handleOpenDialog = (item?: PublicationItem) => {
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

  const saveContent = async (newContent: PublicationsSectionContent) => {
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
      const newItem: PublicationItem = {
        id: formData.id || Date.now().toString(),
        title: formData.title || '',
        publisher: formData.publisher,
        authors: formData.authors,
        date: formData.date,
        description: formData.description,
        url: formData.url,
        doi: formData.doi,
      };

      let newItems: PublicationItem[];
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
    if (!confirm('Are you sure you want to delete this publication?')) return;

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

  const toggleItemVisibility = async (item: PublicationItem) => {
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
      Add Publication
    </Button>
  );

  const publicationsList = (
    <div className={cn(!embedded && 'rounded-xl bg-muted/40 p-4')}>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No publications added yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your research papers, articles, and other publications
          </p>
          <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Add Publication
          </Button>
        </div>
      ) : (
        <SortableCardList
          items={items}
          onReorder={handleReorder}
          dateExtractor={publicationDateExtractor}
          disabled={isLoading}
          renderItem={(item) => (
            <div
              className={cn(
                'group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50',
                item.isVisible === false && 'opacity-50'
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-medium">{item.title}</h4>
                    {item.authors && (
                      <p className="text-sm text-muted-foreground">{item.authors}</p>
                    )}
                    {item.publisher && (
                      <p className="text-sm text-muted-foreground">
                        Published in: {item.publisher}
                      </p>
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
                {item.date && <p className="mt-1 text-xs text-muted-foreground">{item.date}</p>}
                {item.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View publication <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {item.doi && (
                    <a
                      href={`https://doi.org/${item.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      DOI: {item.doi}
                    </a>
                  )}
                </div>
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
          <DialogTitle>{editingItem ? 'Edit Publication' : 'Add Publication'}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Publication title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authors">Authors</Label>
            <Input
              id="authors"
              value={formData.authors || ''}
              onChange={(e) => setFormData({ ...formData, authors: e.target.value })}
              placeholder="e.g., John Doe, Jane Smith"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="publisher">Publisher / Journal / Conference</Label>
            <Input
              id="publisher"
              value={formData.publisher || ''}
              onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
              placeholder="Where it was published"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Publication Date</Label>
            <Input
              id="date"
              value={formData.date || ''}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              placeholder="e.g., January 2024"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Abstract / Description</Label>
            <RichTextEditor
              value={formData.description || ''}
              onChange={(html) => setFormData({ ...formData, description: html })}
              placeholder="Brief summary of the publication..."
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

          <div className="space-y-2">
            <Label htmlFor="doi">DOI (optional)</Label>
            <Input
              id="doi"
              value={formData.doi || ''}
              onChange={(e) => setFormData({ ...formData, doi: e.target.value })}
              placeholder="10.1000/xyz123"
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
          <Button onClick={handleSaveItem} disabled={isLoading || !formData.title}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingItem ? 'Save Changes' : 'Add Publication'}
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
            Add papers, articles, books, and other publications
          </p>
          {addButton}
        </div>
        {publicationsList}
        {dialog}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Publications</CardTitle>
            <CardDescription>Add papers, articles, books, and other publications</CardDescription>
          </div>
          {addButton}
        </div>
      </CardHeader>
      <CardContent>
        {publicationsList}
        {dialog}
      </CardContent>
    </Card>
  );
}
