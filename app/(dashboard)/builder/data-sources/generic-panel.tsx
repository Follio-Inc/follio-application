'use client';

import {
  AlertCircle,
  BookOpen,
  Globe,
  Instagram,
  Link as LinkIcon,
  Loader2,
  Palette,
  Trash2,
  Twitter,
  Youtube,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import type { SourceDefinition } from './source-types';

// Icon map for dynamically rendering icons
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Twitter,
  Instagram,
  BookOpen,
  Palette,
  Youtube,
  Globe,
  Link: LinkIcon,
};

interface GenericSourcePanelProps {
  source: SourceDefinition;
  onRemoveSourceAction: (key: string) => void;
}

/**
 * Generic panel for user-added sources (X, Instagram, Medium, etc.)
 * These are "coming soon" sources where users can add profile URLs
 * that will be stored as links on their profile.
 */
export function GenericSourcePanel({ source, onRemoveSourceAction }: GenericSourcePanelProps) {
  const Icon = ICON_MAP[source.icon] || Globe;
  const [profileUrl, setProfileUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveUrl = useCallback(async () => {
    if (!profileUrl.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/import/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          links: [{ url: profileUrl.trim() }],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save link');

      setSaved(true);
      setProfileUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save link');
    } finally {
      setIsSaving(false);
    }
  }, [profileUrl]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${source.iconColorClass}`} />
                {source.label}
              </CardTitle>
              <CardDescription>{source.description}</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onRemoveSourceAction(source.key)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Remove
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-dashed p-6">
            <div className="text-center">
              <Icon className={`mx-auto h-10 w-10 ${source.iconColorClass} opacity-50`} />
              <p className="mt-3 text-sm font-medium">Full {source.label} import coming soon</p>
              <p className="mt-1 text-xs text-muted-foreground">
                For now, you can add your {source.label} profile URL to your links.
              </p>
            </div>
          </div>

          {/* Add profile URL */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Add your {source.label} URL</p>
            {error && (
              <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="mb-0.5 mr-1 inline h-3 w-3" />
                {error}
              </div>
            )}
            {saved && (
              <div className="rounded-md bg-green-50 p-2 text-xs text-green-700 dark:bg-green-950/30 dark:text-green-400">
                Link saved successfully!
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder={`https://${source.key === 'twitter' ? 'x.com' : source.key === 'custom-link' ? 'example.com' : source.key + '.com'}/your-profile`}
                value={profileUrl}
                onChange={(e) => {
                  setProfileUrl(e.target.value);
                  setSaved(false);
                }}
                className="h-9"
              />
              <Button
                size="sm"
                onClick={handleSaveUrl}
                disabled={!profileUrl.trim() || isSaving}
                className="h-9"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
