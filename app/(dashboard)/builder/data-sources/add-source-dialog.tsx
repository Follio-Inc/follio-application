'use client';

import { BookOpen, Globe, Instagram, Palette, Plus, Twitter, Youtube } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { ADDABLE_SOURCES, type SourceDefinition } from './source-types';

// Icon map for dynamically rendering icons
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Twitter,
  Instagram,
  BookOpen,
  Palette,
  Youtube,
  Globe,
};

interface AddSourceDialogProps {
  activeSources: string[];
  onAddSourceAction: (source: SourceDefinition) => void;
}

export function AddSourceDialog({ activeSources, onAddSourceAction }: AddSourceDialogProps) {
  const availableSources = ADDABLE_SOURCES.filter((s) => !activeSources.includes(s.key));

  if (availableSources.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a Data Source</DialogTitle>
          <DialogDescription>
            Add additional data sources to import and manage data from external platforms.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          {availableSources.map((source) => {
            const Icon = ICON_MAP[source.icon] || Globe;
            return (
              <button
                key={source.key}
                onClick={() => onAddSourceAction(source)}
                className="flex items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${source.colorClass}`}
                >
                  <Icon className={`h-5 w-5 ${source.iconColorClass}`} />
                </div>
                <div>
                  <p className="font-medium">{source.label}</p>
                  <p className="text-sm text-muted-foreground">{source.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
