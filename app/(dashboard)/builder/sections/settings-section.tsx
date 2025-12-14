'use client';

import { useState } from 'react';
import { Check, Copy, AlertTriangle, Globe, Lock, FileEdit, Eye } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import type { Profile } from '@/types';

type ProfileStatus = 'DRAFT' | 'PUBLIC' | 'PRIVATE';

interface SettingsSectionProps {
  profile: Profile;
  onUpdate: (updates: Partial<Profile>) => void;
}

const STATUS_OPTIONS: { value: ProfileStatus; label: string; description: string; icon: typeof Globe }[] = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Anyone can view your profile',
    icon: Globe,
  },
  {
    value: 'PRIVATE',
    label: 'Private',
    description: 'Only accessible via share links',
    icon: Lock,
  },
  {
    value: 'DRAFT',
    label: 'Draft',
    description: 'Only you can see this profile',
    icon: FileEdit,
  },
];

export function SettingsSection({ profile, onUpdate }: SettingsSectionProps) {
  const [handle, setHandle] = useState(profile.handle);
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSuccess, setHandleSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/u/${profile.handle}`
    : `/u/${profile.handle}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const validateHandle = (value: string) => {
    if (!value) return 'Handle is required';
    if (value.length < 3) return 'Handle must be at least 3 characters';
    if (value.length > 30) return 'Handle must be less than 30 characters';
    if (!/^[a-z0-9-]+$/.test(value)) return 'Handle can only contain lowercase letters, numbers, and hyphens';
    if (value.startsWith('-') || value.endsWith('-')) return 'Handle cannot start or end with a hyphen';
    return null;
  };

  const checkHandleAvailability = async () => {
    const error = validateHandle(handle);
    if (error) {
      setHandleError(error);
      return;
    }

    if (handle === profile.handle) {
      setHandleSuccess(true);
      return;
    }

    setIsCheckingHandle(true);
    setHandleError(null);
    setHandleSuccess(false);

    try {
      const res = await fetch(`/api/profile/check-handle?handle=${handle}`);
      const data = await res.json();
      
      if (data.available) {
        setHandleSuccess(true);
        onUpdate({ handle });
      } else {
        setHandleError('This handle is already taken');
      }
    } catch {
      setHandleError('Failed to check handle availability');
    } finally {
      setIsCheckingHandle(false);
    }
  };

  const handleStatusChange = (status: ProfileStatus) => {
    onUpdate({ status });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile URL</CardTitle>
          <CardDescription>Choose your unique profile handle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Handle</Label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-md border bg-muted/50">
                <span className="px-3 text-muted-foreground">/u/</span>
                <Input
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value.toLowerCase());
                    setHandleError(null);
                    setHandleSuccess(false);
                  }}
                  className="border-0 bg-transparent pl-0"
                  placeholder="your-handle"
                />
              </div>
              <Button
                onClick={checkHandleAvailability}
                disabled={isCheckingHandle || handle === profile.handle}
                variant="secondary"
              >
                {isCheckingHandle ? 'Checking...' : 'Update'}
              </Button>
            </div>
            {handleError && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {handleError}
              </p>
            )}
            {handleSuccess && (
              <p className="flex items-center gap-1 text-sm text-green-600">
                <Check className="h-4 w-4" />
                Handle is available!
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Public URL</Label>
            <div className="flex gap-2">
              <Input value={publicUrl} readOnly className="bg-muted/50" />
              <Button variant="outline" onClick={handleCopy} className="gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
          <CardDescription>Control who can see your profile</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {STATUS_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = profile.status === option.value;
              
              return (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all hover:border-primary/50 ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-muted'
                  }`}
                >
                  {isSelected && (
                    <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0">
                      <Check className="h-3 w-3" />
                    </Badge>
                  )}
                  <Icon className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile Preview</CardTitle>
          <CardDescription>See how your profile looks to visitors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              View your profile as it appears to others based on current settings.
            </div>
            <Button asChild className="gap-2">
              <a href={`/u/${profile.handle}`} target="_blank" rel="noopener">
                <Eye className="h-4 w-4" />
                Preview Profile
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for your profile</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Delete Profile</div>
              <div className="text-sm text-muted-foreground">
                Permanently delete your profile and all associated data. This action cannot be undone.
              </div>
            </div>
            <Button variant="destructive" className="shrink-0">
              Delete Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
