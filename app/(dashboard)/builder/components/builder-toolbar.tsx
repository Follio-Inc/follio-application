'use client';

import { Eye } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useBuilderStore } from './builder-store-provider';
import { DownloadDialog } from './download-dialog';
import { ShareDialog } from '@/components/share-dialog';
import { resolveResumePageLayout } from '@/lib/resume/page-layout';

// ─── Types ────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  text?: string;
  onClick?: () => void;
  disabled?: boolean;
}

// ─── Toolbar Button ───────────────────────────────────────────────

function ToolbarButton({ icon, label, text, onClick, disabled }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
          {text && <span className="hidden sm:inline">{text}</span>}
          {!text && <span className="sr-only">{label}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ToolbarSeparator() {
  return <Separator orientation="vertical" className="mx-0.5 h-5 bg-border/60" />;
}

// ─── Main Toolbar ─────────────────────────────────────────────────

export function BuilderToolbar() {
  const profile = useBuilderStore((s) => s.draftProfile);
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const [shareOpen, setShareOpen] = useState(false);

  const resumeTitle = profile.resumeTitle || 'Untitled Resume';
  const handle = profile.handle;

  // ── View resume as external user ──

  const handleView = () => {
    window.open(`/u/${handle}/resume`, '_blank');
  };

  return (
    <>
      <div className="flex w-full items-center justify-center px-4 py-1.5">
        <div className="surface-raised flex items-center gap-1 px-2 py-1">
          {/* Download — opens dialog with layout options */}
          <DownloadDialog
            handle={handle}
            resumeTitle={resumeTitle}
            resumePageLayout={resolveResumePageLayout(profile.resumeDesign)}
            onShareClick={() => setShareOpen(true)}
          />

          <ToolbarSeparator />

          {/* View — opens the resume as an external visitor would see it */}
          <ToolbarButton
            icon={<Eye className="h-4 w-4" />}
            label="View as visitors see it"
            text="View"
            onClick={handleView}
          />

          <ToolbarSeparator />

          {/* Share — highlighted primary action */}
          <ShareDialog
            profile={profile}
            open={shareOpen}
            onOpenChange={setShareOpen}
            onVisibilityChange={(visibility) => {
              commitInlineChange({ resumeVisibility: visibility });
            }}
          />
        </div>
      </div>
    </>
  );
}
