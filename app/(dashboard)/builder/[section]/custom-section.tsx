'use client';

import { ExternalLink, Eye, EyeOff, LayoutGrid, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { HeadingTagPicker } from '@/components/heading-tags/heading-tag-picker';
import { ResumeHeadingTags } from '@/components/heading-tags/resume-heading-tags';
import { CUSTOM_HEADING_TAG_PRESETS, parseHeadingTags } from '@/lib/heading-tags';
import { notifyProfileUpdated } from '@/lib/events';
import { isSubHeadingsEnabled } from '@/lib/section-subheadings';
import { cn } from '@/lib/utils';

import { SubheadingAddButton, SubheadingGroupedCards } from '../components/subheading-grouped-list';

import type { CustomSectionContent, CustomSectionItem, ProfileSection } from '@/types';
import type { DateExtractor } from '../components/sortable-card-list';

const customItemDateExtractor: DateExtractor<CustomSectionItem> = (item) => {
  const start = item.startDate ? new Date(item.startDate) : null;
  const end = item.endDate ? new Date(item.endDate) : null;
  return {
    start: start && !isNaN(start.getTime()) ? start : null,
    end: end && !isNaN(end.getTime()) ? end : null,
  };
};

interface CustomSectionProps {
  section: ProfileSection | null;
  profileId: string;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

const emptyItem: Partial<CustomSectionItem> = {
  title: '',
  subtitle: '',
  description: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  url: '',
  tags: [],
};

export function CustomSection({ section, embedded }: CustomSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CustomSectionItem | null>(null);
  const [formData, setFormData] = useState<Partial<CustomSectionItem>>(emptyItem);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeformContent, setFreeformContent] = useState('');

  // Parse existing content — use local state so toggling is instant
  const initialContent = (section?.customContent as CustomSectionContent) || { items: [] };
  const [items, setItems] = useState<CustomSectionItem[]>(initialContent.items || []);
  const contentType = section?.contentType || 'STRUCTURED';

  // Initialize freeform content
  useState(() => {
    if (contentType === 'FREEFORM' && initialContent.content) {
      setFreeformContent(initialContent.content);
    }
  });

  const handleReorder = useCallback(
    async (reordered: CustomSectionItem[]) => {
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
        <LayoutGrid className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 font-medium">Section not found</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          This custom section doesn&apos;t exist or has been deleted.
        </p>
      </div>
    );
  }

  const handleOpenDialog = (item?: CustomSectionItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({ ...item, tags: parseHeadingTags(item.tags) });
    } else {
      setEditingItem(null);
      setFormData({ ...emptyItem, id: Date.now().toString() });
    }
    setError(null);
    setIsDialogOpen(true);
  };

  const saveContent = async (newContent: CustomSectionContent) => {
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
      const newItem: CustomSectionItem = {
        id: formData.id || Date.now().toString(),
        title: formData.title || '',
        subtitle: formData.subtitle,
        description: formData.description,
        startDate: formData.startDate,
        endDate: formData.isCurrent ? undefined : formData.endDate,
        isCurrent: formData.isCurrent,
        url: formData.url,
        tags: parseHeadingTags(formData.tags),
      };

      let newItems: CustomSectionItem[];
      if (editingItem) {
        newItems = items.map((item) => (item.id === editingItem.id ? newItem : item));
      } else {
        newItems = [...items, newItem];
      }

      await saveContent({ items: newItems });

      // Refresh page to get updated content
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

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

  const toggleItemVisibility = async (item: CustomSectionItem) => {
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

  const handleSaveFreeform = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await saveContent({ content: freeformContent });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Freeform content editor
  if (contentType === 'FREEFORM') {
    const freeformContent_el = (
      <div className="space-y-3">
        {embedded && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Add your content using the text editor below
            </p>
            <Button onClick={handleSaveFreeform} disabled={isLoading} size="sm" className="gap-2">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Content
            </Button>
          </div>
        )}
        <RichTextEditor
          value={freeformContent}
          onChange={setFreeformContent}
          placeholder="Write your content here..."
          minHeight="280px"
        />
        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
      </div>
    );

    if (embedded) {
      return freeformContent_el;
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>Add your content using the text editor below</CardDescription>
            </div>
            <Button onClick={handleSaveFreeform} disabled={isLoading} className="gap-2">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Content
            </Button>
          </div>
        </CardHeader>
        <CardContent>{freeformContent_el}</CardContent>
      </Card>
    );
  }

  const addButton = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={() => handleOpenDialog()}
        size={embedded ? 'sm' : 'default'}
        className="gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Item
      </Button>
      <SubheadingAddButton section={section} disabled={isLoading} />
    </div>
  );

  const itemsList = (
    <div className={cn(!embedded && 'rounded-xl bg-muted/40 p-4')}>
      {items.length === 0 && !isSubHeadingsEnabled(section?.subHeadings) ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <LayoutGrid className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No items added yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Add items to this custom section</p>
          <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>
      ) : (
        <SubheadingGroupedCards
          section={section}
          items={items}
          onReorder={handleReorder}
          dateExtractor={customItemDateExtractor}
          disabled={isLoading}
          renderItem={(item) => (
            <div
              className={cn(
                'group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50',
                item.isVisible === false && 'opacity-50'
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium">{item.title}</h4>
                      <ResumeHeadingTags tags={parseHeadingTags(item.tags)} />
                    </div>
                    {item.subtitle && (
                      <p className="text-sm text-muted-foreground">{item.subtitle}</p>
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
                {(item.startDate || item.endDate) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.startDate}
                    {item.endDate && ` – ${item.endDate}`}
                    {item.isCurrent && ' – Present'}
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

      {error && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );

  const dialog = (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Item title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input
              id="subtitle"
              value={formData.subtitle || ''}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="Optional subtitle"
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
            <Label htmlFor="isCurrent">Currently ongoing</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <RichTextEditor
              value={formData.description || ''}
              onChange={(html) => setFormData({ ...formData, description: html })}
              placeholder="Describe this item..."
              minHeight="140px"
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

          <HeadingTagPicker
            value={parseHeadingTags(formData.tags)}
            onChange={(tags) => setFormData({ ...formData, tags })}
            presets={CUSTOM_HEADING_TAG_PRESETS}
          />

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
            {editingItem ? 'Save Changes' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Add items to your custom section</p>
          {addButton}
        </div>
        {itemsList}
        {dialog}
      </div>
    );
  }

  // Structured content editor
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>Add items to your custom section</CardDescription>
          </div>
          {addButton}
        </div>
      </CardHeader>
      <CardContent>
        {itemsList}
        {dialog}
      </CardContent>
    </Card>
  );
}
