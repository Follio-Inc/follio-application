'use client';

import { Eye, WandSparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Suspense, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const ResumePreviewPanel = dynamic(
  () => import('./resume-preview-panel').then((m) => ({ default: m.ResumePreviewPanel })),
  { ssr: false }
);

const DesignerPanel = dynamic(
  () => import('./designer-panel').then((m) => ({ default: m.DesignerPanel })),
  { ssr: false }
);

interface BuilderMobileBarProps {
  /** Extra bottom padding so content isn't hidden behind the bar. */
  className?: string;
}

/**
 * Mobile / tablet affordances for preview and design.
 * The 3-panel slide layout is xl+ only; below that users still need
 * access to the live preview and design controls.
 */
export function BuilderMobileBar({ className }: BuilderMobileBarProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border/60 bg-background/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 xl:hidden',
          className
        )}
      >
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 gap-2"
          onClick={() => setPreviewOpen(true)}
        >
          <Eye className="h-4 w-4" />
          Preview
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 gap-2"
          onClick={() => setDesignOpen(true)}
        >
          <WandSparkles className="h-4 w-4" />
          Design
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Resume preview</DialogTitle>
            <DialogDescription>Live preview of your resume</DialogDescription>
          </DialogHeader>
          <Suspense fallback={null}>
            <div className="min-h-0 flex-1">
              <ResumePreviewPanel />
            </div>
          </Suspense>
        </DialogContent>
      </Dialog>

      <Dialog open={designOpen} onOpenChange={setDesignOpen}>
        <DialogContent className="flex h-[92vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Resume design</DialogTitle>
            <DialogDescription>Customize colors, typography, and layout</DialogDescription>
          </DialogHeader>
          <Suspense fallback={null}>
            <div className="min-h-0 flex-1">
              <DesignerPanel />
            </div>
          </Suspense>
        </DialogContent>
      </Dialog>
    </>
  );
}
