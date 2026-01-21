'use client';

import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  FileText,
  Globe,
  Key,
  Link2,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  Share2,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { Profile } from '@/types';

type ProfileStatus = 'DRAFT' | 'PUBLIC' | 'PRIVATE';

interface ShareTokenData {
  token: string | null;
  handle: string;
  expiresAt: string | null;
  viewCount: number;
}

interface ShareSectionProps {
  profile: Profile;
  onUpdateAction: (updates: Partial<Profile>) => void;
}

const STATUS_OPTIONS: {
  value: ProfileStatus;
  label: string;
  description: string;
  icon: typeof Globe;
  color: string;
}[] = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Anyone with the link can view',
    icon: Globe,
    color: 'text-green-600',
  },
  {
    value: 'PRIVATE',
    label: 'Unlisted',
    description: 'Requires a share link with token',
    icon: Link2,
    color: 'text-yellow-600',
  },
  {
    value: 'DRAFT',
    label: 'Draft',
    description: 'Only you can see this',
    icon: Lock,
    color: 'text-muted-foreground',
  },
];

export function ShareSection({ profile, onUpdateAction }: ShareSectionProps) {
  const [handle, setHandle] = useState(profile.handle);
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSuccess, setHandleSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<ShareTokenData | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const publicUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/u/${profile.handle}`
      : `/u/${profile.handle}`;

  // Fetch share token on mount and when status changes to PRIVATE
  useEffect(() => {
    if (profile.status === 'PRIVATE') {
      fetchShareToken();
    }
  }, [profile.status]);

  const fetchShareToken = async () => {
    setIsLoadingToken(true);
    try {
      const res = await fetch('/api/profile/share-token');
      if (res.ok) {
        const data = await res.json();
        setShareToken(data);
      }
    } catch (error) {
      console.error('Failed to fetch share token:', error);
    } finally {
      setIsLoadingToken(false);
    }
  };

  const generateShareToken = async () => {
    setIsGeneratingToken(true);
    try {
      const res = await fetch('/api/profile/share-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setShareToken(data);
      }
    } catch (error) {
      console.error('Failed to generate share token:', error);
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const revokeShareToken = async () => {
    if (!shareToken?.token) return;

    try {
      await fetch(`/api/profile/share-token?token=${shareToken.token}`, {
        method: 'DELETE',
      });
      setShareToken(null);
    } catch (error) {
      console.error('Failed to revoke share token:', error);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyTokenUrl = async () => {
    if (!shareToken?.token) return;
    const tokenUrl = `${window.location.origin}/u/${profile.handle}?token=${shareToken.token}`;
    await navigator.clipboard.writeText(tokenUrl);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const validateHandle = (value: string) => {
    if (!value) return 'Handle is required';
    if (value.length < 3) return 'Handle must be at least 3 characters';
    if (value.length > 30) return 'Handle must be less than 30 characters';
    if (!/^[a-z0-9-]+$/.test(value))
      return 'Handle can only contain lowercase letters, numbers, and hyphens';
    if (value.startsWith('-') || value.endsWith('-'))
      return 'Handle cannot start or end with a hyphen';
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
        onUpdateAction({ handle });
      } else {
        setHandleError('This handle is already taken');
      }
    } catch {
      setHandleError('Failed to check handle availability');
    } finally {
      setIsCheckingHandle(false);
    }
  };

  const handleStatusChange = async (status: ProfileStatus) => {
    onUpdateAction({ status });

    // Save immediately
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting('pdf');
    try {
      window.open(`/api/export/${profile.handle}?format=pdf`, '_blank');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportJSON = async () => {
    setIsExporting('json');
    try {
      const response = await fetch(`/api/export/${profile.handle}?format=json`);
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${profile.handle}-profile.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(null);
    }
  };

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === profile.status) || STATUS_OPTIONS[2];
  const StatusIcon = currentStatus.icon;

  // Determine which URL to show based on status
  const tokenUrl = shareToken?.token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/u/${profile.handle}?token=${shareToken.token}`
    : null;

  const displayUrl = profile.status === 'PRIVATE' && tokenUrl ? tokenUrl : publicUrl;

  const qrCodeUrl = profile.status === 'PRIVATE' && tokenUrl ? tokenUrl : publicUrl;

  return (
    <div className="space-y-6">
      {/* Quick Share Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            <CardTitle>Share Your Follio</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Show different content based on status */}
          {profile.status === 'DRAFT' ? (
            <div className="rounded-lg border border-dashed bg-muted/50 p-4 text-center">
              <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Your profile is in draft mode. Change visibility to share it.
              </p>
            </div>
          ) : profile.status === 'PRIVATE' ? (
            <>
              {/* Unlisted mode - show token-based sharing */}
              {isLoadingToken ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : shareToken?.token ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-lg border bg-background p-3">
                      <div className="flex items-center justify-between gap-2">
                        <code className="truncate text-sm font-medium">{tokenUrl}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyTokenUrl}
                          className="h-8 shrink-0 gap-2"
                        >
                          {copiedToken ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                          {copiedToken ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        {shareToken.viewCount} views
                      </span>
                      {shareToken.expiresAt && (
                        <span>Expires: {new Date(shareToken.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={generateShareToken}
                        disabled={isGeneratingToken}
                        className="h-8 gap-1"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${isGeneratingToken ? 'animate-spin' : ''}`}
                        />
                        New Link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={revokeShareToken}
                        className="h-8 gap-1 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                        Revoke
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-dashed bg-muted/50 p-4 text-center">
                    <Key className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Generate a share link to let others view your unlisted profile.
                    </p>
                  </div>
                  <Button
                    onClick={generateShareToken}
                    disabled={isGeneratingToken}
                    className="w-full gap-2"
                  >
                    {isGeneratingToken ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4" />
                    )}
                    Generate Share Link
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Public mode - regular sharing */}
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-sm font-medium">{publicUrl}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopy}
                      className="h-8 shrink-0 gap-2"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Status badge and preview button - show for non-draft */}
          {profile.status !== 'DRAFT' && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild className="gap-2">
                <a
                  href={profile.status === 'PRIVATE' && tokenUrl ? tokenUrl : publicUrl}
                  target="_blank"
                  rel="noopener"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
                <StatusIcon className={`h-3.5 w-3.5 ${currentStatus.color}`} />
                {currentStatus.label}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visibility Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Visibility</CardTitle>
          <CardDescription>Control who can view your profile</CardDescription>
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
                    <Badge className="absolute -right-2 -top-2 h-5 w-5 rounded-full p-0">
                      <Check className="h-3 w-3" />
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
        </CardContent>
      </Card>

      {/* Custom URL */}
      <Card>
        <CardHeader>
          <CardTitle>Custom URL</CardTitle>
          <CardDescription>Choose your unique profile handle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Your Handle</Label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-md border bg-muted/50">
                <span className="px-3 text-muted-foreground">follio.dev/u/</span>
                <Input
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
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
                {handle === profile.handle ? 'This is your current handle' : 'Handle updated!'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* QR Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR Code
          </CardTitle>
          <CardDescription>Scan to open your profile</CardDescription>
        </CardHeader>
        <CardContent>
          {profile.status === 'DRAFT' ? (
            <div className="rounded-lg border border-dashed bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Make your profile public or unlisted to generate a QR code.
              </p>
            </div>
          ) : profile.status === 'PRIVATE' && !shareToken?.token ? (
            <div className="rounded-lg border border-dashed bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Generate a share link first to get a QR code for your unlisted profile.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div
                ref={qrRef}
                className="flex h-40 w-40 items-center justify-center rounded-lg border bg-white p-2"
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrCodeUrl)}`}
                  alt="QR Code"
                  className="h-full w-full"
                />
              </div>
              <div className="flex-1 space-y-2 text-center sm:text-left">
                <p className="text-sm text-muted-foreground">
                  Share your QR code on business cards, presentations, or anywhere you want people
                  to find your profile quickly.
                </p>
                {profile.status === 'PRIVATE' && (
                  <p className="text-xs text-yellow-600">
                    Note: This QR code contains your share token. Generate a new link if you want to
                    revoke access.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCodeUrl)}`;
                    link.download = `${profile.handle}-qr.png`;
                    link.click();
                  }}
                >
                  <Download className="h-4 w-4" />
                  Download QR Code
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Download your profile data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 p-4"
              onClick={handleExportPDF}
              disabled={isExporting === 'pdf'}
            >
              <FileText className="h-8 w-8 text-red-500" />
              <div className="text-left">
                <div className="font-medium">Export as PDF</div>
                <div className="text-xs text-muted-foreground">Download a printable resume</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 p-4"
              onClick={handleExportJSON}
              disabled={isExporting === 'json'}
            >
              <FileJson className="h-8 w-8 text-yellow-500" />
              <div className="text-left">
                <div className="font-medium">Export as JSON</div>
                <div className="text-xs text-muted-foreground">Backup your profile data</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Social Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Social Preview</CardTitle>
          <CardDescription>How your profile appears when shared on social media</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border bg-card">
            {/* Mock social card preview */}
            <div className="aspect-[1.91/1] bg-gradient-to-br from-primary/20 to-primary/5 p-6">
              <div className="flex h-full flex-col justify-end">
                <div className="text-lg font-bold">
                  {profile.firstName} {profile.lastName}
                </div>
                <div className="text-sm text-muted-foreground">
                  {profile.headline || 'Professional Portfolio'}
                </div>
              </div>
            </div>
            <div className="border-t p-3">
              <div className="text-xs text-muted-foreground">follio.dev</div>
              <div className="truncate text-sm font-medium">
                {profile.firstName} {profile.lastName} | Follio
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {profile.summary?.slice(0, 100) || 'View my professional portfolio and resume'}
                {profile.summary && profile.summary.length > 100 ? '...' : ''}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            This is a preview. Actual appearance may vary by platform.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
