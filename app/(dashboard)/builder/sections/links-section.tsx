'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical, ExternalLink, Github, Linkedin, Twitter, Globe, Mail, Youtube, Instagram, Facebook, Link as LinkIcon } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

import type { Link } from '@/types';

interface LinksSectionProps {
  links: Link[];
  profileId: string;
  onUpdate: (links: Link[]) => void;
}

const LINK_TYPES = [
  { value: 'WEBSITE', label: 'Website', icon: Globe },
  { value: 'GITHUB', label: 'GitHub', icon: Github },
  { value: 'LINKEDIN', label: 'LinkedIn', icon: Linkedin },
  { value: 'TWITTER', label: 'Twitter / X', icon: Twitter },
  { value: 'EMAIL', label: 'Email', icon: Mail },
  { value: 'YOUTUBE', label: 'YouTube', icon: Youtube },
  { value: 'INSTAGRAM', label: 'Instagram', icon: Instagram },
  { value: 'FACEBOOK', label: 'Facebook', icon: Facebook },
  { value: 'DRIBBBLE', label: 'Dribbble', icon: Globe },
  { value: 'BEHANCE', label: 'Behance', icon: Globe },
  { value: 'MEDIUM', label: 'Medium', icon: Globe },
  { value: 'DEVTO', label: 'DEV.to', icon: Globe },
  { value: 'STACKOVERFLOW', label: 'Stack Overflow', icon: Globe },
  { value: 'RESUME', label: 'Resume', icon: ExternalLink },
  { value: 'CALENDLY', label: 'Calendly', icon: Globe },
  { value: 'OTHER', label: 'Other', icon: LinkIcon },
] as const;

const getIconForType = (type: string) => {
  const linkType = LINK_TYPES.find((t) => t.value === type);
  return linkType?.icon || LinkIcon;
};

const emptyLink: Partial<Link> = {
  type: 'WEBSITE',
  label: '',
  url: '',
  isPrimary: false,
};

export function LinksSection({ links, profileId, onUpdate }: LinksSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Link>>(emptyLink);

  const handleOpenDialog = (index?: number) => {
    if (index !== undefined) {
      setEditingIndex(index);
      setFormData(links[index]);
    } else {
      setEditingIndex(null);
      setFormData(emptyLink);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const newLinks = [...links];
    
    // Auto-generate label if not provided
    const label = formData.label?.trim() || LINK_TYPES.find((t) => t.value === formData.type)?.label || 'Link';
    
    if (editingIndex !== null) {
      newLinks[editingIndex] = { ...newLinks[editingIndex], ...formData, label } as Link;
    } else {
      const newLink = {
        ...formData,
        label,
        id: `temp-${Date.now()}`,
        profileId,
        sortOrder: links.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Link;
      newLinks.push(newLink);
    }
    
    onUpdate(newLinks);
    setIsDialogOpen(false);
    setFormData(emptyLink);
  };

  const handleDelete = (index: number) => {
    const newLinks = links.filter((_, i) => i !== index);
    onUpdate(newLinks);
  };

  const getPlaceholderForType = (type: string) => {
    switch (type) {
      case 'GITHUB':
        return 'https://github.com/username';
      case 'LINKEDIN':
        return 'https://linkedin.com/in/username';
      case 'TWITTER':
        return 'https://x.com/username';
      case 'EMAIL':
        return 'mailto:you@example.com';
      case 'YOUTUBE':
        return 'https://youtube.com/@channel';
      case 'CALENDLY':
        return 'https://calendly.com/username';
      default:
        return 'https://example.com';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Links & Social</CardTitle>
          <CardDescription>Add your online presence and social profiles</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Link
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingIndex !== null ? 'Edit' : 'Add'} Link</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Link Type</Label>
                <Select
                  value={formData.type || 'WEBSITE'}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value as Link['type'] }))}
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
                  placeholder={getPlaceholderForType(formData.type || 'WEBSITE')}
                />
              </div>

              <div className="space-y-2">
                <Label>Label (optional)</Label>
                <Input
                  value={formData.label || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder={LINK_TYPES.find((t) => t.value === formData.type)?.label || 'Custom label'}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the default label for this link type
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!formData.url}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {links.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No links added yet. Click "Add Link" to connect your social profiles.
          </div>
        ) : (
          <div className="space-y-2">
            {links.map((link, index) => {
              const Icon = getIconForType(link.type);
              return (
                <div
                  key={link.id}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="cursor-move text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{link.label || link.type}</div>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary truncate"
                    >
                      {link.url}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(index)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
