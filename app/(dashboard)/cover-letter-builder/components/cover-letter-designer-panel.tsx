'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { SharedPaperDesignControls } from '@/components/document-design/shared-paper-design-controls';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  COVER_LETTER_DESIGN_DEFAULTS,
  mergeCoverLetterDesign,
  type CoverLetterDesign,
} from '@/lib/cover-letter';
import { DOCUMENT_DESIGN_DEFAULTS, type DocumentDesign } from '@/lib/document-design';
import { cn } from '@/lib/utils';

import { readCoverLetterSaveError, useCoverLetterStore } from '../cover-letter-store';

const DESIGN_SAVE_DEBOUNCE_MS = 600;

function toRequiredDocumentDesign(design: Required<CoverLetterDesign>): Required<DocumentDesign> {
  return {
    ...DOCUMENT_DESIGN_DEFAULTS,
    colorTheme: design.colorTheme,
    headingColor: design.headingColor,
    accentColor: design.accentColor,
    fontFamily: design.fontFamily,
    nameFontFamily: design.nameFontFamily,
    headingFontFamily: design.headingFontFamily,
    dividerStyle: design.dividerStyle,
    fontSize: design.fontSize,
    density: design.density,
    nameFontSize: design.nameFontSize,
    headingFontSize: design.headingFontSize,
    nameStyle: design.nameStyle,
    headingStyle: design.headingStyle,
    bodyStyle: design.bodyStyle,
    justifyAll: design.justifyAll,
    pageLayout: design.pageLayout,
  };
}

/**
 * Cover letter designer — shared paper controls + letter particulars.
 */
export function CoverLetterDesignerPanel() {
  const draft = useCoverLetterStore((s) => s.draft);
  const updateDesign = useCoverLetterStore((s) => s.updateDesign);
  const setSavingDesign = useCoverLetterStore((s) => s.setSavingDesign);
  const setSaveError = useCoverLetterStore((s) => s.setSaveError);
  const isSavingDesign = useCoverLetterStore((s) => s.isSavingDesign);
  const saveError = useCoverLetterStore((s) => s.saveError);

  const [design, setDesign] = useState(() => mergeCoverLetterDesign(draft.design));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDesign(mergeCoverLetterDesign(draft.design));
  }, [draft.design]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const persistDesign = useCallback(
    (next: CoverLetterDesign) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSavingDesign(true);
      setSaveError(null);
      saveTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/cover-letters/${draft.id}/design`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
          if (!res.ok) {
            setSaveError(await readCoverLetterSaveError(res, "Couldn't save design. Try again."));
          }
        } catch {
          setSaveError("Couldn't save design. Check your connection and try again.");
        } finally {
          setSavingDesign(false);
        }
      }, DESIGN_SAVE_DEBOUNCE_MS);
    },
    [draft.id, setSaveError, setSavingDesign]
  );

  const onChange = useCallback(
    (patch: Partial<CoverLetterDesign>) => {
      const next = mergeCoverLetterDesign({ ...design, ...patch });
      setDesign(next);
      updateDesign(patch);
      persistDesign(next);
    },
    [design, persistDesign, updateDesign]
  );

  const resetDefaults = useCallback(() => {
    const next = mergeCoverLetterDesign({ ...COVER_LETTER_DESIGN_DEFAULTS });
    setDesign(next);
    updateDesign(next);
    persistDesign(next);
  }, [persistDesign, updateDesign]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Design</h2>
          <p
            className={cn('text-[11px]', saveError ? 'text-destructive' : 'text-muted-foreground')}
            role={saveError ? 'alert' : undefined}
          >
            {saveError ? saveError : isSavingDesign ? 'Saving…' : 'Matches resume paper theme'}
          </p>
        </div>
        <button
          type="button"
          onClick={resetDefaults}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Reset
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          <SharedPaperDesignControls
            design={toRequiredDocumentDesign(design)}
            onChange={(patch) => onChange(patch)}
            typographyRoles={['body']}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
