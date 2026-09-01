'use client';

import {
  Check,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  FileJson,
  FileText,
  Globe,
  Lock,
  QrCode,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { isPortfolioEnabled } from '@/lib/features';
import { buildResumePdfUrl } from '@/lib/hooks/use-resume-download';
import { resolveResumePageLayout } from '@/lib/resume-design';
import { getFollioUrl, getResumeUrl } from '@/lib/url';
import type { FullProfile } from '@/types';

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

export function ShareSection({ profile }: ShareSectionProps) {
  const [copiedPortfolio, setCopiedPortfolio] = useState(false);
  const [copiedResume, setCopiedResume] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [resumeVisibility, setResumeVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    profile.resumeVisibility || 'PRIVATE'
  );
  const [portfolioVisibility, setPortfolioVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    profile.portfolioVisibility || 'PUBLIC'
  );
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [shareToken, setShareToken] = useState<ShareTokenData | null>(null);
  const [origin, setOrigin] = useState('');
  const [unlistedKey, setUnlistedKey] = useState<string | null>(null);
  const [vanityUsername, setVanityUsername] = useState(profile.handle);
  const [pendingPublicConfirm, setPendingPublicConfirm] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  // Set origin on client side to avoid hydration mismatch
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Fetch unlisted key when any visibility is UNLISTED
  useEffect(() => {
    if (portfolioVisibility === 'UNLISTED' || resumeVisibility === 'UNLISTED') {
      void fetchUnlistedKey();
    }
  }, [portfolioVisibility, resumeVisibility]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/resumes');
        if (res.ok) {
          const data = await res.json();
          if (typeof data.vanityUsername === 'string' && data.vanityUsername) {
            setVanityUsername(data.vanityUsername);
          }
        }
      } catch {
        // Keep profile.handle fallback
      }
    })();
  }, []);

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
  const portfolioUrl = getFollioUrl(
    profile.handle,
    portfolioVisibility === 'UNLISTED' ? unlistedKey : null
  );
  const resumeUrl = getResumeUrl(
    vanityUsername || profile.handle,
    resumeVisibility === 'UNLISTED' ? unlistedKey : null
  );
  const publicUrl = getFollioUrl(profile.handle);

  // Fetch share token on mount and when status changes to PRIVATE
  useEffect(() => {
    if (profile.status === 'PRIVATE') {
      fetchShareToken();
    }
  }, [profile.status]);

  const fetchShareToken = async () => {
    try {
      const res = await fetch('/api/profile/share-token');
      if (res.ok) {
        const data = await res.json();
        setShareToken(data);
      }
    } catch (error) {
      console.error('Failed to fetch share token:', error);
    }
  };

  const handleVisibilityChange = async (
    type: 'resume' | 'portfolio',
    value: 'PUBLIC' | 'UNLISTED' | 'PRIVATE'
  ) => {
    if (type === 'resume' && value === 'PUBLIC') {
      try {
        const res = await fetch('/api/resumes');
        if (res.ok) {
          const data = await res.json();
          if (typeof data.vanityUsername === 'string' && data.vanityUsername) {
            setVanityUsername(data.vanityUsername);
          }
          const otherPublic = (
            data.resumes as Array<{ id: string; resumeTitle: string; resumeVisibility: string }>
          ).find((r) => r.resumeVisibility === 'PUBLIC' && r.id !== profile.id);
          if (otherPublic) {
            setPendingPublicConfirm(otherPublic.resumeTitle || 'another resume');
            return;
          }
        }
      } catch (error) {
        console.error('Failed to check existing public resume:', error);
      }
    }

    await persistVisibility(type, value);
  };

  const persistVisibility = async (
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
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.vanityUsername === 'string' && data.vanityUsername) {
          setVanityUsername(data.vanityUsername);
        }
      }
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
      const layout = resolveResumePageLayout(profile.resumeDesign);
      const pdfUrl = buildResumePdfUrl(profile.handle, layout, window.location.search);
      const response = await fetch(pdfUrl);
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

  // Determine which URL to show based on status
  const tokenUrl =
    shareToken?.token && origin
      ? `${getFollioUrl(profile.handle)}?token=${shareToken.token}`
      : null;

  const qrCodeUrl =
    profile.status === 'PRIVATE' && tokenUrl
      ? tokenUrl
      : portfolioVisibility === 'UNLISTED' && unlistedKey
        ? portfolioUrl
        : publicUrl;

  return (
    <div className="space-y-6 rounded-xl bg-muted/40 p-4">
      {/* Portfolio Card */}
      {isPortfolioEnabled() && (
        <Card className="overflow-hidden border-border">
          {/* Cropped iframe snapshot of portfolio page */}
          <div className="relative h-[220px] w-full overflow-hidden bg-muted">
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
                src={`/u/${profile.handle}/work?preview=true`}
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
              <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                Portfolio
              </Badge>
            </div>
            {/* Visibility badge */}
            <div className="absolute right-3 top-3 z-20">
              <Badge variant="secondary" className="gap-1.5 bg-background/80 backdrop-blur-sm">
                {portfolioVisibility === 'PUBLIC' ? (
                  <Globe className="h-3 w-3 text-muted-foreground" />
                ) : portfolioVisibility === 'UNLISTED' ? (
                  <Lock className="h-3 w-3 text-muted-foreground" />
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
                      {copiedPortfolio ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
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
                  Preview
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <div className="flex gap-1.5">
                <Button
                  variant={portfolioVisibility === 'PUBLIC' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleVisibilityChange('portfolio', 'PUBLIC')}
                  disabled={savingVisibility}
                >
                  Public
                </Button>
                <Button
                  variant={portfolioVisibility === 'UNLISTED' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleVisibilityChange('portfolio', 'UNLISTED')}
                  disabled={savingVisibility}
                >
                  Unlisted
                </Button>
                <Button
                  variant={portfolioVisibility === 'PRIVATE' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleVisibilityChange('portfolio', 'PRIVATE')}
                  disabled={savingVisibility}
                >
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
      )}

      {/* Resume Card */}
      <Card className="overflow-hidden border-border">
        {/* Cropped iframe snapshot of resume page */}
        <div className="relative h-[220px] w-full overflow-hidden bg-muted">
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
              <FileText className="h-3 w-3 text-muted-foreground" />
              Resume
            </Badge>
          </div>
          {/* Visibility badge */}
          <div className="absolute right-3 top-3 z-20">
            <Badge variant="secondary" className="gap-1.5 bg-background/80 backdrop-blur-sm">
              {resumeVisibility === 'PRIVATE' ? (
                <EyeOff className="h-3 w-3 text-muted-foreground" />
              ) : resumeVisibility === 'PUBLIC' ? (
                <Globe className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Lock className="h-3 w-3 text-muted-foreground" />
              )}
              {resumeVisibility === 'PRIVATE'
                ? 'Private'
                : resumeVisibility === 'PUBLIC'
                  ? 'Public'
                  : 'Unlisted'}
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
                Preview
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
            <div className="flex gap-1.5">
              <Button
                variant={resumeVisibility === 'PUBLIC' ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleVisibilityChange('resume', 'PUBLIC')}
                disabled={savingVisibility}
              >
                Public
              </Button>
              <Button
                variant={resumeVisibility === 'UNLISTED' ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleVisibilityChange('resume', 'UNLISTED')}
                disabled={savingVisibility}
              >
                Unlisted
              </Button>
              <Button
                variant={resumeVisibility === 'PRIVATE' ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleVisibilityChange('resume', 'PRIVATE')}
                disabled={savingVisibility}
              >
                Private
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {resumeVisibility === 'PRIVATE'
              ? 'Only you can view your resume. No one else has access.'
              : resumeVisibility === 'PUBLIC'
                ? `Anyone can view your resume at follio.me/${vanityUsername || profile.handle}. Only one resume can be public.`
                : 'Only people with the secure link can view your resume. The link does not include your username.'}
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
                  <p className="text-xs text-muted-foreground">
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
              <FileText className="h-5 w-5 text-muted-foreground" />
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
              <FileJson className="h-5 w-5 text-muted-foreground" />
              <div className="text-left">
                <div className="font-medium">Export as JSON</div>
                <div className="text-xs text-muted-foreground">Backup your profile data</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingPublicConfirm !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingPublicConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make this your public resume?</AlertDialogTitle>
            <AlertDialogDescription>
              Only one resume can be public. Making this public will switch{' '}
              <strong>{pendingPublicConfirm}</strong> to Unlisted. Your public URL ( follio.me/
              {vanityUsername || profile.handle}) will then show this resume.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingVisibility}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingPublicConfirm(null);
                void persistVisibility('resume', 'PUBLIC');
              }}
              disabled={savingVisibility}
            >
              Make this public
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
