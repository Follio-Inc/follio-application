'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import {
  TemplateOptionCard,
  type TemplateOption,
} from '@/components/portfolio/template-option-card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import type { TemplatePortfolio } from '@/lib/portfolio/templates/types';

interface TemplateGalleryProps {
  templates: TemplateOption[];
  currentTemplateId: string | null;
  /** Called with the new published plan so the editor preview can update instantly. */
  onTemplateApplied?: (plan: TemplatePortfolio) => void;
  /** The trigger element (e.g. a button). Rendered via DialogTrigger asChild. */
  children: React.ReactNode;
}

export function TemplateGallery({
  templates,
  currentTemplateId,
  onTemplateApplied,
  children,
}: TemplateGalleryProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(currentTemplateId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = selected !== null && selected !== currentTemplateId;

  const handleApply = async () => {
    if (!selected || !dirty) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio/switch-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to switch template');
      }
      if (data.plan && typeof data.plan.templateId === 'string') {
        onTemplateApplied?.(data.plan as TemplatePortfolio);
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Reset selection to current each time the gallery opens.
          setSelected(currentTemplateId);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Choose a template</DialogTitle>
          <DialogDescription>
            Switch your portfolio&apos;s look. Your content and AI-written copy carry over — only
            the design changes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          {templates.map((template) => (
            <TemplateOptionCard
              key={template.id}
              template={template}
              selected={selected === template.id}
              current={currentTemplateId === template.id}
              disabled={busy}
              onSelect={setSelected}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <p className="text-xs text-destructive">{error}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={busy || !dirty}>
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Applying…
                </>
              ) : (
                'Apply template'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
