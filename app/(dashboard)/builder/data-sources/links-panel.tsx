'use client';

import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Link as LinkIcon,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import type { Link } from '@/types';

interface LinksSourcePanelProps {
  links: Link[];
  onSyncStatusRefreshAction: () => void;
}

export function LinksSourcePanel({ links, onSyncStatusRefreshAction }: LinksSourcePanelProps) {
  const [status, setStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLinks, setNewLinks] = useState<Array<{ url: string }>>([{ url: '' }]);
  const [isDeletingLink, setIsDeletingLink] = useState<string | null>(null);

  const handleSaveLinks = useCallback(async () => {
    const validLinks = newLinks.filter((l) => l.url.trim());
    if (validLinks.length === 0) {
      setShowAddForm(false);
      return;
    }

    setStatus('importing');
    setMessage('Processing links...');

    try {
      const response = await fetch('/api/import/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: validLinks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to process links');

      setStatus('success');
      setMessage(`Added ${data.data?.summary?.links || validLinks.length} links`);
      setShowAddForm(false);
      setNewLinks([{ url: '' }]);
      onSyncStatusRefreshAction();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to process links');
    }
  }, [newLinks, onSyncStatusRefreshAction]);

  const handleDeleteLink = useCallback(
    async (linkId: string) => {
      setIsDeletingLink(linkId);
      try {
        const res = await fetch(`/api/profile/links/${linkId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete link');
        onSyncStatusRefreshAction();
      } catch (err) {
        console.error('Delete link error:', err);
      } finally {
        setIsDeletingLink(null);
      }
    },
    [onSyncStatusRefreshAction]
  );

  return (
    <div className="space-y-6">
      {/* Add Links Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-emerald-500" />
            Links & URLs
          </CardTitle>
          <CardDescription>
            Add external URLs, social profiles, and websites to your data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status messages */}
          {status === 'success' && message && (
            <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
              <CheckCircle2 className="mb-0.5 mr-1 inline h-4 w-4" />
              {message}
            </div>
          )}
          {status === 'error' && message && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mb-0.5 mr-1 inline h-4 w-4" />
              {message}
            </div>
          )}

          {!showAddForm ? (
            <Button variant="outline" onClick={() => setShowAddForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Links
            </Button>
          ) : (
            <div className="space-y-3">
              {newLinks.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="https://..."
                    value={link.url}
                    onChange={(e) =>
                      setNewLinks((prev) =>
                        prev.map((l, i) => (i === index ? { ...l, url: e.target.value } : l))
                      )
                    }
                    className="h-9"
                  />
                  {newLinks.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => setNewLinks((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewLinks((prev) => [...prev, { url: '' }])}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" /> Add another
                </Button>
                <Button size="sm" onClick={handleSaveLinks} disabled={status === 'importing'}>
                  {status === 'importing' ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewLinks([{ url: '' }]);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Links ({links.length})</CardTitle>
          <CardDescription>Links currently on your profile</CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No links added yet.</p>
          ) : (
            <div className="space-y-2">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{link.label || link.url}</p>
                      {link.label && (
                        <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {link.type.toLowerCase()}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {link.source}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleDeleteLink(link.id)}
                      disabled={isDeletingLink === link.id}
                    >
                      {isDeletingLink === link.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
