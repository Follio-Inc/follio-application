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
    // Store return URL so onboarding can redirect back after completion
    sessionStorage.setItem('importReturnUrl', '/builder');
    router.push('/onboarding/import');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Import & Sync
          </DialogTitle>
          <DialogDescription>
            Import data from your resume, GitHub, LinkedIn, or other sources. You&apos;ll be able to
            review and edit before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            You&apos;ll be redirected to the import page where you can connect accounts and upload
            your resume. After reviewing, your profile will be updated.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGoToImport}>Go to Import</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
