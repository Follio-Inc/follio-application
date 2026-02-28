'use client';

import { useClerk } from '@clerk/nextjs';
import { AlertTriangle, Download, Loader2, Shield, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

import type { Profile } from '@/types';

// ============================================================================
// Types
// ============================================================================

interface AccountDataSummary {
  user: {
    email: string;
    createdAt: string;
  };
  profile: {
    handle: string;
    status: string;
  } | null;
  dataSummary: {
    workExperiences: number;
    educations: number;
    skills: number;
    projects: number;
    awards: number;
    certifications: number;
    links: number;
    importJobs: number;
    shareTokens: number;
  };
}

interface PrivacySectionProps {
  profile: Profile;
}

// ============================================================================
// Component
// ============================================================================

export function PrivacySection({ profile }: PrivacySectionProps) {
  const { signOut } = useClerk();

  // Delete account state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'warning' | 'confirm' | 'deleting'>('warning');
  const [confirmText, setConfirmText] = useState('');
  const [accountData, setAccountData] = useState<AccountDataSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Delete Account Flow
  // -------------------------------------------------------------------------

  const handleOpenDeleteDialog = async () => {
    setDeleteDialogOpen(true);
    setDeleteStep('warning');
    setConfirmText('');
    setDeleteError(null);

    try {
      const response = await fetch('/api/account');
      if (response.ok) {
        const data = await response.json();
        setAccountData(data);
      }
    } catch {
      // Continue without data summary
    }
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeleteStep('warning');
    setConfirmText('');
    setDeleteError(null);
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') return;

    setDeleteStep('deleting');
    setDeleteError(null);

    try {
      const response = await fetch('/api/account', { method: 'DELETE' });

      if (response.ok) {
        await signOut({ redirectUrl: '/' });
      } else {
        const data = await response.json();
        setDeleteError(data.message || 'Failed to delete account');
        setDeleteStep('confirm');
      }
    } catch {
      setDeleteError('An unexpected error occurred. Please try again.');
      setDeleteStep('confirm');
    }
  };

  const getTotalDataCount = () => {
    if (!accountData) return 0;
    const { dataSummary } = accountData;
    return (
      dataSummary.workExperiences +
      dataSummary.educations +
      dataSummary.skills +
      dataSummary.projects +
      dataSummary.awards +
      dataSummary.certifications +
      dataSummary.links
    );
  };

  return (
    <div className="space-y-6">
      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Your Data
          </CardTitle>
          <CardDescription>Export or manage your profile data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your data is stored securely. You can export a complete copy of your profile data at any
            time as a JSON file.
          </p>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href={`/api/export/${profile.handle}/json`} download>
              <Download className="h-4 w-4" />
              Export All Data
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions. Proceed with caution.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account, profile, and all associated data. This cannot be
                undone.
              </p>
            </div>
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="shrink-0 gap-2"
                  onClick={handleOpenDeleteDialog}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md">
                {deleteStep === 'warning' && (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Delete Your Account?
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-4">
                          <p>
                            This will <strong>permanently delete</strong> your entire Follio account
                            including:
                          </p>
                          {accountData && (
                            <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                              <div className="mb-2 font-medium text-foreground">
                                Data to be deleted ({getTotalDataCount()} items):
                              </div>
                              <ul className="grid grid-cols-2 gap-1 text-muted-foreground">
                                <li>{accountData.dataSummary.workExperiences} work experiences</li>
                                <li>{accountData.dataSummary.educations} education records</li>
                                <li>{accountData.dataSummary.skills} skills</li>
                                <li>{accountData.dataSummary.projects} projects</li>
                                <li>{accountData.dataSummary.certifications} certifications</li>
                                <li>{accountData.dataSummary.links} links</li>
                              </ul>
                              {accountData.profile && (
                                <>
                                  <Separator className="my-2" />
                                  <p className="text-muted-foreground">
                                    Your profile{' '}
                                    <strong className="text-foreground">
                                      follio.me/{accountData.profile.handle}
                                    </strong>{' '}
                                    will be permanently removed.
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                          <p className="font-medium text-destructive">
                            This action is irreversible. You will not be able to recover your data.
                          </p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={handleCloseDeleteDialog}>
                        Cancel
                      </AlertDialogCancel>
                      <Button variant="destructive" onClick={() => setDeleteStep('confirm')}>
                        I understand, continue
                      </Button>
                    </AlertDialogFooter>
                  </>
                )}

                {deleteStep === 'confirm' && (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Confirm Deletion
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-4">
                          <p>
                            Type <strong>DELETE</strong> below to confirm:
                          </p>
                          <Input
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                            placeholder="Type DELETE to confirm"
                            className="font-mono"
                            autoComplete="off"
                            autoFocus
                          />
                          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={handleCloseDeleteDialog}>
                        Cancel
                      </AlertDialogCancel>
                      <Button
                        variant="destructive"
                        onClick={handleDeleteAccount}
                        disabled={confirmText !== 'DELETE'}
                      >
                        Permanently Delete My Account
                      </Button>
                    </AlertDialogFooter>
                  </>
                )}

                {deleteStep === 'deleting' && (
                  <AlertDialogHeader>
                    <AlertDialogTitle>Deleting Account...</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="flex flex-col items-center gap-4 py-6">
                        <Loader2 className="h-8 w-8 animate-spin text-destructive" />
                        <p>Please wait while we delete your account and all associated data...</p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                )}
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
