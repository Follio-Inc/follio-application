'use client';

import { ExternalLink, FileDown, Loader2, Palette, Printer, Redo2, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useBuilderStore } from './builder-store-provider';
import { ShareDialog } from './share-dialog';

// ─── Types ────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

// ─── Toolbar Button ───────────────────────────────────────────────

function ToolbarButton({ icon, label, onClick, disabled, loading }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
          onClick={onClick}
          disabled={disabled || loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ToolbarSeparator() {
  return <Separator orientation="vertical" className="mx-1 h-5" />;
}

// ─── Main Toolbar ─────────────────────────────────────────────────

export function BuilderToolbar() {
  const profile = useBuilderStore((s) => s.draftProfile);
  const [isExporting, setIsExporting] = useState(false);

  const resumeTitle = profile.resumeTitle || 'Untitled Resume';
  const handle = profile.handle;

  // ── Export PDF ──

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/export/${handle}/pdf`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${resumeTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // ── Print ──

  const handlePrint = () => {
    window.open(`/u/${handle}?print=1`, '_blank');
  };

  // ── Preview in new tab ──

  const handlePreview = () => {
    window.open(`/u/${handle}`, '_blank');
  };

  return (
    <div className="flex w-full items-center justify-center px-4 py-1.5">
      <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/80 px-3 py-1 shadow-sm backdrop-blur-sm">
        {/* Resume title */}
        <span className="mr-2 max-w-[200px] truncate text-xs font-medium text-foreground/80">
          {resumeTitle}
        </span>

        <ToolbarSeparator />

        {/* Undo / Redo — placeholders for future implementation */}
        <ToolbarButton icon={<Undo2 className="h-4 w-4" />} label="Undo" disabled />
        <ToolbarButton icon={<Redo2 className="h-4 w-4" />} label="Redo" disabled />

        <ToolbarSeparator />

        {/* Design — placeholder for future theme/style customisation */}
        <ToolbarButton icon={<Palette className="h-4 w-4" />} label="Design & Theme" disabled />

        <ToolbarSeparator />

        {/* Export PDF */}
        <ToolbarButton
          icon={<FileDown className="h-4 w-4" />}
          label="Download PDF"
          onClick={() => void handleExportPDF()}
          loading={isExporting}
        />

        {/* Print */}
        <ToolbarButton icon={<Printer className="h-4 w-4" />} label="Print" onClick={handlePrint} />

        {/* Open in new tab */}
        <ToolbarButton
          icon={<ExternalLink className="h-4 w-4" />}
          label="Preview in new tab"
          onClick={handlePreview}
        />

        <ToolbarSeparator />

        {/* Share — uses the existing ShareDialog */}
        <ShareDialog profile={profile} />
      </div>
    </div>
  );
}
