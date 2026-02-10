'use client';

import { useClerk } from '@clerk/nextjs';
import {
  AlertTriangle,
  Bell,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  Trash2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import type { Profile } from '@/types';

type ThemeMode = 'light' | 'dark' | 'system';

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

interface SettingsSectionProps {
  profile: Profile;
  onUpdate: (updates: Partial<Profile>) => void;
}

const THEME_OPTIONS: {
  value: ThemeMode;
  label: string;
  description: string;
  icon: typeof Sun;
}[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Always use light mode',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use dark mode',
    icon: Moon,
  },
  {
    value: 'system',
    label: 'System',
    description: 'Follow system preference',
    icon: Monitor,
  },
];

export function SettingsSection({ profile }: SettingsSectionProps) {
  const { signOut } = useClerk();
  const { theme: currentTheme, setTheme: setNextTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [profileViewAlerts, setProfileViewAlerts] = useState(false);

  // Delete account state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'warning' | 'confirm' | 'deleting'>('warning');
  const [confirmText, setConfirmText] = useState('');
  const [accountData, setAccountData] = useState<AccountDataSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Avoid hydration mismatch for theme UI
  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = (mounted ? currentTheme : 'system') as ThemeMode;

  // Apply theme change via next-themes
  const handleThemeChange = (newTheme: ThemeMode) => {
    setNextTheme(newTheme);
  };

  // Fetch account data when delete dialog opens
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
    } catch (error) {
      console.error('Failed to fetch account data:', error);
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
      const response = await fetch('/api/account', {
        method: 'DELETE',
      });

      if (response.ok) {
        // Sign out and redirect to home
        await signOut({ redirectUrl: '/' });
      } else {
        const data = await response.json();
        setDeleteError(data.message || 'Failed to delete account');
        setDeleteStep('confirm');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
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
      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle>Appearance</CardTitle>
          </div>
          <CardDescription>Customize how Follio looks for you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Theme</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = theme === option.value;

                return (
                  <button
                    key={option.value}
                    onClick={() => handleThemeChange(option.value)}
                    className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all hover:border-primary/50 ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-muted'
                    }`}
                  >
                    {isSelected && (
                      <Badge className="absolute -right-2 -top-2 h-5 w-5 rounded-full p-0">
                        <span className="sr-only">Selected</span>
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </Badge>
                    )}
                    <Icon
                      className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <div className="text-center">
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>Manage how you receive updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-notifications">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive emails about important updates
              </p>
            </div>
            <Switch
              id="email-notifications"
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="profile-alerts">Profile View Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when someone views your profile
              </p>
            </div>
            <Switch
              id="profile-alerts"
              checked={profileViewAlerts}
              onCheckedChange={setProfileViewAlerts}
            />
          </div>
          <p className="text-xs italic text-muted-foreground">Notification settings coming soon</p>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Privacy</CardTitle>
          </div>
          <CardDescription>Control your data and privacy settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="font-medium">Your Data</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Your profile data is stored securely. You can export or delete your data at any time.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/export/${profile.handle}/json`} download>
                  Export Data
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </div>
          <CardDescription>Irreversible actions for your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Delete Account</div>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account, profile, and all associated data. This action
                cannot be undone.
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
                                Data to be deleted:
                              </div>
                              <ul className="grid grid-cols-2 gap-1 text-muted-foreground">
                                <li>
                                  • {accountData.dataSummary.workExperiences} work experiences
                                </li>
                                <li>• {accountData.dataSummary.educations} education records</li>
                                <li>• {accountData.dataSummary.skills} skills</li>
                                <li>• {accountData.dataSummary.projects} projects</li>
                                <li>• {accountData.dataSummary.certifications} certifications</li>
                                <li>• {accountData.dataSummary.links} links</li>
                              </ul>
                              {accountData.profile && (
                                <p className="mt-2 text-muted-foreground">
                                  Your profile{' '}
                                  <strong>follio.me/{accountData.profile.handle}</strong> will be
                                  permanently removed.
                                </p>
                              )}
                            </div>
                          )}
                          <p className="text-destructive">
                            ⚠️ This action is irreversible. You will not be able to recover your
                            data.
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
                            To confirm, please type <strong>DELETE</strong> in the box below:
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
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Deleting Account...</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="flex flex-col items-center gap-4 py-6">
                          <Loader2 className="h-8 w-8 animate-spin text-destructive" />
                          <p>Please wait while we delete your account and all associated data...</p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                  </>
                )}
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
