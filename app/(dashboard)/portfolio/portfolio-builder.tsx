'use client';

/**
 * Portfolio Builder — Main Client Component
 *
 * Full-page builder with sidebar controls + live preview.
 * Controls: Section visibility/ordering, AI copy editing, style customization.
 *
 * Data model:
 *   - Template portfolio (TemplatePortfolio) is the source of truth
 *   - All edits mutate a local state copy
 *   - Auto-save debounces PATCHes to /api/portfolio/update
 *   - "Generate" creates a new portfolio via /api/portfolio/generate
 */

import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getPortfolioPath } from '@/lib/url';
import { cn } from '@/lib/utils';

import type {
  TemplateCopy,
  TemplatePortfolio,
  TemplateSectionConfig,
  TemplateStyleConfig,
} from '@/lib/portfolio/templates/types';
import type { PublicProfile } from '@/types';

import { TemplatePortfolioView } from '@/app/u/[handle]/views/template-portfolio-view';

// ============================================================================
// CONSTANTS
// ============================================================================

const SECTION_LABELS: Record<string, string> = {
  navigation: 'Navigation',
  hero: 'Hero',
  about: 'About',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  certifications: 'Certifications',
  awards: 'Awards',
  github: 'GitHub',
  blog: 'Blog',
  contact: 'Contact',
  footer: 'Footer',
};

/** Core string fields editable via the builder UI */
type EditableCopyField =
  | 'heroHeadline'
  | 'heroSubtext'
  | 'aboutTitle'
  | 'aboutText'
  | 'contactTitle'
  | 'contactSubtext'
  | 'primaryCtaLabel';

const COPY_FIELDS: { key: EditableCopyField; label: string; multiline?: boolean }[] = [
  { key: 'heroHeadline', label: 'Hero Headline' },
  { key: 'heroSubtext', label: 'Hero Subtext' },
  { key: 'aboutTitle', label: 'About Title' },
  { key: 'aboutText', label: 'About Text', multiline: true },
  { key: 'contactTitle', label: 'Contact Title' },
  { key: 'contactSubtext', label: 'Contact Subtext' },
  { key: 'primaryCtaLabel', label: 'CTA Button Label' },
];

const ACCENT_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'White', value: '#ffffff' },
];

type BuilderTab = 'sections' | 'copy' | 'style';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ============================================================================
// PROPS
// ============================================================================

interface PortfolioBuilderProps {
  profile: PublicProfile;
  templatePortfolio: TemplatePortfolio | null;
  portfolioId: string | null;
  githubProfile: {
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    publicRepos: number;
    followers: number;
    totalStars: number;
    primaryLanguages: string[];
  } | null;
  handle: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PortfolioBuilder({
  profile,
  templatePortfolio: initial,
  portfolioId,
  githubProfile,
  handle,
}: PortfolioBuilderProps) {
  const [portfolio, setPortfolio] = useState<TemplatePortfolio | null>(initial);
  const [activeTab, setActiveTab] = useState<BuilderTab>('sections');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isGenerating, setIsGenerating] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const portfolioUrl = getPortfolioPath(handle);

  // ── Auto-save on changes ───────────────────────────────────────────
  const savePortfolio = useCallback(
    async (updatedPortfolio: TemplatePortfolio) => {
      if (!portfolioId) return;
      setSaveStatus('saving');

      try {
        const res = await fetch('/api/portfolio/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections: updatedPortfolio.sections,
            copy: updatedPortfolio.copy,
            style: updatedPortfolio.style,
          }),
        });

