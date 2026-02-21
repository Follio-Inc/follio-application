'use client';

import { Eye, EyeOff, Loader2, Plus, Sparkles, X } from 'lucide-react';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyProfileUpdated } from '@/lib/events';
import { cn } from '@/lib/utils';

import type { InterestItem, InterestsSectionContent, ProfileSection } from '@/types';

interface InterestsSectionProps {
  section: ProfileSection | null;
  profileId: string;
}

const SUGGESTED_CATEGORIES = [
  'Sports & Fitness',
  'Arts & Creativity',
  'Technology',
  'Music',
  'Travel',
  'Reading',
  'Gaming',
  'Food & Cooking',
  'Nature & Outdoors',
  'Community & Social',
  'Learning',
  'Other',
];

const emptyItem: Partial<InterestItem> = {
  name: '',
  category: '',
};

export function InterestsSection({ section }: InterestsSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InterestItem | null>(null);
  const [formData, setFormData] = useState<Partial<InterestItem>>(emptyItem);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse existing content — use local state so toggling is instant
  const initialContent = (section?.customContent as unknown as InterestsSectionContent) || {
    items: [],
  };
  const [items, setItems] = useState<InterestItem[]>(initialContent.items || []);

  // Group items by category
  const groupedItems = items.reduce(
    (acc, item) => {
      const category = item.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, InterestItem[]>
  );

  if (!section) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">Section not found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This section doesn&apos;t exist or has been deleted.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleOpenDialog = (item?: InterestItem) => {
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

  const saveContent = async (newContent: InterestsSectionContent) => {
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
      const newItem: InterestItem = {
        id: formData.id || Date.now().toString(),
        name: formData.name || '',
        category: formData.category,
      };

      let newItems: InterestItem[];
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
    if (!confirm('Are you sure you want to delete this interest?')) return;

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

  const toggleItemVisibility = async (item: InterestItem) => {
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

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Sports & Fitness': 'bg-green-500/10 text-green-700 border-green-500/20',
      'Arts & Creativity': 'bg-purple-500/10 text-purple-700 border-purple-500/20',
      Technology: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
      Music: 'bg-pink-500/10 text-pink-700 border-pink-500/20',
      Travel: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
      Reading: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
      Gaming: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
      'Food & Cooking': 'bg-red-500/10 text-red-700 border-red-500/20',
      'Nature & Outdoors': 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
      'Community & Social': 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
      Learning: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
    };
    return colors[category] || 'bg-gray-500/10 text-gray-700 border-gray-500/20';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Interests & Hobbies</CardTitle>
            <CardDescription>Add your personal interests and hobbies</CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Interest
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">No interests added yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Add your hobbies and interests to show your personality
            </p>
            <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Add Interest
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category}>
                <h4 className="mb-3 text-sm font-medium text-muted-foreground">{category}</h4>
                <div className="flex flex-wrap gap-2">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'group flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors hover:bg-muted/50',
                        item.isVisible === false && 'opacity-50'
                      )}
                    >
                      <span className="text-sm font-medium">{item.name}</span>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => toggleItemVisibility(item)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title={item.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                        >
                          {item.isVisible === false ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          onClick={() => handleOpenDialog(item)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <span className="sr-only">Edit</span>
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Interest' : 'Add Interest'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Interest *</Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Photography, Hiking, Chess"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_CATEGORIES.map((cat) => (
                    <Badge
                      key={cat}
                      variant={formData.category === cat ? 'default' : 'outline'}
                      className={`cursor-pointer transition-colors ${
                        formData.category === cat ? '' : getCategoryColor(cat)
                      }`}
                      onClick={() => setFormData({ ...formData, category: cat })}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
                <Input
                  id="category"
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Or type a custom category"
                  className="mt-2"
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
              <Button onClick={handleSaveItem} disabled={isLoading || !formData.name}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingItem ? 'Save Changes' : 'Add Interest'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
