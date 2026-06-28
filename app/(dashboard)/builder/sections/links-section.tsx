'use client';

import {
  ExternalLink,
  Eye,
  EyeOff,
  Github,
  Globe,
  Linkedin,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Twitter,
  X,
  Youtube,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { SortableCardList } from '@/app/(dashboard)/builder/components';
import { useReorderPersist } from '@/lib/hooks/use-reorder-persist';

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
import { notifyProfileUpdated } from '@/lib/events';
import { cn } from '@/lib/utils';

import type { Link } from '@/types';

interface LinksSectionProps {
  links: Link[];
  profileId: string;
  onUpdate: (links: Link[]) => void;
  autoEditId?: string | 'new';
  onEditComplete?: () => void;
}

const LINK_TYPES = [
  { value: 'GITHUB', label: 'GitHub', icon: Github },
  { value: 'LINKEDIN', label: 'LinkedIn', icon: Linkedin },
  { value: 'TWITTER', label: 'Twitter / X', icon: Twitter },
  { value: 'PORTFOLIO', label: 'Portfolio', icon: Globe },
  { value: 'BLOG', label: 'Blog', icon: Globe },
  { value: 'DRIBBBLE', label: 'Dribbble', icon: Globe },
  { value: 'BEHANCE', label: 'Behance', icon: Globe },
  { value: 'YOUTUBE', label: 'YouTube', icon: Youtube },
  { value: 'OTHER', label: 'Other', icon: LinkIcon },
] as const;

const getIconForType = (type: string) => {
  const linkType = LINK_TYPES.find((t) => t.value === type);
  return linkType?.icon || LinkIcon;
};

const emptyLink: Partial<Link> = {
  type: 'GITHUB',
  label: '',
  url: '',
};

const getPlaceholderForType = (type: string) => {
  switch (type) {
    case 'GITHUB':
      return 'https://github.com/username';
    case 'LINKEDIN':
      return 'https://linkedin.com/in/username';
    case 'TWITTER':
      return 'https://x.com/username';
    case 'YOUTUBE':
      return 'https://youtube.com/@channel';
    case 'PORTFOLIO':
      return 'https://myportfolio.com';
    case 'BLOG':
      return 'https://myblog.com';
    default:
      return 'https://example.com';
  }
};

export function LinksSection({ links, onUpdate, autoEditId, onEditComplete }: LinksSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(!!autoEditId);
  const [editingLink, setEditingLink] = useState<Link | null>(() => {
    if (autoEditId && autoEditId !== 'new') {
      return links.find((l) => l.id === autoEditId) ?? null;
    }
    return null;
  });
  const [formData, setFormData] = useState<Partial<Link>>(() => {
    if (autoEditId && autoEditId !== 'new') {
      const link = links.find((l) => l.id === autoEditId);
      return link ? { ...link } : { ...emptyLink };
    }
    return { ...emptyLink };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistOrder = useReorderPersist<Link>('link', onUpdate);
  const handleReorder = useCallback(
    (reordered: Link[]) => {
      persistOrder(reordered, links);
    },
    [persistOrder, links]
  );

  // ── Inline form (auto-edit mode) ──

  const renderInlineForm = () => (
    <div className="space-y-4 rounded-lg border border-primary/20 bg-card p-4 ring-1 ring-primary/10">
      <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        {editingLink ? 'Editing link' : 'Adding new link'} — save or discard to continue
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-2">
        <Label>Link Type</Label>
        <Select
          value={formData.type || 'GITHUB'}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, type: value as Link['type'] }))
          }
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {LINK_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <SelectItem key={type.value} value={type.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {type.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>URL *</Label>
        <Input
          value={formData.url || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
          placeholder={getPlaceholderForType(formData.type || 'GITHUB')}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label>Label (optional)</Label>
        <Input
          value={formData.label || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          placeholder={LINK_TYPES.find((t) => t.value === formData.type)?.label || 'Custom label'}
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Leave blank to use the default label for this link type
        </p>
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button
          onClick={handleSave}
          disabled={!formData.url || isLoading}
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

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open && autoEditId) onEditComplete?.();
  };

  const handleOpenDialog = (link?: Link) => {
    if (link) {
      setEditingLink(link);
      setFormData(link);
    } else {
      setEditingLink(null);
      setFormData(emptyLink);
    }
    setError(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check for duplicate URL (excluding the link being edited)
      const normalizedUrl = formData.url?.toLowerCase().trim();
      const isDuplicate = links.some(
        (link) => link.id !== editingLink?.id && link.url.toLowerCase().trim() === normalizedUrl
      );

      if (isDuplicate) {
        setError('This URL already exists in your links');
        setIsLoading(false);
        return;
      }

      // Auto-generate label if not provided
      const label =
        formData.label?.trim() ||
        LINK_TYPES.find((t) => t.value === formData.type)?.label ||
        'Link';

      const payload = {
        type: formData.type,
        url: formData.url,
        label,
      };

      if (editingLink) {
        // Update existing link
        const response = await fetch(`/api/profile/links/${editingLink.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update link');
        }

        const { link } = await response.json();
        const updatedLinks = links.map((l) => (l.id === editingLink.id ? link : l));
        onUpdate(updatedLinks);
      } else {
        // Create new link
        const response = await fetch('/api/profile/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create link');
        }

        const { link } = await response.json();
        onUpdate([...links, link]);
      }

      setIsDialogOpen(false);
      setFormData(emptyLink);
      setEditingLink(null);
      if (autoEditId) onEditComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (linkId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/links/${linkId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete link');
      }

      onUpdate(links.filter((l) => l.id !== linkId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVisibility = async (link: Link) => {
    const newValue = !(link.isVisible ?? true);
    // Optimistic update
    onUpdate(links.map((l) => (l.id === link.id ? { ...l, isVisible: newValue } : l)));
    try {
      const response = await fetch(`/api/profile/links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: newValue }),
      });
      if (!response.ok) throw new Error('Failed to update visibility');
      notifyProfileUpdated();
    } catch {
      // Revert on error
      onUpdate(links.map((l) => (l.id === link.id ? { ...l, isVisible: !newValue } : l)));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Links & Social</CardTitle>
            <CardDescription>Add your online presence and social profiles</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Link
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingLink ? 'Edit' : 'Add'} Link</DialogTitle>
              </DialogHeader>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Link Type</Label>
                  <Select
                    value={formData.type || 'GITHUB'}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, type: value as Link['type'] }))
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {LINK_TYPES.map((type) => {
                        const Icon = type.icon;
                        return (
                          <SelectItem key={type.value} value={type.value}>
                            <span className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {type.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>URL *</Label>
                  <Input
                    value={formData.url || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
                    placeholder={getPlaceholderForType(formData.type || 'GITHUB')}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input
                    value={formData.label || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                    placeholder={
                      LINK_TYPES.find((t) => t.value === formData.type)?.label || 'Custom label'
                    }
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use the default label for this link type
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!formData.url || isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {links.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <LinkIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No links added</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Click &quot;Add Link&quot; to connect your social profiles.
            </p>
          </div>
        ) : (
          <SortableCardList
            items={links}
            onReorder={handleReorder}
            renderItem={(link) => {
              const Icon = getIconForType(link.type);
              return (
                <div
                  className={cn(
                    'group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
                    link.isVisible === false && 'opacity-50'
                  )}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{link.label || link.type}</span>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-1 truncate text-sm text-muted-foreground hover:text-primary"
                    >
                      {link.url}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleVisibility(link)}
                      title={link.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                    >
                      {link.isVisible === false ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenDialog(link)}
                      disabled={isLoading}
                      title="Edit link"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(link.id)}
                      disabled={isLoading}
                      title="Delete link"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
