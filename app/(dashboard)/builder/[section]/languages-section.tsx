'use client';

import { Eye, EyeOff, Globe, Loader2, Plus, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { notifyProfileUpdated } from '@/lib/events';
import { cn } from '@/lib/utils';

import type { LanguageItem, LanguagesSectionContent, ProfileSection } from '@/types';

interface LanguagesSectionProps {
  section: ProfileSection | null;
  profileId: string;
}

const PROFICIENCY_LEVELS = [
  { value: 'NATIVE', label: 'Native / Bilingual', description: 'Full professional proficiency' },
  { value: 'FLUENT', label: 'Fluent', description: 'Near-native fluency' },
  { value: 'ADVANCED', label: 'Advanced', description: 'Can handle complex topics' },
  { value: 'INTERMEDIATE', label: 'Intermediate', description: 'Can handle everyday situations' },
  { value: 'BASIC', label: 'Basic', description: 'Limited working proficiency' },
] as const;

const emptyItem: Partial<LanguageItem> = {
  language: '',
  proficiency: 'INTERMEDIATE',
};

export function LanguagesSection({ section }: LanguagesSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LanguageItem | null>(null);
  const [formData, setFormData] = useState<Partial<LanguageItem>>(emptyItem);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse existing content — use local state so toggling is instant
  const initialContent = (section?.customContent as unknown as LanguagesSectionContent) || {
    items: [],
  };
  const [items, setItems] = useState<LanguageItem[]>(initialContent.items || []);

  if (!section) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Globe className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">Section not found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This section doesn&apos;t exist or has been deleted.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleOpenDialog = (item?: LanguageItem) => {
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

  const saveContent = async (newContent: LanguagesSectionContent) => {
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
      const newItem: LanguageItem = {
        id: formData.id || Date.now().toString(),
        language: formData.language || '',
        proficiency: formData.proficiency || 'INTERMEDIATE',
      };

      let newItems: LanguageItem[];
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
    if (!confirm('Are you sure you want to delete this language?')) return;

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

  const toggleItemVisibility = async (item: LanguageItem) => {
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

  const getProficiencyColor = (proficiency: string) => {
    switch (proficiency) {
      case 'NATIVE':
        return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'FLUENT':
        return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'ADVANCED':
        return 'bg-purple-500/10 text-purple-700 border-purple-500/20';
      case 'INTERMEDIATE':
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
      case 'BASIC':
        return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
      default:
        return '';
    }
  };

  const getProficiencyLabel = (proficiency: string) => {
    return PROFICIENCY_LEVELS.find((p) => p.value === proficiency)?.label || proficiency;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Languages</CardTitle>
            <CardDescription>Add languages you speak and your proficiency level</CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Language
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Globe className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">No languages added yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Add languages to show your multilingual abilities
            </p>
            <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Add Language
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
                  item.isVisible === false && 'opacity-50'
                )}
              >
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{item.language}</span>
                </div>
                <Badge variant="outline" className={getProficiencyColor(item.proficiency)}>
                  {getProficiencyLabel(item.proficiency)}
                </Badge>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => toggleItemVisibility(item)}
                    title={item.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                  >
                    {item.isVisible === false ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => handleOpenDialog(item)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteItem(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Language' : 'Add Language'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="language">Language *</Label>
                <Input
                  id="language"
                  value={formData.language || ''}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  placeholder="e.g., English, Spanish, Mandarin"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="proficiency">Proficiency Level *</Label>
                <Select
                  value={formData.proficiency}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      proficiency: value as LanguageItem['proficiency'],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select proficiency" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFICIENCY_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        <div className="flex flex-col">
                          <span>{level.label}</span>
                          <span className="text-xs text-muted-foreground">{level.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Button onClick={handleSaveItem} disabled={isLoading || !formData.language}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingItem ? 'Save Changes' : 'Add Language'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
