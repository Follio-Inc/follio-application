'use client';

import { motion } from 'framer-motion';
import {
  AlertCircle,
  BookOpen,
  Database,
  FileText,
  Github,
  Globe,
  HelpCircle,
  Instagram,
  Linkedin,
  Palette,
  Twitter,
  Youtube,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { AddSourceDialog } from './add-source-dialog';
import { GenericSourcePanel } from './generic-panel';
import { GitHubSourcePanel } from './github-panel';
import { GoogleSourcePanel } from './google-panel';
import { LinkedInSourcePanel } from './linkedin-panel';
import { MediumSourcePanel } from './medium-panel';
import { ResumeSourcePanel } from './resume-panel';
import { BUILT_IN_SOURCES, type SourceDefinition, type SyncStatus } from './source-types';

import type { FullProfile } from '@/types';

// ─── Google "G" Icon (outline style to match Lucide icons) ──────
function GoogleTabIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z" />
    </svg>
  );
}

// Icon map for dynamic icon rendering
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Github,
  Linkedin,
  Twitter,
  Instagram,
  BookOpen,
  Palette,
  Youtube,
  Globe,
  Database,
  Google: GoogleTabIcon,
};

/** Blog-type source keys that should render the Medium panel */
const BLOG_SOURCE_KEYS = new Set(['medium', 'devto', 'substack', 'hashnode']);

const ACTIVE_SOURCES_STORAGE_KEY = 'follio-active-sources';

interface DataSourcesPageClientProps {
  profile: FullProfile;
}

export default function DataSourcesPageClient({ profile }: DataSourcesPageClientProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('resume');

  // Dynamic sources added by the user (persisted in localStorage)
  const [additionalSources, setAdditionalSources] = useState<SourceDefinition[]>([]);

  // Load additional sources from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_SOURCES_STORAGE_KEY);
      if (stored) {
        setAdditionalSources(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist additional sources
  const persistSources = useCallback((sources: SourceDefinition[]) => {
    try {
      localStorage.setItem(ACTIVE_SOURCES_STORAGE_KEY, JSON.stringify(sources));
    } catch {
      // ignore
    }
  }, []);

  // All active sources = built-in + user-added
  const allSources = [...BUILT_IN_SOURCES, ...additionalSources];

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/import/sync-status');
      if (!response.ok) throw new Error('Failed to load sync status');
      const data: SyncStatus = await response.json();
      setSyncStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  // Handle adding a new source (called from AddSourceDialog after successful fetch)
  const handleAddSource = useCallback(
    (source: SourceDefinition) => {
      // Don't add if already present
      if (additionalSources.some((s) => s.key === source.key)) {
        setActiveTab(source.key);
        return;
      }
      const updated = [...additionalSources, source];
      setAdditionalSources(updated);
      persistSources(updated);
      // Switch to the newly added tab
      setActiveTab(source.key);
      // Reload the page so server-rendered profile.blogPosts picks up the new data
      window.location.reload();
    },
    [additionalSources, persistSources]
  );

  // Handle removing a user-added source
  const handleRemoveSource = useCallback(
    (key: string) => {
      const updated = additionalSources.filter((s) => s.key !== key);
      setAdditionalSources(updated);
      persistSources(updated);
      // Switch back to first tab
      setActiveTab('resume');
    },
    [additionalSources, persistSources]
  );

  // Refresh handler for child panels
  const handleRefresh = useCallback(() => {
    fetchSyncStatus();
    // Force a page-level data refresh by revalidating
    window.location.reload();
  }, [fetchSyncStatus]);

  // ─── Loading / Error ───────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-muted-foreground">Loading data sources...</p>
        </div>
      </div>
    );
  }

  if (error || !syncStatus) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-destructive">{error || 'Failed to load'}</p>
          <Button onClick={fetchSyncStatus}>Retry</Button>
        </div>
      </div>
    );
  }

  // ─── Render panel for a dynamic source ─────────────────────

  const renderDynamicPanel = (source: SourceDefinition) => {
    // Blog-type sources get the Medium/blog panel
    if (BLOG_SOURCE_KEYS.has(source.key)) {
      // Filter blog posts by platform (medium, devto, substack, hashnode)
      const postsForSource = (profile.blogPosts ?? []).filter(
        (p) => p.platform?.toLowerCase() === source.key
      );
      return (
        <MediumSourcePanel
          source={source}
          blogPosts={postsForSource}
          onRemoveSourceAction={handleRemoveSource}
          onRefreshAction={handleRefresh}
        />
      );
    }

    // Fallback generic panel
    return <GenericSourcePanel source={source} onRemoveSourceAction={handleRemoveSource} />;
  };

  // ─── Main Render ───────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold">Data Sources</h1>
          <p className="mt-1 text-muted-foreground">
            Import, sync, and manage data from all your external sources in one place.
          </p>
        </div>
        <AddSourceDialog
          activeSources={allSources.map((s) => s.key)}
          onAddSourceAction={handleAddSource}
        />
      </motion.div>

      {/* Tabbed Interface */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 flex h-auto flex-wrap gap-1">
            {allSources.map((source) => {
              const Icon = ICON_MAP[source.icon] || Globe;
              return (
                <TabsTrigger key={source.key} value={source.key} className="gap-2 px-3 py-2">
                  <Icon className="h-4 w-4" />
                  {source.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Resume Tab */}
          <TabsContent value="resume">
            <ResumeSourcePanel syncStatus={syncStatus} onSyncStatusRefreshAction={handleRefresh} />
          </TabsContent>

          {/* GitHub Tab */}
          <TabsContent value="github">
            <GitHubSourcePanel
              syncStatus={syncStatus}
              projects={profile.projects}
              onSyncStatusRefreshAction={handleRefresh}
            />
          </TabsContent>

          {/* LinkedIn Tab */}
          <TabsContent value="linkedin">
            <LinkedInSourcePanel
              syncStatus={syncStatus}
              onSyncStatusRefreshAction={handleRefresh}
            />
          </TabsContent>

          {/* Google Tab */}
          <TabsContent value="google">
            <GoogleSourcePanel syncStatus={syncStatus} onSyncStatusRefreshAction={handleRefresh} />
          </TabsContent>

          {/* Dynamic / User-Added Sources */}
          {additionalSources.map((source) => (
            <TabsContent key={source.key} value={source.key}>
              {renderDynamicPanel(source)}
            </TabsContent>
          ))}
        </Tabs>
      </motion.div>

      {/* How It Works */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <HelpCircle className="h-4 w-4" />
              How data sources work
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  1
                </div>
                <div>
                  <p className="text-sm font-medium">Connect & Import</p>
                  <p className="text-xs text-muted-foreground">
                    Connect accounts or upload files. Data is pulled from each source.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  2
                </div>
                <div>
                  <p className="text-sm font-medium">Smart Merge</p>
                  <p className="text-xs text-muted-foreground">
                    New items are appended. Duplicates are skipped. Manual edits are never
                    overwritten.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  3
                </div>
                <div>
                  <p className="text-sm font-medium">Manage</p>
                  <p className="text-xs text-muted-foreground">
                    View and manage imported data per source. Visibility is controlled separately in
                    each section.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
