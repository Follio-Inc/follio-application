'use client';

import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Globe,
  Link as LinkIcon,
  Loader2,
  Plus,
  Youtube,
} from 'lucide-react';
import { useCallback, useState } from 'react';

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

import type { SourceDefinition } from './source-types';
import {
  detectSourceFromUrl,
  getSupportedPlatforms,
  type DetectedSource,
} from './url-source-detector';

// Icon map for rendering detected platform icon
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  Youtube,
  Globe,
};

interface AddSourceDialogProps {
  activeSources: string[];
  onAddSourceAction: (source: SourceDefinition, fetchResult?: Record<string, unknown>) => void;
}

type DialogState = 'input' | 'detected' | 'fetching' | 'success' | 'error';

export function AddSourceDialog({ activeSources, onAddSourceAction }: AddSourceDialogProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [state, setState] = useState<DialogState>('input');
  const [detected, setDetected] = useState<DetectedSource | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [fetchResult, setFetchResult] = useState<Record<string, unknown> | null>(null);

  const supportedPlatforms = getSupportedPlatforms();

  const resetState = useCallback(() => {
    setUrl('');
    setState('input');
    setDetected(null);
    setErrorMsg('');
    setFetchResult(null);
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (!isOpen) resetState();
    },
    [resetState]
  );

  // Step 1: Detect platform from URL
  const handleDetect = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const result = detectSourceFromUrl(trimmed);
    if (!result) {
      setState('error');
      setErrorMsg(
        'This URL is not supported yet. We currently support Medium, Dev.to, Substack, Hashnode, and YouTube.'
      );
      return;
    }

    // Check if already added
    if (activeSources.includes(result.key)) {
      setState('error');
      setErrorMsg(`${result.label} is already connected. Go to its tab to refresh data.`);
      return;
    }

    setDetected(result);
    setState('detected');
  }, [url, activeSources]);

  // Step 2: Fetch data from the detected source
  const handleFetch = useCallback(async () => {
    if (!detected) return;

    setState('fetching');
    setErrorMsg('');

    try {
      const res = await fetch(detected.fetchEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detected.fetchBody),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to fetch from ${detected.label}`);
      }

      setFetchResult(data);
      setState('success');

      // Add the source tab — include fetch info so the panel can refresh
      const sourceWithFetchInfo: SourceDefinition = {
        ...detected.source,
        fetchInfo: {
          endpoint: detected.fetchEndpoint,
          body: detected.fetchBody,
        },
      };
      onAddSourceAction(sourceWithFetchInfo, data);
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [detected, onAddSourceAction]);

  // Handle Enter key in the input
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state === 'input' || state === 'error') {
          handleDetect();
        }
      }
    },
    [state, handleDetect]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add External Source</DialogTitle>
          <DialogDescription>
            Paste a link to your blog or channel. We&apos;ll detect the platform and import your
            content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* URL Input */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="https://medium.com/@username"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    // Reset on edit after detection
                    if (state !== 'input') {
                      setState('input');
                      setDetected(null);
                      setErrorMsg('');
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  className="h-10 pl-9"
                  autoFocus
                  disabled={state === 'fetching'}
                />
              </div>
              {state === 'input' && (
                <Button onClick={handleDetect} disabled={!url.trim()} className="h-10">
                  Detect
                </Button>
              )}
            </div>
          </div>

          {/* Detected Platform */}
          {state === 'detected' && detected && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                {(() => {
                  const Icon = ICON_MAP[detected.source.icon] || Globe;
                  return (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <Icon className={`h-5 w-5 ${detected.source.iconColorClass}`} />
                    </div>
                  );
                })()}
                <div className="flex-1">
                  <p className="font-medium">{detected.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {detected.identifier ? `@${detected.identifier}` : detected.url}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>

              <Button onClick={handleFetch} className="w-full gap-2">
                <Plus className="h-4 w-4" />
                Import from {detected.label}
              </Button>
            </div>
          )}

          {/* Fetching State */}
          {state === 'fetching' && detected && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">Importing from {detected.label}...</p>
                <p className="text-sm text-muted-foreground">
                  Fetching your content. This may take a few seconds.
                </p>
              </div>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && detected && fetchResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <div>
                  <p className="font-medium text-foreground">Import successful!</p>
                  <p className="text-sm text-muted-foreground">
                    {((fetchResult as Record<string, unknown>).message as string) ||
                      `Data imported from ${detected.label}`}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  resetState();
                }}
                className="w-full"
              >
                Done
              </Button>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{errorMsg}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setState('input');
                  setErrorMsg('');
                }}
                className="w-full"
              >
                Try again
              </Button>
            </div>
          )}

          {/* Supported Platforms Hint */}
          {(state === 'input' || state === 'error') && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Supported platforms</p>
              <div className="flex flex-wrap gap-2">
                {supportedPlatforms.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    onClick={() => {
                      setUrl(`https://${p.example}`);
                      setState('input');
                      setErrorMsg('');
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
