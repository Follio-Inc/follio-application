'use client';

import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  Globe,
  Grid3X3,
  Link2,
  Lock,
  QrCode,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { getPortfolioUrl, getResumeUrl } from '@/lib/url';
import type { FullProfile } from '@/types';

type ProfileStatus = 'DRAFT' | 'PUBLIC' | 'PRIVATE';

interface ShareTokenData {
  token: string | null;
  handle: string;
  expiresAt: string | null;
  viewCount: number;
}

interface ShareSectionProps {
  profile: FullProfile;
  onUpdateAction: (updates: Partial<FullProfile>) => void;
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
  const [isEditingHandle, setIsEditingHandle] = useState(false);
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSuccess, setHandleSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedPortfolio, setCopiedPortfolio] = useState(false);
  const [copiedResume, setCopiedResume] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [resumeVisibility, setResumeVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    profile.resumeVisibility || 'UNLISTED'
  );
  const [portfolioVisibility, setPortfolioVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    profile.portfolioVisibility || 'PUBLIC'
  );
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [shareToken, setShareToken] = useState<ShareTokenData | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [origin, setOrigin] = useState('');
  const [unlistedKey, setUnlistedKey] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  // Set origin on client side to avoid hydration mismatch
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Fetch unlisted key when any visibility is UNLISTED
  useEffect(() => {
    if (portfolioVisibility === 'UNLISTED' || resumeVisibility === 'UNLISTED') {
      fetchUnlistedKey();
    }
  }, [portfolioVisibility, resumeVisibility]);

  const fetchUnlistedKey = async () => {
    try {
      const res = await fetch('/api/profile/unlisted-key');
      if (res.ok) {
        const data = await res.json();
        setUnlistedKey(data.unlistedKey);
      }
    } catch (error) {
      console.error('Failed to fetch unlisted key:', error);
    }
  };

  // Compute URLs based on visibility
  const portfolioUrl = getPortfolioUrl(
    profile.handle,
    portfolioVisibility === 'UNLISTED' ? unlistedKey : null
  );
  const resumeUrl = getResumeUrl(
    profile.handle,
    resumeVisibility === 'UNLISTED' ? unlistedKey : null
  );
  const publicUrl = getPortfolioUrl(profile.handle);

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
    if (!shareToken?.token || !origin) return;
    const tokenUrl = `${getPortfolioUrl(profile.handle)}?token=${shareToken.token}`;
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
      setIsEditingHandle(false);
      return;
    }

    setIsCheckingHandle(true);
    setHandleError(null);
    setHandleSuccess(false);

    try {
      const res = await fetch(`/api/profile/check-handle?handle=${handle}`);
      const data = await res.json();

      if (data.available) {
        // Persist the handle change immediately via PATCH
        const patchRes = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle }),
        });

        if (patchRes.ok) {
          setHandleSuccess(true);
          onUpdateAction({ handle });
          setIsEditingHandle(false);
        } else {
          const patchData = await patchRes.json();
          setHandleError(patchData.error || 'Failed to update handle');
        }
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

  const handleVisibilityChange = async (
    type: 'resume' | 'portfolio',
    value: 'PUBLIC' | 'UNLISTED' | 'PRIVATE'
  ) => {
    const prev = type === 'resume' ? resumeVisibility : portfolioVisibility;
    if (type === 'resume') setResumeVisibility(value);
    else setPortfolioVisibility(value);

    setSavingVisibility(true);
    try {
      const payload =
        type === 'resume' ? { resumeVisibility: value } : { portfolioVisibility: value };
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to update visibility:', error);
      if (type === 'resume') setResumeVisibility(prev);
      else setPortfolioVisibility(prev);
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting('pdf');
    try {
      const response = await fetch(`/api/export/${profile.handle}/pdf`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${profile.handle}-resume.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportJSON = async () => {
    setIsExporting('json');
    try {
      const response = await fetch(`/api/export/${profile.handle}/json`);
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
  const tokenUrl =
    shareToken?.token && origin
      ? `${getPortfolioUrl(profile.handle)}?token=${shareToken.token}`
      : null;

  const qrCodeUrl =
    profile.status === 'PRIVATE' && tokenUrl
      ? tokenUrl
      : portfolioVisibility === 'UNLISTED' && unlistedKey
        ? portfolioUrl
        : publicUrl;

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const topSkills = profile.skills.slice(0, 4).map((s) => s.name);

  // Portfolio summary data
  const projects = profile.projects;
  const projectCount = projects.length;
  const topProjects = projects.slice(0, 3);

  // Resume summary data
  const workExperiences = profile.workExperiences;
  const educations = profile.educations;
  const certifications = profile.certifications;
  const skillCount = profile.skills.length;

  return (
    <div className="space-y-6 rounded-xl bg-muted/40 p-4">
      {/* Portfolio Card */}
      <Card className="overflow-hidden border-primary/20">
        {/* Cropped iframe snapshot of portfolio page */}
        <div className="relative h-[220px] w-full overflow-hidden bg-muted">
          {/* Accent top bar */}
          <div className="absolute inset-x-0 top-0 z-20 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
          {/*
            Zoom into the center content, skip nav/top bars:
            - Scale the page to 50% so more content is visible
            - Shift up to skip the navbar (~120px at full scale = ~60px at 50%)
            - Shift left to center the max-w-5xl content
          */}
          <div
            className="pointer-events-none absolute left-1/2 top-0"
            style={{
              width: '1024px',
              height: '1400px',
              transform: 'scale(0.65) translate(-50%, -140px)',
              transformOrigin: 'top left',
            }}
          >
            <iframe
              src={`/u/${profile.handle}`}
              title="Portfolio preview"
              className="h-full w-full border-0"
              tabIndex={-1}
              loading="lazy"
            />
          </div>
          {/* Gradient fade at bottom */}
          <div className="absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-background to-transparent" />
          {/* Overlay badge */}
          <div className="absolute left-3 top-3 z-20">
            <Badge variant="secondary" className="gap-1.5 bg-background/80 backdrop-blur-sm">
              <Grid3X3 className="h-3 w-3 text-primary" />
              Portfolio
            </Badge>
          </div>
          {/* Visibility badge */}
          <div className="absolute right-3 top-3 z-20">
            <Badge variant="secondary" className="gap-1.5 bg-background/80 backdrop-blur-sm">
              {portfolioVisibility === 'PUBLIC' ? (
                <Globe className="h-3 w-3 text-green-600" />
              ) : portfolioVisibility === 'UNLISTED' ? (
                <Lock className="h-3 w-3 text-yellow-600" />
              ) : (
                <EyeOff className="h-3 w-3 text-muted-foreground" />
              )}
              {portfolioVisibility === 'PUBLIC'
                ? 'Public'
                : portfolioVisibility === 'UNLISTED'
                  ? 'Unlisted'
                  : 'Private'}
            </Badge>
          </div>
        </div>

        <CardContent className="space-y-4 pt-5">
          {/* URL row */}
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="truncate text-sm font-medium">{portfolioUrl}</code>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(portfolioUrl);
                      setCopiedPortfolio(true);
                      setTimeout(() => setCopiedPortfolio(false), 2000);
                    }}
                    className="h-8 gap-2"
                  >
                    {copiedPortfolio ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedPortfolio ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {/* Actions row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" asChild className="gap-2">
              <a href={portfolioUrl} target="_blank" rel="noopener">
                <Eye className="h-4 w-4" />
                Preview
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
            <div className="flex gap-1.5">
              <Button
                variant={portfolioVisibility === 'PUBLIC' ? 'default' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleVisibilityChange('portfolio', 'PUBLIC')}
                disabled={savingVisibility}
              >
                <Globe className="h-3 w-3" />
                Public
              </Button>
              <Button
                variant={portfolioVisibility === 'UNLISTED' ? 'default' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleVisibilityChange('portfolio', 'UNLISTED')}
                disabled={savingVisibility}
              >
                <Lock className="h-3 w-3" />
                Unlisted
              </Button>
              <Button
                variant={portfolioVisibility === 'PRIVATE' ? 'default' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleVisibilityChange('portfolio', 'PRIVATE')}
                disabled={savingVisibility}
              >
                <EyeOff className="h-3 w-3" />
                Private
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {portfolioVisibility === 'PUBLIC'
              ? 'Anyone can view your portfolio.'
              : portfolioVisibility === 'UNLISTED'
                ? 'Only people with a share link can view your portfolio.'
                : 'Only you can view your portfolio. No one else has access.'}
          </p>
        </CardContent>
      </Card>

      {/* Resume Card */}
      <Card className="overflow-hidden border-amber-500/20">
        {/* Cropped iframe snapshot of resume page */}
        <div className="relative h-[220px] w-full overflow-hidden bg-muted">
          {/* Accent top bar */}
          <div className="absolute inset-x-0 top-0 z-20 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />
          {/*
            Zoom into the center content, skip nav/top bars:
            - Scale the page to 50% so more content is visible
            - Shift up to skip the navbar (~120px at full scale = ~60px at 50%)
            - Shift left to center the max-w-5xl content
          */}
          <div
            className="pointer-events-none absolute left-1/2 top-0"
            style={{
              width: '1024px',
              height: '1400px',
              transform: 'scale(0.65) translate(-50%, -140px)',
              transformOrigin: 'top left',
            }}
          >
            <iframe
              src={`/u/${profile.handle}/resume`}
              title="Resume preview"
              className="h-full w-full border-0"
              tabIndex={-1}
              loading="lazy"
            />
          </div>
          {/* Gradient fade at bottom */}
          <div className="absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-background to-transparent" />
          {/* Overlay badge */}
          <div className="absolute left-3 top-3 z-20">
            <Badge variant="secondary" className="gap-1.5 bg-background/80 backdrop-blur-sm">
              <FileText className="h-3 w-3 text-amber-600" />
              Resume
            </Badge>
          </div>
          {/* Visibility badge */}
          <div className="absolute right-3 top-3 z-20">
            <Badge variant="secondary" className="gap-1.5 bg-background/80 backdrop-blur-sm">
              {resumeVisibility === 'PUBLIC' ? (
                <Globe className="h-3 w-3 text-green-600" />
              ) : resumeVisibility === 'UNLISTED' ? (
                <Lock className="h-3 w-3 text-yellow-600" />
              ) : (
                <EyeOff className="h-3 w-3 text-muted-foreground" />
              )}
              {resumeVisibility === 'PUBLIC'
                ? 'Public'
                : resumeVisibility === 'UNLISTED'
                  ? 'Unlisted'
                  : 'Private'}
            </Badge>
          </div>
        </div>

        <CardContent className="space-y-4 pt-5">
          {/* URL row */}
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="truncate text-sm font-medium">{resumeUrl}</code>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(resumeUrl);
                      setCopiedResume(true);
                      setTimeout(() => setCopiedResume(false), 2000);
                    }}
                    className="h-8 gap-2"
                  >
                    {copiedResume ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedResume ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {/* Actions row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" asChild className="gap-2">
              <a href={resumeUrl} target="_blank" rel="noopener">
                <Eye className="h-4 w-4" />
                Preview
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
            <div className="flex gap-1.5">
              <Button
                variant={resumeVisibility === 'PUBLIC' ? 'default' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleVisibilityChange('resume', 'PUBLIC')}
                disabled={savingVisibility}
              >
                <Globe className="h-3 w-3" />
                Public
              </Button>
              <Button
                variant={resumeVisibility === 'UNLISTED' ? 'default' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleVisibilityChange('resume', 'UNLISTED')}
                disabled={savingVisibility}
              >
                <Lock className="h-3 w-3" />
                Unlisted
              </Button>
              <Button
                variant={resumeVisibility === 'PRIVATE' ? 'default' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleVisibilityChange('resume', 'PRIVATE')}
                disabled={savingVisibility}
              >
                <EyeOff className="h-3 w-3" />
                Private
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {resumeVisibility === 'PUBLIC'
              ? 'Anyone can view your resume. A direct link appears on your portfolio.'
              : resumeVisibility === 'UNLISTED'
                ? 'Only people with a share link can view your resume. Visitors see a \"Request Access\" option on your portfolio.'
                : 'Only you can view your resume. No one else has access.'}
          </p>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
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
    </div>
  );
}
