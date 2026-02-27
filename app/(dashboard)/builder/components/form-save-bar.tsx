'use client';

import { Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface FormSaveBarProps {
  show: boolean;
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  sticky?: boolean;
  variant?: 'default' | 'entry';
}

export function FormSaveBar({
  show,
  canSave,
  isSaving,
  onSave,
  onDiscard,
  sticky = true,
  variant = 'default',
}: FormSaveBarProps) {
  if (!show) return null;

  const isEntryVariant = variant === 'entry';

  return (
    <div
      className={
        sticky
          ? 'sticky bottom-0 z-10 -mx-5 border-t bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80'
          : 'mt-4 border-t border-border/50 pt-4'
      }
    >
      <div className="flex items-center gap-2">
        <Button
          onClick={onSave}
          disabled={isSaving || !canSave}
          className={isEntryVariant ? 'gap-2' : 'flex-[4] gap-2'}
        >
          {isSaving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
          {isSaving ? 'Saving...' : isEntryVariant ? 'Save' : 'Save Changes'}
        </Button>
        <Button
          variant="outline"
          onClick={onDiscard}
          disabled={isSaving}
          className={isEntryVariant ? 'gap-2' : 'flex-1'}
        >
          <X className="h-4 w-4" />
          {isEntryVariant ? 'Discard' : null}
        </Button>
      </div>
    </div>
  );
}
