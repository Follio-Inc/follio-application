'use client';

import { useUser } from '@clerk/nextjs';
import { Check, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';

import { BrandIcon, type BrandIconId } from '@/components/onboarding/constellation/brand-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { importConstellationPlatform } from '@/lib/onboarding/constellation/import-adapters';
import { PLATFORM_BY_ID, type PlatformId } from '@/lib/onboarding/constellation/platforms';
import {
  mergeImportedBlogPosts,
  mergeImportedProjects,
  normalizeReviewBlogPost,
  normalizeReviewProject,
  type NormalizedReviewBlogPost,
  type NormalizedReviewProject,
} from '@/lib/onboarding/review-import';
import { cn } from '@/lib/utils';

type ImportSourceId = Extract<PlatformId, 'github' | 'medium' | 'substack' | 'devpost'>;

type SourceDef = {
  id: ImportSourceId;
  label: string;
  brandId: BrandIconId;
  placeholder: string;
  hint: string;
  /** What this import primarily adds */
  outcome: 'projects' | 'writing' | 'link';
};

const IMPORT_SOURCES: SourceDef[] = [
  {
    id: 'github',
    label: 'GitHub',
    brandId: 'github',
    placeholder: 'username or github.com/you',
    hint: 'Import repositories as projects',
    outcome: 'projects',
  },
  {
    id: 'medium',
    label: 'Medium',
    brandId: 'medium',
    placeholder: '@username or medium.com/@you',
    hint: 'Import stories for your portfolio',
    outcome: 'writing',
  },
  {
    id: 'substack',
    label: 'Substack',
    brandId: 'substack',
    placeholder: 'you.substack.com',
    hint: 'Import publication posts',
    outcome: 'writing',
  },
  {
    id: 'devpost',
    label: 'Devpost',
    brandId: 'devpost',
    placeholder: 'devpost.com/you',
    hint: 'Link your hackathon portfolio',
    outcome: 'link',
  },
];

export type ProjectImportResult = {
  projects?: NormalizedReviewProject[];
  blogPosts?: NormalizedReviewBlogPost[];
  githubProfile?: Record<string, unknown>;
  link?: { url: string; type: string; label: string };
  message: string;
};

interface ProjectImportSourcesProps {
  existingProjects: Array<{
    repoUrl?: string;
    ghOwner?: string;
    ghRepo?: string;
    title?: string;
  }>;
  existingBlogPosts?: Array<{ url?: string | null }>;
  onImported: (result: ProjectImportResult) => void;
  className?: string;
}

export function ProjectImportSources({
  existingProjects,
  existingBlogPosts = [],
  onImported,
  className,
}: ProjectImportSourcesProps) {
  const { user } = useUser();
  const [activeId, setActiveId] = useState<ImportSourceId | null>(null);
  const [input, setInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<ImportSourceId>>(new Set());

  const githubUsername =
    user?.externalAccounts?.find((acc) => acc.provider === 'github')?.username || undefined;

  const active = IMPORT_SOURCES.find((s) => s.id === activeId) || null;

  const selectSource = (id: ImportSourceId) => {
    setError(null);
    setSuccess(null);
    if (activeId === id) {
      setActiveId(null);
      setInput('');
      return;
    }
    setActiveId(id);
    if (id === 'github' && githubUsername) {
      setInput(githubUsername);
    } else {
      setInput('');
    }
  };

  const runImport = async () => {
    if (!active) return;
    const platform = PLATFORM_BY_ID[active.id];
    if (!platform) return;

    const trimmed = input.trim();
    if (!trimmed) {
      setError(`Enter a ${active.label} username or URL`);
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const bundle = await importConstellationPlatform(platform, trimmed);
      const result: ProjectImportResult = {
        link: bundle.link,
        message: '',
      };

      if (active.outcome === 'projects' && bundle.data) {
        const rawProjects = (bundle.data.projects as Array<Record<string, unknown>>) || [];
        const normalized = rawProjects.map((p) =>
          normalizeReviewProject(p, { forceSource: 'GITHUB' })
        );
        const merged = mergeImportedProjects(existingProjects, normalized);
        const added = merged.length - existingProjects.length;
        result.projects = normalized;
        result.githubProfile = (bundle.data.githubProfile as Record<string, unknown>) || undefined;
        result.message =
          added > 0
            ? `Added ${added} GitHub ${added === 1 ? 'project' : 'projects'}`
            : rawProjects.length > 0
              ? 'Those repositories are already in your list'
              : 'No public repositories found';
      } else if (active.outcome === 'writing' && bundle.data) {
        const rawPosts = (bundle.data.blogPosts as Array<Record<string, unknown>>) || [];
        const normalized = rawPosts.map(normalizeReviewBlogPost);
        const merged = mergeImportedBlogPosts(existingBlogPosts, normalized);
        const added = merged.length - existingBlogPosts.length;
        result.blogPosts = normalized;
        result.message =
          added > 0
            ? `Added ${added} ${added === 1 ? 'story' : 'stories'} from ${active.label}`
            : rawPosts.length > 0
              ? 'Those posts are already imported'
              : `No public posts found on ${active.label}`;
      } else {
        result.message = bundle.link
          ? `Linked ${active.label} — you can fine-tune it in Links`
          : `${active.label} connected`;
      }

      onImported(result);
      setImportedIds((prev) => new Set(prev).add(active.id));
      setSuccess(result.message);
      setActiveId(null);
      setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to import from ${active.label}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className={cn('w-full space-y-3', className)}>
      <div>
        <p className="mb-2 text-sm font-medium">Import from</p>
        <div className="flex flex-wrap gap-2">
          {IMPORT_SOURCES.map((source) => {
            const isActive = activeId === source.id;
            const isDone = importedIds.has(source.id);
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => selectSource(source.id)}
                disabled={isImporting}
                aria-pressed={isActive}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                  'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive && 'border-foreground/30 bg-muted',
                  !isActive && 'border-border/70 bg-background',
                  isDone && !isActive && 'border-emerald-500/40'
                )}
              >
                <BrandIcon id={source.brandId} className="h-4 w-4 shrink-0" />
                <span className="font-medium">{source.label}</span>
                {isDone ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pull in work from your profiles, or add a project manually below.
        </p>
      </div>

      {active ? (
        <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BrandIcon id={active.brandId} className="h-4 w-4 shrink-0" />
            Import from {active.label}
          </div>
          <p className="text-xs text-muted-foreground">{active.hint}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runImport();
                }
              }}
              placeholder={active.placeholder}
              disabled={isImporting}
              autoFocus
              aria-label={`${active.label} username or URL`}
            />
            <Button
              type="button"
              onClick={() => void runImport()}
              disabled={isImporting || !input.trim()}
              className="shrink-0 gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Import
                </>
              )}
            </Button>
          </div>
          {active.id === 'github' && githubUsername ? (
            <p className="text-xs text-muted-foreground">
              Connected as @{githubUsername} — import with one click, or paste another username.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {success}
        </p>
      ) : null}
    </div>
  );
}
