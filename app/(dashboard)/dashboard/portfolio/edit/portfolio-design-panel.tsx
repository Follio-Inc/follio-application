'use client';

import { LayoutTemplate } from 'lucide-react';

import type { TemplateOption } from '@/components/portfolio/template-option-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

import { TemplateGallery } from '../../template-gallery';
import { StylePanel } from './style-panel';

import type { EditorTemplateInfo } from './types';
import type {
  TemplateCopy,
  TemplatePortfolio,
  TemplateStyleConfig,
} from '@/lib/portfolio/templates/types';

interface PortfolioDesignPanelProps {
  draft: TemplatePortfolio;
  template: EditorTemplateInfo;
  templates: TemplateOption[];
  activeTemplateId: string;
  onTemplateApplied: (plan: TemplatePortfolio) => void;
  onCopy: (patch: Partial<TemplateCopy>) => void;
  onStyle: (patch: Partial<TemplateStyleConfig>) => void;
}

/**
 * Global design controls only — template, theme (appearance / color / font),
 * and SEO. Per-section layout pickers live in Content next to that section's
 * copy so users edit arrangement where they edit the content.
 */
export function PortfolioDesignPanel({
  draft,
  template,
  templates,
  activeTemplateId,
  onTemplateApplied,
  onCopy,
  onStyle,
}: PortfolioDesignPanelProps) {
  return (
    <div className="space-y-6 p-5">
      {templates.length > 1 && (
        <section className="space-y-3">
          <h3 className="text-eyebrow">Template</h3>
          <p className="text-xs text-muted-foreground">
            Switch the overall look while keeping your portfolio content.
          </p>
          <TemplateGallery
            templates={templates}
            currentTemplateId={activeTemplateId}
            draftPlan={draft}
            onTemplateApplied={onTemplateApplied}
          >
            <Button variant="outline" className="h-auto w-full justify-between gap-2 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" />
                Change template
              </span>
              <span className="truncate text-sm text-muted-foreground">{template.name}</span>
            </Button>
          </TemplateGallery>
        </section>
      )}

      {templates.length > 1 && <Separator />}

      <section className="space-y-1">
        <h3 className="text-eyebrow">Theme</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Appearance, accent color, and font for the whole portfolio.
        </p>
        <StylePanel style={draft.style} template={template} onChange={onStyle} />
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h3 className="text-eyebrow">SEO & sharing</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            How your portfolio appears in browser tabs, search, and link previews.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-foreground/80">Page title</Label>
          <Input
            value={draft.copy.seoTitle}
            onChange={(e) => onCopy({ seoTitle: e.target.value })}
            placeholder="Shown in browser tabs and search results"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-foreground/80">Meta description</Label>
          <Textarea
            value={draft.copy.seoDescription}
            onChange={(e) => onCopy({ seoDescription: e.target.value })}
            rows={3}
            placeholder="A short summary for search engines and link previews"
          />
        </div>
      </section>
    </div>
  );
}
