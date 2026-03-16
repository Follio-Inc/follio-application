'use client';

import {
  Award,
  BadgeCheck,
  BookOpen,
  FileText,
  Globe,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import type { ProfileSection, SectionType } from '@/types';

// Available section types that can be added
const AVAILABLE_SECTIONS: {
  type: SectionType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    type: 'SUMMARY',
    title: 'Summary',
    description: 'A professional summary or about section',
    icon: FileText,
  },
  {
    type: 'PHOTOS',
    title: 'Photos',
    description: 'Profile photo and gallery images for your portfolio',
    icon: ImageIcon,
  },
  {
    type: 'AWARDS',
    title: 'Awards',
    description: 'Showcase your achievements and recognitions',
    icon: Award,
  },
  {
    type: 'CERTIFICATIONS',
    title: 'Certifications',
    description: 'List your professional certifications',
    icon: BadgeCheck,
  },
  {
    type: 'PUBLICATIONS',
    title: 'Publications',
    description: 'Share your published work and articles',
    icon: BookOpen,
  },
  {
    type: 'VOLUNTEERING',
    title: 'Volunteering',
    description: 'Highlight your community involvement',
    icon: Heart,
  },
  {
    type: 'LANGUAGES',
    title: 'Languages',
    description: 'List the languages you speak',
    icon: Globe,
  },
  {
    type: 'INTERESTS',
    title: 'Interests',
    description: 'Share your hobbies and interests',
    icon: Sparkles,
  },
  {
    type: 'CUSTOM',
    title: 'Custom Section',
    description: 'Create your own custom section',
    icon: LayoutGrid,
  },
];

interface AddSectionDialogProps {
  existingSections: ProfileSection[];
  onAdd: (type: SectionType, customName?: string, title?: string) => Promise<void>;
}

export function AddSectionDialog({ existingSections, onAdd }: AddSectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<SectionType | null>(null);
  const [customName, setCustomName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Filter out sections that already exist (except CUSTOM which can be added multiple times)
  const availableSections = AVAILABLE_SECTIONS.filter((section) => {
    if (section.type === 'CUSTOM') return true;
    return !existingSections.some((existing) => existing.type === section.type);
  });

  const handleAdd = async () => {
    if (!selectedType) return;

    if (selectedType === 'CUSTOM' && !customName.trim()) {
      return;
    }

    setIsAdding(true);
    try {
      await onAdd(
        selectedType,
        selectedType === 'CUSTOM' ? customName.trim() : undefined,
        selectedType === 'CUSTOM' ? customName.trim() : undefined
      );
      setOpen(false);
      setSelectedType(null);
      setCustomName('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSelectedType(null);
      setCustomName('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Add Section
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Section</DialogTitle>
          <DialogDescription>Choose a section type to add to your profile</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Section Type Selection */}
          <div className="grid gap-2">
            {availableSections.map((section) => {
              const Icon = section.icon;
              const isSelected = selectedType === section.type;

              return (
                <button
                  key={section.type}
                  onClick={() => setSelectedType(section.type)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  )}
                >
                  <div
                    className={cn(
                      'rounded-md p-2',
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{section.title}</p>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Section Name Input */}
          {selectedType === 'CUSTOM' && (
            <div className="space-y-2">
              <Label htmlFor="customName">Section Name</Label>
              <Input
                id="customName"
                placeholder="e.g., Hobbies, Publications, Speaking..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {/* No More Sections Message */}
          {availableSections.length === 1 && availableSections[0].type === 'CUSTOM' && (
            <p className="text-center text-sm text-muted-foreground">
              All standard sections have been added. You can create custom sections below.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={
              !selectedType || (selectedType === 'CUSTOM' && !customName.trim()) || isAdding
            }
          >
            {isAdding ? 'Adding...' : 'Add Section'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
