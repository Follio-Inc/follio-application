'use client';

import { AlertTriangle, Bell, Monitor, Moon, Palette, Shield, Sun, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import type { Profile } from '@/types';

type ThemeMode = 'light' | 'dark' | 'system';

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

export function SettingsSection({ profile, onUpdate }: SettingsSectionProps) {
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [profileViewAlerts, setProfileViewAlerts] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load theme preference from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as ThemeMode | null;
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      setTheme(savedTheme);
    }
  }, []);

  // Apply theme change
  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);

    // Apply theme to document
    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    if (newTheme === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(systemPrefersDark ? 'dark' : 'light');
    } else {
      root.classList.add(newTheme);
    }
  };

  const handleDeleteProfile = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'DELETE',
      });

      if (response.ok) {
        // Redirect to home or show success
        window.location.href = '/';
      } else {
        console.error('Failed to delete profile');
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
    } finally {
      setIsDeleting(false);
    }
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
                <a href={`/api/export/${profile.handle}?format=json`} download>
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
          <CardDescription>Irreversible actions for your profile</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Delete Profile</div>
              <p className="text-sm text-muted-foreground">
                Permanently delete your profile and all associated data. This action cannot be
                undone.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="shrink-0 gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete Profile
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your profile,
                    including all your work experience, education, projects, and other data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteProfile}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? 'Deleting...' : 'Yes, delete my profile'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