        if (!res.ok) throw new Error('Save failed');
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    },
    [portfolioId]
  );

  const debouncedSave = useCallback(
    (updatedPortfolio: TemplatePortfolio) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => savePortfolio(updatedPortfolio), 1000);
    },
    [savePortfolio]
  );

  // ── Update handlers ────────────────────────────────────────────────
  const updatePortfolio = useCallback(
    (updater: (prev: TemplatePortfolio) => TemplatePortfolio) => {
      setPortfolio((prev) => {
        if (!prev) return prev;
        const updated = updater(prev);
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave]
  );

  const toggleSection = useCallback(
    (sectionId: string) => {
      updatePortfolio((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, enabled: !s.enabled } : s
        ),
      }));
    },
    [updatePortfolio]
  );

  const moveSectionUp = useCallback(
    (sectionId: string) => {
      updatePortfolio((prev) => {
        const sorted = [...prev.sections].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((s) => s.id === sectionId);
        if (idx <= 0) return prev;

        // Swap orders
        const temp = sorted[idx].order;
        sorted[idx] = { ...sorted[idx], order: sorted[idx - 1].order };
        sorted[idx - 1] = { ...sorted[idx - 1], order: temp };

        return { ...prev, sections: sorted };
      });
    },
    [updatePortfolio]
  );

  const moveSectionDown = useCallback(
    (sectionId: string) => {
      updatePortfolio((prev) => {
        const sorted = [...prev.sections].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((s) => s.id === sectionId);
        if (idx < 0 || idx >= sorted.length - 1) return prev;

        const temp = sorted[idx].order;
        sorted[idx] = { ...sorted[idx], order: sorted[idx + 1].order };
        sorted[idx + 1] = { ...sorted[idx + 1], order: temp };

        return { ...prev, sections: sorted };
      });
    },
    [updatePortfolio]
  );

  const updateCopy = useCallback(
    (field: EditableCopyField, value: string) => {
      updatePortfolio((prev) => ({
        ...prev,
        copy: { ...prev.copy, [field]: value },
      }));
    },
    [updatePortfolio]
  );

  const updateStyle = useCallback(
    (updates: Partial<TemplateStyleConfig>) => {
      updatePortfolio((prev) => ({
        ...prev,
        style: { ...prev.style, ...updates },
      }));
    },
    [updatePortfolio]
  );

  // ── Generate portfolio (if none exists) ────────────────────────────
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/portfolio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: true }),
      });

      if (!res.ok) throw new Error('Generation failed');

      // Reload page to get fresh data
      window.location.reload();
    } catch {
      setIsGenerating(false);
    }
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // ── No portfolio yet — show generation prompt ──────────────────────
  if (!portfolio) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h1 className="mb-3 text-2xl font-bold">Generate Your Portfolio</h1>
        <p className="mb-8 text-muted-foreground">
          AI will create a professional portfolio from your profile data. You can customize
          everything afterwards.
        </p>
        <Button size="lg" onClick={handleGenerate} disabled={isGenerating} className="gap-2">
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Portfolio
            </>
          )}
        </Button>
      </div>
    );
  }

  // ── Sort sections for sidebar display ──────────────────────────────
  const sortedSections = [...portfolio.sections].sort((a, b) => a.order - b.order);
  const editableSections = sortedSections.filter((s) => !['navigation', 'footer'].includes(s.type));

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── SIDEBAR ──────────────────────────────────────────────── */}
      <aside className="flex w-80 flex-col border-r bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-sm font-semibold">Portfolio Builder</h1>
          <div className="flex items-center gap-2">
            <SaveIndicator status={saveStatus} />
            <Link href={portfolioUrl} target="_blank">
              <Button variant="ghost" size="icon" className="h-8 w-8" title="View live portfolio">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(['sections', 'copy', 'style'] as BuilderTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 py-2.5 text-xs font-medium capitalize transition-colors',
                activeTab === tab
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'sections' && (
            <SectionsPanel
              sections={editableSections}
              onToggle={toggleSection}
              onMoveUp={moveSectionUp}
              onMoveDown={moveSectionDown}
            />
          )}
          {activeTab === 'copy' && <CopyPanel copy={portfolio.copy} onUpdate={updateCopy} />}
          {activeTab === 'style' && <StylePanel style={portfolio.style} onUpdate={updateStyle} />}
        </div>

        {/* Footer Actions */}
        <div className="border-t p-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Regenerate with AI
          </Button>
        </div>
      </aside>

      {/* ── PREVIEW ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-gray-950">
        <div className="mx-auto max-w-[1440px]">
          <TemplatePortfolioView
            profile={profile}
            templateData={portfolio}
            githubProfile={githubProfile}
          />
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      {status === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="h-3 w-3 text-green-500" />
          Saved
        </>
      )}
      {status === 'error' && <span className="text-destructive">Save failed</span>}
    </span>
  );
}

function SectionsPanel({
  sections,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  sections: TemplateSectionConfig[];
  onToggle: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="mb-3 text-xs text-muted-foreground">Toggle sections on/off and reorder them.</p>
      {sections.map((section, idx) => (
        <div
          key={section.id}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
            section.enabled ? 'border-border bg-card' : 'border-transparent bg-muted/30 opacity-60'
          )}
        >
          {/* Toggle */}
          <button
            onClick={() => onToggle(section.id)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            title={section.enabled ? 'Hide section' : 'Show section'}
          >
            {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>

          {/* Label */}
          <span className="flex-1 text-sm font-medium">
            {SECTION_LABELS[section.type] || section.type}
          </span>

          {/* Reorder */}
          <div className="flex gap-0.5">
            <button
              onClick={() => onMoveUp(section.id)}
              disabled={idx === 0}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="Move up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onMoveDown(section.id)}
              disabled={idx === sections.length - 1}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="Move down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CopyPanel({
  copy,
  onUpdate,
}: {
  copy: TemplateCopy;
  onUpdate: (field: EditableCopyField, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Edit the AI-generated text for your portfolio.
      </p>
      {COPY_FIELDS.map(({ key, label, multiline }) => (
        <div key={key}>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
          {multiline ? (
            <textarea
              value={copy[key]}
              onChange={(e) => onUpdate(key, e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <input
              type="text"
              value={copy[key]}
              onChange={(e) => onUpdate(key, e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function StylePanel({
  style,
  onUpdate,
}: {
  style: TemplateStyleConfig;
  onUpdate: (updates: Partial<TemplateStyleConfig>) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Accent Color */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Accent Color</label>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => onUpdate({ accentColor: color.value })}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                style.accentColor === color.value
                  ? 'scale-110 border-primary'
                  : 'border-transparent hover:border-muted-foreground/30'
              )}
              title={color.name}
            >
              <span className="h-5 w-5 rounded-full" style={{ backgroundColor: color.value }} />
            </button>
          ))}
        </div>
      </div>

      {/* Font Family */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Font Family</label>
        <div className="space-y-1">
          {[
            { id: 'inter', name: 'Inter' },
            { id: 'dm-sans', name: 'DM Sans' },
            { id: 'space-grotesk', name: 'Space Grotesk' },
            { id: 'jetbrains-mono', name: 'JetBrains Mono' },
          ].map((font) => (
            <button
              key={font.id}
              onClick={() => onUpdate({ fontFamily: font.id })}
              className={cn(
                'block w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                style.fontFamily === font.id
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-muted-foreground/30'
              )}
            >
              {font.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
