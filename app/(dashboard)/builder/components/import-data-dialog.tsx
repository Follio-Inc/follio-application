'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ImportDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  onImportComplete: () => void;
}

export function ImportDataDialog({ open, onOpenChange }: ImportDataDialogProps) {
  const router = useRouter();

  const handleGoToImport = () => {
    onOpenChange(false);
    router.push('/builder/data-sources');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Data Sources
          </DialogTitle>
          <DialogDescription>
            Import and manage data from your resume, GitHub, LinkedIn, and other sources. New items
            are merged into your profile — your manual edits are never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            You&apos;ll see all your connected sources and can re-import or add new data. Duplicates
            are automatically detected and skipped.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGoToImport}>Open Data Sources</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
