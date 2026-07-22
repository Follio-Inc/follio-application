'use client';

import { useUser } from '@clerk/nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileText,
  Github,
  Link2,
  Linkedin,
  Loader2,
  Globe,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import * as pdfjsLib from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Area, Point } from 'react-easy-crop';
import Cropper from 'react-easy-crop';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

import {
  ResumeStartChoice,
  type ResumeStartPath,
} from '@/components/onboarding/resume-start-choice';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { extractGitHubUsername, extractLinkedInSlug } from '@/lib/import/profile-url';
import { hasImportStepAction, importStepNextLabel } from '@/lib/onboarding/step-action';
import {
  ONBOARDING_CARD_DESCRIPTION,
  ONBOARDING_CARD_TITLE,
  ONBOARDING_DROPZONE,
  ONBOARDING_DROPZONE_ACTIVE,
  ONBOARDING_FOOTER,
  ONBOARDING_ICON_WELL,
  ONBOARDING_MAIN,
  ONBOARDING_PAGE_SHELL,
  ONBOARDING_PAGE_SUBTITLE,
  ONBOARDING_PAGE_TITLE,
  ONBOARDING_STEP_HEADER,
  ONBOARDING_STEP_TRACK,
  ONBOARDING_SUCCESS_PILL,
  ONBOARDING_SURFACE,
  ONBOARDING_SURFACE_PAD,
} from '@/lib/onboarding-ui';
import { ONBOARDING_TEMPLATE_KEY } from '@/lib/portfolio/templates/onboarding';
import { getDefaultTemplateId } from '@/lib/portfolio/templates/registry';
import { fileToBase64, getBestResolutionImage, parsePhoneWithCountryCode } from '@/lib/utils';

// ─── Storage Constants ────────────────────────────────────────────
const ONBOARDING_IMPORT_STATE_KEY_PREFIX = 'follio_onboarding_import_state_';
const UPLOADED_PHOTO_DB_NAME = 'follio_onboarding';
const UPLOADED_PHOTO_STORE_NAME = 'uploaded_photos';

const getStorageKey = (userId: string | undefined) =>
  userId ? `${ONBOARDING_IMPORT_STATE_KEY_PREFIX}${userId}` : null;

// ─── IndexedDB Helpers ────────────────────────────────────────────
const openPhotoDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(UPLOADED_PHOTO_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(UPLOADED_PHOTO_STORE_NAME)) {
        db.createObjectStore(UPLOADED_PHOTO_STORE_NAME, { keyPath: 'key' });
      }
    };
  });

const savePhotoToIndexedDB = async (key: string, photoBase64: string): Promise<void> => {
  const db = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UPLOADED_PHOTO_STORE_NAME, 'readwrite');
    const store = tx.objectStore(UPLOADED_PHOTO_STORE_NAME);
    const req = store.put({ key, data: photoBase64 });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
};

const getPhotoFromIndexedDB = async (key: string): Promise<string | null> => {
  try {
    const db = await openPhotoDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(UPLOADED_PHOTO_STORE_NAME, 'readonly');
      const store = tx.objectStore(UPLOADED_PHOTO_STORE_NAME);
      const req = store.get(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result?.data || null);
    });
  } catch {
    return null;
  }
};

const clearPhotosFromIndexedDB = async (): Promise<void> => {
  try {
    const db = await openPhotoDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(UPLOADED_PHOTO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(UPLOADED_PHOTO_STORE_NAME);
      const req = store.clear();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  } catch {
    // Ignore errors when clearing
  }
};

const base64ToFile = async (base64: string, filename: string): Promise<File> => {
  const response = await fetch(base64);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

/** Compress an image for Clerk's upload size limit (target 512×512). */
const compressImageForClerk = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new window.Image();

    img.onload = () => {
      const targetSize = 512;
      canvas.width = targetSize;
      canvas.height = targetSize;
      if (!ctx) {
        reject(new Error('No 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0, targetSize, targetSize);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

// ─── SVG Brand Icons ──────────────────────────────────────────────
function MediumIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42zm2.94 0c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75c.66 0 1.19 2.58 1.19 5.75z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.016 3.016 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.016 3.016 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
        fill="#FF0000"
      />
    </svg>
  );
}

function SubstackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"
        fill="#FF6719"
      />
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────
type ImportSource = 'resume' | 'github' | 'linkedin' | 'medium' | 'youtube' | 'substack' | 'links';

interface ImportStatus {
  source: ImportSource;
  status: 'idle' | 'added' | 'importing' | 'success' | 'error';
  message?: string;
  itemsImported?: number;
}

type OnboardingStep = 'resume' | 'photo' | 'accounts' | 'platforms';

const STEPS: OnboardingStep[] = ['resume', 'photo', 'accounts', 'platforms'];

const STEP_META: Record<OnboardingStep, { title: string; subtitle: string }> = {
  resume: {
    title: 'How do you want to start?',
    subtitle: 'Upload an existing resume or build one from scratch',
  },
  photo: {
    title: 'Add a profile photo',
    subtitle: 'Upload a photo to make your profile stand out',
  },
  accounts: {
    title: 'Connect your accounts',
    subtitle: 'Import data from your professional profiles',
  },
  platforms: { title: 'Add more platforms', subtitle: 'Link your content and publications' },
};

const RESUME_UPLOAD_META = {
  title: 'Upload your resume',
  subtitle: "We'll extract your experience, education, skills and more",
} as const;

// ─── Image crop helpers ──────────────────────────────────────────
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new window.Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.crossOrigin = 'anonymous';
    image.src = url;
  });

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/jpeg', 0.92);
}

// ─── Input Normalization Helpers ──────────────────────────────────
/**
 * Extract a clean Medium username from various input formats:
 * - @username → username
 * - username → username
 * - https://medium.com/@username → username
 * - https://medium.com/@username/some-article → username
 * - medium.com/@username → username
 */
function extractMediumUsername(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Try parsing as URL
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('medium.com')) {
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        return pathParts[0].replace(/^@/, '');
      }
    }
  } catch {
    // Not a URL — fall through
  }

  // @username or plain username
  return trimmed.replace(/^@/, '');
}

/**
 * Extract a clean Substack identifier from various input formats:
 * - username → username
 * - @username → username
 * - https://username.substack.com → username
 * - https://username.substack.com/p/some-post → username
 * - username.substack.com → username
 */
function extractSubstackIdentifier(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Try parsing as URL
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('substack.com')) {
      const subdomain = url.hostname.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'substack') {
        return subdomain;
      }
    }
  } catch {
    // Not a URL — fall through
  }

  // Handle bare "username.substack.com" without protocol
  const substackMatch = trimmed.match(/^([\w-]+)\.substack\.com/i);
  if (substackMatch) return substackMatch[1];

  // @username or plain username
  return trimmed.replace(/^@/, '');
}

/**
 * Extract a clean YouTube channel identifier from various input formats.
 * The backend's parseChannelInput already handles most formats, but we
 * do a light cleanup here for edge cases.
 */
function extractYouTubeChannel(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  return trimmed;
}

// ─── Component ────────────────────────────────────────────────────
export default function OnboardingImportPage() {
  const router = useRouter();
  const { user, isLoaded: isUserLoaded } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [hasRestoredPersistedState, setHasRestoredPersistedState] = useState(false);
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);

  // Detect if arriving from builder's "New resume from upload" flow
  const isFromBuilder =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('from') === 'builder';

  // ─── Step navigation ────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('resume');
  const currentStepIndex = STEPS.indexOf(currentStep);
  const progressPercent = ((currentStepIndex + 1) / STEPS.length) * 100;

  // Fallback: if loading takes too long, just show the page
  useEffect(() => {
    const fallbackTimeout = setTimeout(() => setIsCheckingProfile(false), 3000);
    return () => clearTimeout(fallbackTimeout);
  }, []);

  // Check if user already has a profile (skip when coming from builder to add a new resume)
  useEffect(() => {
    if (!isUserLoaded) return;
    if (!user) {
      setIsCheckingProfile(false);
      return;
    }

    // When arriving from builder, the user already has a profile and is creating
    // a new resume via upload — skip the redirect and set the return URL.
    if (isFromBuilder) {
      sessionStorage.setItem('importReturnUrl', '/builder');
      setIsCheckingProfile(false);
      return;
    }

    let timeoutId: NodeJS.Timeout;
    const checkExistingProfile = async () => {
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch('/api/profile', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          if (data?.profile?.handle) {
            router.replace('/');
            return;
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error checking for existing profile:', err);
        }
      }
      setIsCheckingProfile(false);
    };
    checkExistingProfile();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isUserLoaded, user, router, isFromBuilder]);

  // ─── OAuth states ───────────────────────────────────────────────
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [githubDisconnecting, setGithubDisconnecting] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  const [linkedinConnecting, setLinkedinConnecting] = useState(false);
  const [linkedinDisconnecting, setLinkedinDisconnecting] = useState(false);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);

  // ─── Import states ──────────────────────────────────────────────
  const [imports, setImports] = useState<Record<ImportSource, ImportStatus>>({
    resume: { source: 'resume', status: 'idle' },
    github: { source: 'github', status: 'idle' },
    linkedin: { source: 'linkedin', status: 'idle' },
    medium: { source: 'medium', status: 'idle' },
    youtube: { source: 'youtube', status: 'idle' },
    substack: { source: 'substack', status: 'idle' },
    links: { source: 'links', status: 'idle' },
  });

  // ─── Form states ───────────────────────────────────────────────
  const [githubUsername, setGithubUsername] = useState('');
  const [linkedinProfileInput, setLinkedinProfileInput] = useState('');
  const [mediumUsername, setMediumUsername] = useState('');
  const [youtubeChannel, setYoutubeChannel] = useState('');
  const [substackUsername, setSubstackUsername] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [linkUrls, setLinkUrls] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState('');

  // Photo states
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoCrop, setPhotoCrop] = useState<Point>({ x: 0, y: 0 });
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoRotation, setPhotoRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);

  // Resume
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [, setResumeFileUrl] = useState<string | null>(null);
  const [resumeThumbnail, setResumeThumbnail] = useState<string | null>(null);
  const [resumeParsingPromise, setResumeParsingPromise] = useState<Promise<void> | null>(null);
  const [isWaitingForParsing, setIsWaitingForParsing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [showDiscardResumeDialog, setShowDiscardResumeDialog] = useState(false);
  // Imported data
  const [importedData, setImportedData] = useState<Record<string, unknown>>({});

  // drag ref
  const resumeDropRef = useRef<HTMLDivElement | null>(null);
  const photoDropRef = useRef<HTMLDivElement | null>(null);

  // ─── External accounts from Clerk ──────────────────────────────
  const connectedGithub = user?.externalAccounts?.find((a) => a.provider === 'github');
  const githubUsernameFromAccount = connectedGithub?.username ?? null;

  const connectedLinkedin = user?.externalAccounts?.find((a) => {
    const p = a.provider as string;
    return (
      p === 'linkedin_oidc' ||
      p === 'linkedin' ||
      p === 'oauth_linkedin_oidc' ||
      p === 'oauth_linkedin'
    );
  });

  const linkedinName = (() => {
    const li = importedData.linkedin as Record<string, unknown> | undefined;
    const liProfile = li?.profile as Record<string, unknown> | undefined;
    const fromLI = li?.fromLinkedIn as Record<string, unknown> | undefined;
    if (fromLI?.firstName || fromLI?.lastName) {
      return [fromLI.firstName, fromLI.lastName].filter(Boolean).join(' ');
    }
    if (liProfile?.firstName && liProfile?.lastName)
      return `${liProfile.firstName} ${liProfile.lastName}`;
    if (fromLI?.username) return String(fromLI.username);
    if (connectedLinkedin?.username) return connectedLinkedin.username;
    if (linkedinProfileInput.trim()) {
      const slug = extractLinkedInSlug(linkedinProfileInput);
      if (slug) return slug;
    }
    if (connectedLinkedin?.firstName && connectedLinkedin?.lastName)
      return `${connectedLinkedin.firstName} ${connectedLinkedin.lastName}`;
    return null;
  })();

  const linkedinHeadline = (() => {
    const li = importedData.linkedin as Record<string, unknown> | undefined;
    const fromLI = li?.fromLinkedIn as Record<string, unknown> | undefined;
    const profile = li?.profile as Record<string, unknown> | undefined;
    const headline = (fromLI?.headline || profile?.headline) as string | undefined;
    return headline?.trim() || null;
  })();

  /** Avatar from OAuth or from a successful link/username import. */
  const linkedinAvatarUrl = (() => {
    if (connectedLinkedin?.imageUrl) return connectedLinkedin.imageUrl;
    const li = importedData.linkedin as Record<string, unknown> | undefined;
    const fromLI = li?.fromLinkedIn as Record<string, unknown> | undefined;
    const profile = li?.profile as Record<string, unknown> | undefined;
    const fromImport = (fromLI?.avatarUrl || profile?.avatarUrl) as string | undefined;
    return fromImport || null;
  })();

  const githubAvatarUrl = (() => {
    if (connectedGithub?.imageUrl) return connectedGithub.imageUrl;
    const gh = importedData.github as Record<string, unknown> | undefined;
    const profile = gh?.profile as Record<string, unknown> | undefined;
    const githubProfile = gh?.githubProfile as Record<string, unknown> | undefined;
    const fromImport = (profile?.avatarUrl || githubProfile?.avatarUrl) as string | undefined;
    return fromImport || null;
  })();

  const githubDisplayUsername =
    githubUsernameFromAccount ||
    (() => {
      const gh = importedData.github as Record<string, unknown> | undefined;
      const githubProfile = gh?.githubProfile as Record<string, unknown> | undefined;
      if (typeof githubProfile?.username === 'string') return githubProfile.username;
      return extractGitHubUsername(githubUsername) || null;
    })();

  // ─── State persistence ─────────────────────────────────────────
  const saveImportState = useCallback(async () => {
    const storageKey = getStorageKey(user?.id);
    if (!storageKey) return;

    try {
      let uploadedPhotoKey: string | null = null;
      if (uploadedPhoto) {
        uploadedPhotoKey = `onboarding_photo_${user?.id || 'anon'}`;
        await savePhotoToIndexedDB(uploadedPhotoKey, uploadedPhoto);
      }

      const stateToSave = {
        imports,
        importedData,
        githubUsername,
        linkedinProfileInput,
        resumeFileName,
        uploadedPhotoKey,
        mediumUsername,
        youtubeChannel,
        substackUsername,
        portfolioUrl: portfolioUrl.trim() || undefined,
        linkUrls: linkUrls.length > 0 ? linkUrls : undefined,
        currentStep,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(stateToSave));
    } catch (err) {
      console.error('Failed to save import state:', err);
    }
  }, [
    imports,
    importedData,
    githubUsername,
    linkedinProfileInput,
    uploadedPhoto,
    resumeFileName,
    user?.id,
    mediumUsername,
    youtubeChannel,
    substackUsername,
    portfolioUrl,
    linkUrls,
    currentStep,
  ]);

  // Restore state on mount
  useEffect(() => {
    if (hasRestoredPersistedState || !isUserLoaded || !user?.id) return;

    const storageKey = getStorageKey(user.id);
    if (!storageKey) {
      setHasRestoredPersistedState(true);
      return;
    }

    const restoreState = async () => {
      try {
        const savedState = sessionStorage.getItem(storageKey);
        if (savedState) {
          const parsed = JSON.parse(savedState);
          if (parsed.imports) {
            let restoredImports = parsed.imports;
            // Drop removed sources (e.g. facebook) and keep only current ImportSource keys
            const withoutFacebook = { ...(restoredImports as Record<string, ImportStatus>) };
            delete withoutFacebook.facebook;
            restoredImports = withoutFacebook;
            // Fix: If resume status is 'added' but parsing promise can't be restored,
            // update status based on whether we have imported data
            if (restoredImports.resume?.status === 'added') {
              restoredImports = {
                ...restoredImports,
                resume: {
                  ...restoredImports.resume,
                  status: parsed.importedData?.resume ? 'success' : 'idle',
                  message: parsed.importedData?.resume ? 'Resume imported' : undefined,
                },
              };
            }
            setImports((prev) => ({ ...prev, ...restoredImports }));
          }
          if (parsed.importedData) setImportedData(parsed.importedData);
          if (parsed.githubUsername) setGithubUsername(parsed.githubUsername);
          if (parsed.linkedinProfileInput) setLinkedinProfileInput(parsed.linkedinProfileInput);
          if (parsed.resumeFileName) {
            setResumeFileName(parsed.resumeFileName);
          }
          if (parsed.mediumUsername) setMediumUsername(parsed.mediumUsername);
          if (parsed.youtubeChannel) setYoutubeChannel(parsed.youtubeChannel);
          if (parsed.substackUsername) setSubstackUsername(parsed.substackUsername);
          if (parsed.portfolioUrl) setPortfolioUrl(parsed.portfolioUrl);
          if (parsed.linkUrls?.length) setLinkUrls(parsed.linkUrls);
          if (parsed.currentStep) {
            // Map removed steps onto the nearest remaining step
            const raw =
              parsed.currentStep === 'bubbles' ||
              parsed.currentStep === 'gallery' ||
              parsed.currentStep === 'review'
                ? 'platforms'
                : String(parsed.currentStep);
            if ((STEPS as string[]).includes(raw)) setCurrentStep(raw as OnboardingStep);
          }

          if (parsed.uploadedPhotoKey) {
            const photoData = await getPhotoFromIndexedDB(parsed.uploadedPhotoKey);
            if (photoData) setUploadedPhoto(photoData);
          }
          sessionStorage.removeItem(storageKey);
          user.reload().catch(console.error);
        }
      } catch (err) {
        console.error('Failed to restore import state:', err);
      }
      setHasRestoredPersistedState(true);
    };
    restoreState();
  }, [hasRestoredPersistedState, isUserLoaded, user]);

  // ─── Auto-import after OAuth ────────────────────────────────────
  useEffect(() => {
    if (!isUserLoaded || !hasRestoredPersistedState) return;
    if (githubUsernameFromAccount && imports.github.status === 'idle') {
      updateImportStatus('github', { status: 'importing', message: 'Fetching GitHub data...' });
      fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: githubUsernameFromAccount }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            updateImportStatus('github', { status: 'error', message: data.error });
          } else {
            setImportedData((prev) => ({ ...prev, github: data.data }));
            updateImportStatus('github', {
              status: 'success',
              message: data.message || `Imported ${data.data?.summary?.projects || 0} projects`,
              itemsImported:
                (data.data?.summary?.projects || 0) + (data.data?.summary?.skills || 0),
            });
            setGithubUsername(githubUsernameFromAccount);
          }
        })
        .catch((err) => {
          updateImportStatus('github', {
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed',
          });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded, hasRestoredPersistedState, githubUsernameFromAccount, imports.github.status]);

  useEffect(() => {
    if (!isUserLoaded || !hasRestoredPersistedState) return;
    if (connectedLinkedin && imports.linkedin.status === 'idle') {
      updateImportStatus('linkedin', { status: 'importing', message: 'Fetching LinkedIn data...' });
      fetch('/api/import/linkedin/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            updateImportStatus('linkedin', { status: 'error', message: data.error });
          } else {
            setImportedData((prev) => ({ ...prev, linkedin: data.data }));
            updateImportStatus('linkedin', {
              status: 'success',
              message: data.message || 'Imported profile',
              itemsImported: data.data?.summary?.total || 1,
            });
          }
        })
        .catch((err) =>
          updateImportStatus('linkedin', {
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed',
          })
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded, hasRestoredPersistedState, connectedLinkedin, imports.linkedin.status]);

  // ─── Helpers ────────────────────────────────────────────────────
  const updateImportStatus = (source: ImportSource, update: Partial<ImportStatus>) => {
    setImports((prev) => ({ ...prev, [source]: { ...prev[source], ...update } }));
  };

  const countResumeItems = (data: Record<string, unknown> | undefined): number => {
    if (!data) return 0;
    let count = 0;
    if (data.profile && Object.keys(data.profile as object).length > 0) count += 1;
    if (Array.isArray(data.experiences)) count += (data.experiences as unknown[]).length;
    if (Array.isArray(data.educations)) count += (data.educations as unknown[]).length;
    if (Array.isArray(data.projects)) count += (data.projects as unknown[]).length;
    if (Array.isArray(data.skills)) count += (data.skills as unknown[]).length;
    if (Array.isArray(data.links)) count += (data.links as unknown[]).length;
    return count;
  };

  // ─── Resume Handlers ───────────────────────────────────────────
  const processResumeFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      updateImportStatus('resume', { status: 'error', message: 'Only PDF files are supported.' });
      return;
    }
    setResumeFileName(file.name);
    setResumeFileUrl(URL.createObjectURL(file));

    // Generate PDF thumbnail
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = 300 / viewport.width;
      const scaledViewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      setResumeThumbnail(canvas.toDataURL('image/png'));
    } catch (err) {
      console.warn('Could not generate PDF thumbnail:', err);
    }

    updateImportStatus('resume', {
      status: 'added',
      message: 'Resume added! Parsing in background...',
    });

    // Start parsing in background
    const parsingPromise = (async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('saveToProfile', 'false');
        const response = await fetch('/api/import/resume', { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to parse resume');
        setImportedData((prev) => ({ ...prev, resume: data.data }));
        const itemCount = countResumeItems(data.data);
        updateImportStatus('resume', {
          status: 'success',
          message: `Found ${itemCount} items (${Math.round((data.confidence || 0.5) * 100)}% confidence)`,
          itemsImported: itemCount,
        });
      } catch (err) {
        updateImportStatus('resume', {
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed',
        });
      } finally {
        setResumeParsingPromise(null);
      }
    })();

    setResumeParsingPromise(parsingPromise);
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file after Remove/Replace
    e.target.value = '';
    if (!file) return;
    await processResumeFile(file);
  };

  const handleResumeDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingResume(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processResumeFile(file);
  };

  // ─── GitHub ─────────────────────────────────────────────────────
  const handleGitHubConnect = async () => {
    setGithubConnecting(true);
    setGithubError(null);
    const primaryEmail = user?.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      setGithubError('Please verify your email first to connect GitHub.');
      setGithubConnecting(false);
      return;
    }
    try {
      await saveImportState();
      const externalAccount = await user?.createExternalAccount({
        strategy: 'oauth_github',
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) window.location.href = url.toString();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already connected')) {
        await user?.reload();
        setGithubError(null);
      } else setGithubError(`Connection failed: ${msg}`);
      setGithubConnecting(false);
    }
  };

  const handleGitHubDisconnect = async () => {
    if (!connectedGithub) return;
    setGithubDisconnecting(true);
    setGithubError(null);
    try {
      await connectedGithub.destroy();
      await user?.reload();
      updateImportStatus('github', {
        status: 'idle',
        message: undefined,
        itemsImported: undefined,
      });
      setGithubUsername('');
    } catch (err: unknown) {
      setGithubError(`Failed to disconnect: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGithubDisconnecting(false);
    }
  };

  const handleGitHubImport = async (overrideUsername?: string) => {
    const resolved = extractGitHubUsername(overrideUsername ?? githubUsername);
    if (!resolved) {
      updateImportStatus('github', {
        status: 'error',
        message: 'Enter a GitHub username or profile URL',
      });
      return;
    }
    updateImportStatus('github', { status: 'importing', message: 'Fetching GitHub data...' });
    try {
      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resolved }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed');
      setImportedData((prev) => ({ ...prev, github: data.data }));
      updateImportStatus('github', {
        status: 'success',
        message: data.message || `Imported ${data.data?.summary?.projects || 0} projects`,
        itemsImported: (data.data?.summary?.projects || 0) + (data.data?.summary?.skills || 0),
      });
      setGithubUsername(resolved);
    } catch (err) {
      updateImportStatus('github', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed',
      });
    }
  };

  // ─── LinkedIn ───────────────────────────────────────────────────
  const handleLinkedInConnect = async () => {
    setLinkedinConnecting(true);
    setLinkedinError(null);
    const primaryEmail = user?.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      setLinkedinError('Please verify your email first.');
      setLinkedinConnecting(false);
      return;
    }
    try {
      await saveImportState();
      const externalAccount = await user?.createExternalAccount({
        strategy: 'oauth_linkedin_oidc',
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) window.location.href = url.toString();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already connected')) {
        await user?.reload();
        setLinkedinError(null);
      } else setLinkedinError(`Connection failed: ${msg}`);
      setLinkedinConnecting(false);
    }
  };

  const handleLinkedInDisconnect = async () => {
    if (!connectedLinkedin) return;
    setLinkedinDisconnecting(true);
    setLinkedinError(null);
    try {
      await connectedLinkedin.destroy();
      await user?.reload();
      updateImportStatus('linkedin', {
        status: 'idle',
        message: undefined,
        itemsImported: undefined,
      });
      setLinkedinProfileInput('');
    } catch (err: unknown) {
      setLinkedinError(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLinkedinDisconnecting(false);
    }
  };

  const handleLinkedInImport = async (overrideInput?: string) => {
    const pasted = (overrideInput ?? linkedinProfileInput).trim();

    // Prefer OAuth import when the account is connected and no paste override.
    if (connectedLinkedin && !pasted) {
      updateImportStatus('linkedin', { status: 'importing', message: 'Fetching LinkedIn data...' });
      try {
        const response = await fetch('/api/import/linkedin/oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed');
        setImportedData((prev) => ({ ...prev, linkedin: data.data }));
        updateImportStatus('linkedin', {
          status: 'success',
          message: data.message || 'Imported profile',
          itemsImported: data.data?.summary?.total || 1,
        });
      } catch (err) {
        updateImportStatus('linkedin', {
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed',
        });
      }
      return;
    }

    const slug = extractLinkedInSlug(pasted);
    if (!slug) {
      updateImportStatus('linkedin', {
        status: 'error',
        message: 'Enter a LinkedIn profile URL or username',
      });
      return;
    }

    updateImportStatus('linkedin', {
      status: 'importing',
      message: 'Fetching LinkedIn profile...',
    });
    try {
      const response = await fetch('/api/import/linkedin/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pasted }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed');
      setImportedData((prev) => ({ ...prev, linkedin: data.data }));
      setLinkedinProfileInput(slug);
      updateImportStatus('linkedin', {
        status: 'success',
        message: data.message || 'Imported LinkedIn profile',
        itemsImported: data.data?.summary?.total || 1,
      });
    } catch (err) {
      updateImportStatus('linkedin', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed',
      });
    }
  };

  // ─── Medium ─────────────────────────────────────────────────────
  const handleMediumImport = async () => {
    const username = extractMediumUsername(mediumUsername);
    if (!username) {
      updateImportStatus('medium', {
        status: 'error',
        message: 'Please enter your Medium username or profile URL',
      });
      return;
    }
    updateImportStatus('medium', { status: 'importing', message: 'Fetching Medium posts...' });
    try {
      const response = await fetch('/api/import/medium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to import from Medium');
      const postCount = data.data?.blogPosts?.length || data.stats?.blogPosts || 0;
      if (postCount === 0) {
        updateImportStatus('medium', {
          status: 'error',
          message: `No posts found for "${username}". Please check the username and try again.`,
        });
        return;
      }
      setImportedData((prev) => ({ ...prev, medium: data.data }));
      updateImportStatus('medium', {
        status: 'success',
        message: `Imported ${postCount} posts`,
        itemsImported: postCount,
      });
    } catch (err) {
      updateImportStatus('medium', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import from Medium',
      });
    }
  };

  // ─── YouTube ────────────────────────────────────────────────────
  const handleYouTubeImport = async () => {
    const channel = extractYouTubeChannel(youtubeChannel);
    if (!channel) {
      updateImportStatus('youtube', {
        status: 'error',
        message: 'Please enter your YouTube channel URL or handle',
      });
      return;
    }
    updateImportStatus('youtube', { status: 'importing', message: 'Fetching YouTube videos...' });
    try {
      const response = await fetch('/api/import/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to import from YouTube');
      const videoCount = data.data?.youtubeVideos?.length || data.stats?.videos || 0;
      if (videoCount === 0) {
        updateImportStatus('youtube', {
          status: 'error',
          message:
            'No videos found for this channel. Please check the URL or handle and try again.',
        });
        return;
      }
      setImportedData((prev) => ({ ...prev, youtube: data.data }));
      updateImportStatus('youtube', {
        status: 'success',
        message: `Imported ${videoCount} videos`,
        itemsImported: videoCount,
      });
    } catch (err) {
      updateImportStatus('youtube', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import from YouTube',
      });
    }
  };

  // ─── Substack ───────────────────────────────────────────────────
  const handleSubstackImport = async () => {
    const identifier = extractSubstackIdentifier(substackUsername);
    if (!identifier) {
      updateImportStatus('substack', {
        status: 'error',
        message: 'Please enter your Substack name or URL',
      });
      return;
    }
    updateImportStatus('substack', { status: 'importing', message: 'Fetching Substack posts...' });
    try {
      const response = await fetch('/api/import/medium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'substack', identifier }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to import from Substack');
      const postCount = data.data?.blogPosts?.length || data.stats?.blogPosts || 0;
      if (postCount === 0) {
        updateImportStatus('substack', {
          status: 'error',
          message: `No posts found for "${identifier}". Please check the name and try again.`,
        });
        return;
      }
      setImportedData((prev) => ({ ...prev, substack: data.data }));
      updateImportStatus('substack', {
        status: 'success',
        message: `Imported ${postCount} posts`,
        itemsImported: postCount,
      });
    } catch (err) {
      updateImportStatus('substack', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import from Substack',
      });
    }
  };

  // ─── Links ──────────────────────────────────────────────────────
  const handleAddLink = () => {
    const url = linkInput.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      updateImportStatus('links', { status: 'error', message: 'Please enter a valid URL' });
      return;
    }
    if (linkUrls.includes(url)) {
      updateImportStatus('links', { status: 'error', message: 'Link already added' });
      return;
    }
    setLinkUrls((prev) => [...prev, url]);
    setLinkInput('');
    updateImportStatus('links', { status: 'idle', message: undefined });
  };

  const handleRemoveLink = (url: string) => setLinkUrls((prev) => prev.filter((l) => l !== url));

  const handleLinksImport = async () => {
    if (linkUrls.length === 0) {
      updateImportStatus('links', { status: 'error', message: 'Add at least one link' });
      return;
    }
    updateImportStatus('links', { status: 'importing', message: 'Importing links...' });
    try {
      const response = await fetch('/api/import/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: linkUrls, saveToProfile: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed');
      setImportedData((prev) => ({ ...prev, links: data.data }));
      const linkCount = data.data?.links?.length || linkUrls.length;
      updateImportStatus('links', {
        status: 'success',
        message: `Imported ${linkCount} links`,
        itemsImported: linkCount,
      });
    } catch (err) {
      updateImportStatus('links', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed',
      });
    }
  };

  // ─── Photo handling ─────────────────────────────────────────────
  const processPhotoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setError('Image must be less than 40MB');
      return;
    }
    setIsUploadingPhoto(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      setUploadedPhoto(base64);
      setPhotoCrop({ x: 0, y: 0 });
      setPhotoZoom(1);
      setPhotoRotation(0);
    } catch {
      setError('Failed to process image');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processPhotoFile(file);
  };

  const handlePhotoDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPhoto(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processPhotoFile(file);
  };

  const handleRemovePhoto = () => {
    setUploadedPhoto(null);
    setPhotoCrop({ x: 0, y: 0 });
    setPhotoZoom(1);
    setPhotoRotation(0);
    setCroppedAreaPixels(null);
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPx: Area) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  // ─── Complete onboarding → builder ─────────────────────────────
  const handleCompleteOnboarding = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    setError(null);

    try {
      // If resume parsing is still running, wait for it
      if (resumeParsingPromise) {
        setIsWaitingForParsing(true);
        try {
          await resumeParsingPromise;
        } finally {
          setIsWaitingForParsing(false);
        }
      }

      // Get best avatar - cropped version for DP
      let bestAvatarUrl: string | null = null;
      if (uploadedPhoto && croppedAreaPixels) {
        try {
          bestAvatarUrl = await getCroppedImg(uploadedPhoto, croppedAreaPixels);
        } catch {
          bestAvatarUrl = uploadedPhoto;
        }
      } else if (uploadedPhoto) {
        bestAvatarUrl = uploadedPhoto;
      }

      if (!bestAvatarUrl) {
        const photos: string[] = [];
        const gd = importedData.google as Record<string, unknown> | undefined;
        const gp = gd?.profile as Record<string, unknown> | undefined;
        if (gp?.avatarUrl) photos.push(gp.avatarUrl as string);
        const ld = importedData.linkedin as Record<string, unknown> | undefined;
        const lp = ld?.profile as Record<string, unknown> | undefined;
        if (lp?.avatarUrl) photos.push(lp.avatarUrl as string);
        const ghd = importedData.github as Record<string, unknown> | undefined;
        const ghp = ghd?.profile as Record<string, unknown> | undefined;
        if (ghp?.avatarUrl) photos.push(ghp.avatarUrl as string);
        if (user?.imageUrl && user?.hasImage) photos.push(user.imageUrl);
        if (photos.length > 0) bestAvatarUrl = await getBestResolutionImage(photos);
      }

      const resumeData = importedData.resume as Record<string, unknown> | undefined;
      const linkedinData = importedData.linkedin as Record<string, unknown> | undefined;
      const githubData = importedData.github as Record<string, unknown> | undefined;
      const mediumData = importedData.medium as Record<string, unknown> | undefined;

      const resumeProfile = (resumeData?.profile as Record<string, unknown>) || {};
      const linkedinProfile = (linkedinData?.profile as Record<string, unknown>) || {};
      const githubProfile = (githubData?.profile as Record<string, unknown>) || {};
      const resumeContactInfo = resumeData?.contactInfo as Record<string, unknown> | undefined;

      const mergedProfile: Record<string, unknown> = {
        firstName:
          resumeProfile.firstName ||
          linkedinProfile.firstName ||
          githubProfile.firstName ||
          user?.firstName,
        middleName:
          resumeProfile.middleName || linkedinProfile.middleName || githubProfile.middleName,
        lastName:
          resumeProfile.lastName ||
          linkedinProfile.lastName ||
          githubProfile.lastName ||
          user?.lastName,
        headline: resumeProfile.headline || linkedinProfile.headline || githubProfile.headline,
        summary: resumeProfile.summary || linkedinProfile.summary || githubProfile.bio,
        location: resumeProfile.location || linkedinProfile.location || githubProfile.location,
        avatarUrl: bestAvatarUrl,
      };

      const allEmails: Array<{ email: string; source: string }> = [];
      const signupEmail = user?.primaryEmailAddress?.emailAddress;
      if (signupEmail) allEmails.push({ email: signupEmail, source: 'SIGNUP' });
      if (resumeContactInfo?.email)
        allEmails.push({ email: resumeContactInfo.email as string, source: 'RESUME' });
      if (linkedinData) {
        const lci = linkedinData.contactInfo as Record<string, unknown> | undefined;
        if (lci?.email) allEmails.push({ email: lci.email as string, source: 'LINKEDIN' });
        if (linkedinData.email && typeof linkedinData.email === 'string')
          allEmails.push({ email: linkedinData.email, source: 'LINKEDIN' });
      }
      if (githubData) {
        const gci = githubData.contactInfo as Record<string, unknown> | undefined;
        if (gci?.email) allEmails.push({ email: gci.email as string, source: 'GITHUB' });
      }
      const seenEmails = new Set<string>();
      const uniqueEmails = allEmails.filter((e) => {
        const n = e.email.toLowerCase().trim();
        if (seenEmails.has(n)) return false;
        seenEmails.add(n);
        return true;
      });

      const allPhones: Array<{
        phone?: string;
        countryCode?: string | null;
        number?: string;
        source: string;
      }> = [];
      if (resumeContactInfo?.phone) {
        const parsed = parsePhoneWithCountryCode(resumeContactInfo.phone as string);
        allPhones.push({
          phone: resumeContactInfo.phone as string,
          countryCode: parsed.countryCode,
          number: parsed.number || (resumeContactInfo.phone as string),
          source: 'RESUME',
        });
      }
      if (linkedinData) {
        const lci = linkedinData.contactInfo as Record<string, unknown> | undefined;
        if (lci?.phone) {
          const parsed = parsePhoneWithCountryCode(lci.phone as string);
          allPhones.push({
            phone: lci.phone as string,
            countryCode: parsed.countryCode,
            number: parsed.number || (lci.phone as string),
            source: 'LINKEDIN',
          });
        }
      }
      const seenPhones = new Set<string>();
      const uniquePhones = allPhones.filter((p) => {
        const n = (p.number || p.phone || '').replace(/\D/g, '');
        if (seenPhones.has(n)) return false;
        seenPhones.add(n);
        return true;
      });

      const contactInfo = {
        ...(resumeContactInfo || {}),
        allEmails: uniqueEmails,
        allPhones: uniquePhones,
      };

      const allLinks = [
        ...((resumeData?.links as Array<Record<string, unknown>>) || []),
        ...((linkedinData?.links as Array<Record<string, unknown>>) || []),
        ...((githubData?.links as Array<Record<string, unknown>>) || []),
        ...((mediumData?.links as Array<Record<string, unknown>>) || []),
      ];

      // Personal portfolio URL from the platforms step — first so it sorts near the top
      const trimmedPortfolio = portfolioUrl.trim();
      if (trimmedPortfolio) {
        const normalizedPortfolio = /^https?:\/\//i.test(trimmedPortfolio)
          ? trimmedPortfolio.replace(/\/+$/, '')
          : `https://${trimmedPortfolio.replace(/\/+$/, '')}`;
        allLinks.unshift({
          url: normalizedPortfolio,
          type: 'PORTFOLIO',
          label: 'Portfolio',
        });
      }

      // Custom links added on the platforms step
      for (const raw of linkUrls) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const url = /^https?:\/\//i.test(trimmed)
          ? trimmed.replace(/\/+$/, '')
          : `https://${trimmed.replace(/\/+$/, '')}`;
        allLinks.push({ url, type: 'OTHER', label: 'Website' });
      }

      const seenUrls = new Set<string>();
      const uniqueLinks = allLinks.filter((link) => {
        const url = (link.url as string)?.toLowerCase().trim();
        if (!url || seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      });

      const skills = [
        ...((resumeData?.skills as string[]) || []),
        ...((githubData?.skills as string[]) || []),
      ].filter((s, i, arr) => arr.indexOf(s) === i);

      const projects = [
        ...((resumeData?.projects as Array<Record<string, unknown>>) || []),
        ...((githubData?.projects as Array<Record<string, unknown>>) || []),
      ];

      const blogPosts = [...((mediumData?.blogPosts as Array<Record<string, unknown>>) || [])];
      const githubProfileAgg = (githubData?.githubProfile as Record<string, unknown>) || undefined;

      // Upload avatar to Clerk when we have a data URL; keep original for permanent storage
      const profileForApi = { ...mergedProfile };
      let originalAvatarDataUrl: string | undefined;
      const avatarUrl = profileForApi.avatarUrl;
      if (typeof avatarUrl === 'string' && avatarUrl.startsWith('data:')) {
        originalAvatarDataUrl = avatarUrl;
        try {
          const originalFile = await base64ToFile(avatarUrl, 'avatar.jpg');
          const compressedFile = await compressImageForClerk(originalFile);
          await user?.setProfileImage({ file: compressedFile });
          await user?.reload();
          if (user?.imageUrl) {
            profileForApi.avatarUrl = user.imageUrl;
          } else {
            delete profileForApi.avatarUrl;
          }
        } catch (uploadErr) {
          console.error('[Onboarding] Failed to upload avatar to Clerk:', uploadErr);
          if (user?.imageUrl) {
            profileForApi.avatarUrl = user.imageUrl;
          } else {
            delete profileForApi.avatarUrl;
          }
        }
      }

      const firstName = (profileForApi.firstName as string) || user?.firstName || 'User';
      const middleName = (profileForApi.middleName as string) || '';
      const lastName = (profileForApi.lastName as string) || user?.lastName || '';

      try {
        await user?.update({
          firstName,
          lastName: lastName || undefined,
        });
      } catch (nameErr) {
        console.error('[Onboarding] Failed to sync name to Clerk:', nameErr);
      }

      const selectedTemplateId =
        sessionStorage.getItem(ONBOARDING_TEMPLATE_KEY) || getDefaultTemplateId();

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          middleName: middleName || undefined,
          lastName,
          handle: sessionStorage.getItem('onboarding_handle') || undefined,
          resumeFileName: resumeFileName || undefined,
          originalAvatarDataUrl: originalAvatarDataUrl || undefined,
          targetProfileId: sessionStorage.getItem('importTargetProfileId') || undefined,
          templateId: selectedTemplateId,
          reviewedData: {
            profile: profileForApi,
            experiences: resumeData?.experiences || [],
            educations: resumeData?.educations || [],
            skills,
            links: uniqueLinks,
            contactInfo,
            projects,
            blogPosts,
            githubProfile: githubProfileAgg,
          },
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create your resume');
      }

      sessionStorage.removeItem('onboarding_parsed_resume');
      sessionStorage.removeItem('onboarding_handle');
      sessionStorage.removeItem('importTargetProfileId');
      sessionStorage.removeItem(ONBOARDING_TEMPLATE_KEY);
      const storageKey = getStorageKey(user?.id);
      if (storageKey) sessionStorage.removeItem(storageKey);
      await clearPhotosFromIndexedDB();

      const returnUrl = sessionStorage.getItem('importReturnUrl');
      sessionStorage.removeItem('importReturnUrl');

      router.refresh();
      router.push(returnUrl || '/builder');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsCompleting(false);
      setIsWaitingForParsing(false);
    }
  };

  // ─── Navigation ─────────────────────────────────────────────────
  const isLastDataStep = currentStep === STEPS[STEPS.length - 1];

  const hasCurrentStepAction = hasImportStepAction(currentStep, {
    resumeFileName,
    uploadedPhoto,
    connectedLinkedin: Boolean(connectedLinkedin),
    connectedGithub: Boolean(connectedGithub),
    importStatuses: {
      github: imports.github.status,
      linkedin: imports.linkedin.status,
      youtube: imports.youtube.status,
      medium: imports.medium.status,
      substack: imports.substack.status,
      links: imports.links.status,
    },
    linkedinProfileInput,
    githubUsername,
    portfolioUrl,
    youtubeChannel,
    mediumUsername,
    substackUsername,
    linkUrls,
    linkInput,
  });
  const primaryNextLabel = importStepNextLabel(hasCurrentStepAction, isLastDataStep);

  const goNext = () => {
    if (isLastDataStep) {
      void handleCompleteOnboarding();
      return;
    }
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1]);
    }
  };

  const clearResumeUpload = () => {
    setResumeFileName(null);
    setResumeFileUrl(null);
    setResumeThumbnail(null);
    setResumeParsingPromise(null);
    updateImportStatus('resume', {
      status: 'idle',
      message: undefined,
      itemsImported: undefined,
    });
    setImportedData((prev) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { resume: _r, ...rest } = prev;
      return rest;
    });
  };

  const discardResumeAndReturnToChoice = () => {
    clearResumeUpload();
    setShowDiscardResumeDialog(false);
  };

  const goBack = () => {
    // On resume step with a file uploaded, confirm before discarding back to choice
    if (currentStep === 'resume' && resumeFileName) {
      setShowDiscardResumeDialog(true);
      return;
    }
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) setCurrentStep(STEPS[idx - 1]);
  };

  const handleResumeStartSelect = (path: ResumeStartPath) => {
    if (path === 'blank') {
      clearResumeUpload();
      goNext();
      return;
    }
    // Stay on this page — open the file picker; loading UI takes over after select
    document.getElementById('resume-upload')?.click();
  };

  const showResumeChoice = currentStep === 'resume' && !resumeFileName;
  const resumeStepMeta =
    currentStep === 'resume' && resumeFileName ? RESUME_UPLOAD_META : STEP_META[currentStep];

  // ─── Status badge helper ───────────────────────────────────────
  const StatusBadge = ({
    status,
    message,
  }: {
    status: ImportStatus['status'];
    message?: string;
  }) => {
    if (status === 'success' || status === 'added') {
      return (
        <span className={ONBOARDING_SUCCESS_PILL}>
          <CheckCircle2 className="h-3 w-3" />
          {status === 'added' ? 'Added' : message || 'Done'}
        </span>
      );
    }
    if (status === 'importing') {
      return (
        <span className={ONBOARDING_SUCCESS_PILL}>
          <Loader2 className="h-3 w-3 animate-spin" /> Importing...
        </span>
      );
    }
    if (status === 'error') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
          <AlertCircle className="h-3 w-3" /> {message || 'Error'}
        </span>
      );
    }
    return null;
  };

  // ─── Loading state ─────────────────────────────────────────────
  if (isCheckingProfile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <>
      {/* Progress bar — sits just beneath the app header (h-14) */}
      <div className="fixed left-0 right-0 top-14 z-40 h-0.5 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: '0%' }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <div className={ONBOARDING_PAGE_SHELL}>
        {/* Step indicator — segmented track with current-step label */}
        <div className={ONBOARDING_STEP_TRACK}>
          <div className="flex items-center gap-1.5" role="list" aria-label="Onboarding steps">
            {STEPS.map((step, idx) => {
              const reachable = idx <= currentStepIndex;
              return (
                <button
                  key={step}
                  type="button"
                  aria-label={STEP_META[step].title}
                  aria-current={idx === currentStepIndex ? 'step' : undefined}
                  disabled={!reachable}
                  onClick={() => {
                    if (reachable) setCurrentStep(step);
                  }}
                  className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                    idx <= currentStepIndex ? 'bg-primary' : 'bg-muted'
                  } ${reachable ? 'cursor-pointer' : 'cursor-default'}`}
                />
              );
            })}
          </div>
        </div>

        {/* Step header */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentStep}-${currentStep === 'resume' && resumeFileName ? 'upload' : 'default'}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={ONBOARDING_STEP_HEADER}
          >
            <p className="text-eyebrow">
              Step {currentStepIndex + 1} of {STEPS.length}
            </p>
            <h1 className={`mt-2 ${ONBOARDING_PAGE_TITLE}`}>{resumeStepMeta.title}</h1>
            <p className={ONBOARDING_PAGE_SUBTITLE}>{resumeStepMeta.subtitle}</p>
          </motion.div>
        </AnimatePresence>

        {/* Step content — fills leftover viewport */}
        <div className={ONBOARDING_MAIN}>
          <AnimatePresence mode="wait">
            {/* ─────────────── STEP 1: RESUME ─────────────── */}
            {currentStep === 'resume' && (
              <motion.div
                key={`step-resume-${resumeFileName ? 'upload' : 'choice'}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
              >
                {showResumeChoice ? (
                  <div className="space-y-4">
                    <ResumeStartChoice onSelect={handleResumeStartSelect} />
                    {imports.resume.status === 'error' && imports.resume.message && (
                      <p className="text-center text-sm text-destructive">
                        {imports.resume.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <div
                    ref={resumeDropRef}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingResume(true);
                    }}
                    onDragLeave={() => setIsDraggingResume(false)}
                    onDrop={handleResumeDrop}
                    className={`relative mx-auto max-w-md p-8 text-center ${ONBOARDING_DROPZONE} ${
                      isDraggingResume ? ONBOARDING_DROPZONE_ACTIVE : ''
                    }`}
                  >
                    <motion.div
                      key="uploaded"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="group relative">
                        {resumeThumbnail ? (
                          <div className="relative h-48 w-36 overflow-hidden rounded-2xl border border-border/50 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                            <Image
                              src={resumeThumbnail}
                              alt="Resume preview"
                              fill
                              className="object-cover object-top"
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div className="flex h-48 w-36 flex-col items-center justify-center gap-2 rounded-2xl border border-border/50 bg-muted/40 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              PDF
                            </span>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{resumeFileName}</p>
                        {imports.resume.status === 'added' && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-2 space-y-1.5"
                          >
                            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              AI parsing in background...
                            </p>
                            <div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-muted">
                              <motion.div
                                className="h-full rounded-full bg-foreground/35"
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{
                                  duration: 1.5,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                }}
                                style={{ width: '50%' }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground/60">
                              You can continue to the next step while we parse
                            </p>
                          </motion.div>
                        )}
                        {imports.resume.status === 'importing' && (
                          <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />{' '}
                            Uploading...
                          </p>
                        )}
                        {imports.resume.status === 'success' && imports.resume.message && (
                          <motion.p
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mt-1 text-xs text-muted-foreground"
                          >
                            <CheckCircle2 className="mr-1 inline h-3 w-3" />
                            {imports.resume.message}
                          </motion.p>
                        )}
                        {imports.resume.status === 'error' && imports.resume.message && (
                          <p className="mt-2 text-sm text-destructive">{imports.resume.message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById('resume-upload')?.click()}
                          className="gap-1.5"
                        >
                          <Upload className="h-3.5 w-3.5" /> Replace
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDiscardResumeDialog(true)}
                          className="gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </Button>
                      </div>
                    </motion.div>
                  </div>
                )}

                <input
                  id="resume-upload"
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleResumeUpload}
                />
              </motion.div>
            )}

            {/* ─────────────── STEP 2: PROFILE PHOTO ─────────────── */}
            {currentStep === 'photo' && (
              <motion.div
                key="step-photo"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mx-auto w-full max-w-sm">
                  {uploadedPhoto ? (
                    <div className="flex flex-col gap-3">
                      {/* Crop area — same square frame as empty state */}
                      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border/50 bg-black/5">
                        <Cropper
                          image={uploadedPhoto}
                          crop={photoCrop}
                          zoom={photoZoom}
                          rotation={photoRotation}
                          aspect={1}
                          onCropChange={setPhotoCrop}
                          onCropComplete={onCropComplete}
                          onZoomChange={setPhotoZoom}
                          cropShape="rect"
                          showGrid={true}
                          style={{
                            containerStyle: { borderRadius: '1rem' },
                            cropAreaStyle: { border: '2px solid hsl(var(--foreground) / 0.35)' },
                          }}
                        />
                      </div>

                      {/* Thin control bar — same width as square */}
                      <div className={`flex flex-col gap-3 px-3.5 py-3 ${ONBOARDING_SURFACE}`}>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[11px] font-medium text-muted-foreground">
                                Zoom
                              </label>
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {Math.round(photoZoom * 100)}%
                              </span>
                            </div>
                            <Slider
                              value={photoZoom}
                              min={1}
                              max={3}
                              step={0.01}
                              size="sm"
                              onChange={setPhotoZoom}
                              aria-label="Zoom"
                            />
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[11px] font-medium text-muted-foreground">
                                Tilt
                              </label>
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {photoRotation}°
                              </span>
                            </div>
                            <Slider
                              value={photoRotation}
                              min={-45}
                              max={45}
                              step={1}
                              size="sm"
                              onChange={setPhotoRotation}
                              aria-label="Tilt correction"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1 border-t border-border/40 pt-2.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPhotoRotation(0);
                              setPhotoZoom(1);
                              setPhotoCrop({ x: 0, y: 0 });
                            }}
                            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Reset
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => document.getElementById('photo-upload')?.click()}
                            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                          >
                            <Camera className="h-3.5 w-3.5" /> Replace
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemovePhoto}
                            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      ref={photoDropRef}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingPhoto(true);
                      }}
                      onDragLeave={() => setIsDraggingPhoto(false)}
                      onDrop={handlePhotoDrop}
                      className={`flex aspect-square w-full flex-col items-center justify-center gap-4 p-8 text-center ${ONBOARDING_DROPZONE} ${
                        isDraggingPhoto ? ONBOARDING_DROPZONE_ACTIVE : 'hover:border-border'
                      }`}
                    >
                      <div className={ONBOARDING_ICON_WELL}>
                        {isUploadingPhoto ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground/50" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {isDraggingPhoto ? 'Drop your photo here' : 'Drag & drop your photo'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          JPG, PNG or WebP · Square crop
                        </p>
                      </div>
                      <Button
                        onClick={() => document.getElementById('photo-upload')?.click()}
                        disabled={isUploadingPhoto}
                        className="gap-1.5"
                      >
                        <Upload className="h-4 w-4" /> Choose photo
                      </Button>
                    </div>
                  )}

                  {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>
              </motion.div>
            )}

            {/* ─────────────── STEP 3: CONNECT ACCOUNTS ─────────────── */}
            {currentStep === 'accounts' && (
              <motion.div
                key="step-accounts"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
                className="space-y-5"
              >
                {/* LinkedIn */}
                <div className={`${ONBOARDING_SURFACE_PAD} ${ONBOARDING_SURFACE} min-h-[11.5rem]`}>
                  <div className="flex items-start gap-4">
                    <div className={ONBOARDING_ICON_WELL}>
                      <Linkedin className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className={ONBOARDING_CARD_TITLE}>LinkedIn</h3>
                          <p className={`mt-0.5 ${ONBOARDING_CARD_DESCRIPTION}`}>
                            Connect your account, or paste a profile link / username
                          </p>
                        </div>
                        {(connectedLinkedin || imports.linkedin.status === 'success') && (
                          <StatusBadge
                            status={
                              imports.linkedin.status === 'idle'
                                ? 'success'
                                : imports.linkedin.status
                            }
                            message={linkedinName || 'Connected'}
                          />
                        )}
                      </div>

                      {connectedLinkedin ? (
                        <div className="mt-4 flex items-center gap-2">
                          <div className="flex items-center gap-2">
                            {linkedinAvatarUrl && (
                              <div className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-border/50">
                                <Image
                                  src={linkedinAvatarUrl}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            )}
                            <span className="text-sm text-muted-foreground">{linkedinName}</span>
                          </div>
                          <div className="ml-auto flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleLinkedInImport()}
                              disabled={imports.linkedin.status === 'importing'}
                            >
                              {imports.linkedin.status === 'importing' ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Upload className="mr-1 h-3 w-3" />
                              )}
                              {imports.linkedin.status === 'success' ? 'Refresh' : 'Import'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground hover:text-destructive"
                              onClick={handleLinkedInDisconnect}
                              disabled={linkedinDisconnecting}
                            >
                              {linkedinDisconnecting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleLinkedInConnect}
                            disabled={linkedinConnecting}
                            className="gap-1.5"
                          >
                            {linkedinConnecting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Linkedin className="h-3.5 w-3.5" />
                            )}
                            {linkedinConnecting ? 'Connecting...' : 'Connect LinkedIn'}
                          </Button>
                          {imports.linkedin.status === 'success' || importedData.linkedin ? (
                            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                {linkedinAvatarUrl ? (
                                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-border/50">
                                    <Image
                                      src={linkedinAvatarUrl}
                                      alt=""
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border/50">
                                    <Linkedin className="h-3.5 w-3.5 text-foreground" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {linkedinName || 'LinkedIn profile'}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {linkedinHeadline ||
                                      imports.linkedin.message ||
                                      'Profile imported'}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 shrink-0 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    setLinkedinProfileInput('');
                                    setImportedData((prev) => {
                                      const next = { ...prev };
                                      delete next.linkedin;
                                      return next;
                                    });
                                    updateImportStatus('linkedin', {
                                      status: 'idle',
                                      message: undefined,
                                      itemsImported: undefined,
                                    });
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="h-px flex-1 bg-border/70" />
                                <span>or paste profile link</span>
                                <span className="h-px flex-1 bg-border/70" />
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="linkedin.com/in/you or username"
                                  value={linkedinProfileInput}
                                  onChange={(e) => setLinkedinProfileInput(e.target.value)}
                                  className="h-9 text-sm"
                                  onKeyDown={(e) =>
                                    e.key === 'Enter' && handleLinkedInImport(linkedinProfileInput)
                                  }
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleLinkedInImport(linkedinProfileInput)}
                                  disabled={
                                    imports.linkedin.status === 'importing' ||
                                    !linkedinProfileInput.trim()
                                  }
                                  className="shrink-0"
                                >
                                  {imports.linkedin.status === 'importing' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    'Import'
                                  )}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {linkedinError && (
                        <p className="mt-2 text-xs text-destructive">{linkedinError}</p>
                      )}
                      {imports.linkedin.status === 'error' && imports.linkedin.message && (
                        <p className="mt-2 text-xs text-destructive">{imports.linkedin.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* GitHub */}
                <div className={`${ONBOARDING_SURFACE_PAD} ${ONBOARDING_SURFACE} min-h-[11.5rem]`}>
                  <div className="flex items-start gap-4">
                    <div className={ONBOARDING_ICON_WELL}>
                      <Github className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className={ONBOARDING_CARD_TITLE}>GitHub</h3>
                          <p className={`mt-0.5 ${ONBOARDING_CARD_DESCRIPTION}`}>
                            Connect your account, or paste a profile link / username
                          </p>
                        </div>
                        {(connectedGithub || imports.github.status === 'success') && (
                          <StatusBadge
                            status={
                              imports.github.status === 'idle' ? 'success' : imports.github.status
                            }
                            message={
                              githubDisplayUsername
                                ? `@${githubDisplayUsername}`
                                : githubUsername
                                  ? `@${extractGitHubUsername(githubUsername) || githubUsername}`
                                  : 'Imported'
                            }
                          />
                        )}
                      </div>

                      {connectedGithub ? (
                        <div className="mt-4 flex items-center gap-2">
                          <div className="flex items-center gap-2">
                            {githubAvatarUrl && (
                              <div className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-border/50">
                                <Image
                                  src={githubAvatarUrl}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            )}
                            <span className="text-sm text-muted-foreground">
                              @{githubDisplayUsername}
                            </span>
                          </div>
                          <div className="ml-auto flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                githubDisplayUsername && handleGitHubImport(githubDisplayUsername)
                              }
                              disabled={imports.github.status === 'importing'}
                            >
                              {imports.github.status === 'importing' ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Upload className="mr-1 h-3 w-3" />
                              )}
                              {imports.github.status === 'success' ? 'Refresh' : 'Import'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground hover:text-destructive"
                              onClick={handleGitHubDisconnect}
                              disabled={githubDisconnecting}
                            >
                              {githubDisconnecting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGitHubConnect}
                            disabled={githubConnecting}
                            className="gap-1.5"
                          >
                            {githubConnecting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Github className="h-3.5 w-3.5" />
                            )}
                            {githubConnecting ? 'Connecting...' : 'Connect GitHub'}
                          </Button>
                          {imports.github.status === 'success' || importedData.github ? (
                            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                {githubAvatarUrl ? (
                                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-border/50">
                                    <Image
                                      src={githubAvatarUrl}
                                      alt=""
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border/50">
                                    <Github className="h-3.5 w-3.5 text-foreground" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    @{githubDisplayUsername || githubUsername}
                                  </p>
                                  {imports.github.message && (
                                    <p className="truncate text-xs text-muted-foreground">
                                      {imports.github.message}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 shrink-0 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    setGithubUsername('');
                                    setImportedData((prev) => {
                                      const next = { ...prev };
                                      delete next.github;
                                      return next;
                                    });
                                    updateImportStatus('github', {
                                      status: 'idle',
                                      message: undefined,
                                      itemsImported: undefined,
                                    });
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="h-px flex-1 bg-border/70" />
                                <span>or paste profile link</span>
                                <span className="h-px flex-1 bg-border/70" />
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="github.com/you or username"
                                  value={githubUsername}
                                  onChange={(e) => setGithubUsername(e.target.value)}
                                  className="h-9 text-sm"
                                  onKeyDown={(e) =>
                                    e.key === 'Enter' && handleGitHubImport(githubUsername)
                                  }
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleGitHubImport(githubUsername)}
                                  disabled={
                                    imports.github.status === 'importing' || !githubUsername.trim()
                                  }
                                  className="shrink-0"
                                >
                                  {imports.github.status === 'importing' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    'Import'
                                  )}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {githubError && (
                        <p className="mt-2 text-xs text-destructive">{githubError}</p>
                      )}
                      {imports.github.status === 'error' && imports.github.message && (
                        <p className="mt-2 text-xs text-destructive">{imports.github.message}</p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─────────────── STEP 4: ADDITIONAL PLATFORMS ─────────────── */}
            {currentStep === 'platforms' && (
              <motion.div
                key="step-platforms"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {/* Personal portfolio */}
                <div className={`${ONBOARDING_SURFACE_PAD} ${ONBOARDING_SURFACE}`}>
                  <div className="flex items-start gap-4">
                    <div className={ONBOARDING_ICON_WELL}>
                      <Globe className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex-1">
                      <h3 className={ONBOARDING_CARD_TITLE}>Personal portfolio</h3>
                      <p className={`mt-0.5 ${ONBOARDING_CARD_DESCRIPTION}`}>
                        Add your website or portfolio URL
                      </p>
                      <div className="mt-3">
                        <Input
                          placeholder="https://yoursite.com"
                          value={portfolioUrl}
                          onChange={(e) => setPortfolioUrl(e.target.value)}
                          className="h-9 text-sm"
                          inputMode="url"
                          autoComplete="url"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* YouTube */}
                <div className={`${ONBOARDING_SURFACE_PAD} ${ONBOARDING_SURFACE}`}>
                  <div className="flex items-start gap-4">
                    <div className={ONBOARDING_ICON_WELL}>
                      <YouTubeIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className={ONBOARDING_CARD_TITLE}>YouTube</h3>
                        <StatusBadge
                          status={imports.youtube.status}
                          message={imports.youtube.message}
                        />
                      </div>
                      <p className={`mt-0.5 ${ONBOARDING_CARD_DESCRIPTION}`}>
                        Import your latest videos and channel info
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Input
                          placeholder="@channel or channel URL"
                          value={youtubeChannel}
                          onChange={(e) => setYoutubeChannel(e.target.value)}
                          className="h-9 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleYouTubeImport()}
                        />
                        <Button
                          size="sm"
                          onClick={handleYouTubeImport}
                          disabled={
                            imports.youtube.status === 'importing' || !youtubeChannel.trim()
                          }
                          className="shrink-0"
                        >
                          {imports.youtube.status === 'importing' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Import'
                          )}
                        </Button>
                      </div>
                      {imports.youtube.status === 'error' && imports.youtube.message && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {imports.youtube.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Medium */}
                <div className={`${ONBOARDING_SURFACE_PAD} ${ONBOARDING_SURFACE}`}>
                  <div className="flex items-start gap-4">
                    <div className={ONBOARDING_ICON_WELL}>
                      <MediumIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className={ONBOARDING_CARD_TITLE}>Medium</h3>
                        <StatusBadge
                          status={imports.medium.status}
                          message={imports.medium.message}
                        />
                      </div>
                      <p className={`mt-0.5 ${ONBOARDING_CARD_DESCRIPTION}`}>
                        Import your published articles and blog posts
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Input
                          placeholder="@username or medium.com/@username"
                          value={mediumUsername}
                          onChange={(e) => setMediumUsername(e.target.value)}
                          className="h-9 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleMediumImport()}
                        />
                        <Button
                          size="sm"
                          onClick={handleMediumImport}
                          disabled={imports.medium.status === 'importing' || !mediumUsername.trim()}
                          className="shrink-0"
                        >
                          {imports.medium.status === 'importing' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Import'
                          )}
                        </Button>
                      </div>
                      {imports.medium.status === 'error' && imports.medium.message && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {imports.medium.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Substack */}
                <div className={`${ONBOARDING_SURFACE_PAD} ${ONBOARDING_SURFACE}`}>
                  <div className="flex items-start gap-4">
                    <div className={ONBOARDING_ICON_WELL}>
                      <SubstackIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className={ONBOARDING_CARD_TITLE}>Substack</h3>
                        <StatusBadge
                          status={imports.substack.status}
                          message={imports.substack.message}
                        />
                      </div>
                      <p className={`mt-0.5 ${ONBOARDING_CARD_DESCRIPTION}`}>
                        Import your newsletter posts and publications
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Input
                          placeholder="name or yourname.substack.com"
                          value={substackUsername}
                          onChange={(e) => setSubstackUsername(e.target.value)}
                          className="h-9 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleSubstackImport()}
                        />
                        <Button
                          size="sm"
                          onClick={handleSubstackImport}
                          disabled={
                            imports.substack.status === 'importing' || !substackUsername.trim()
                          }
                          className="shrink-0"
                        >
                          {imports.substack.status === 'importing' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Import'
                          )}
                        </Button>
                      </div>
                      {imports.substack.status === 'error' && imports.substack.message && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {imports.substack.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Links */}
                <div className={`${ONBOARDING_SURFACE_PAD} ${ONBOARDING_SURFACE}`}>
                  <div className="flex items-start gap-4">
                    <div className={ONBOARDING_ICON_WELL}>
                      <Link2 className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className={ONBOARDING_CARD_TITLE}>Custom Links</h3>
                        <StatusBadge
                          status={imports.links.status}
                          message={imports.links.message}
                        />
                      </div>
                      <p className={`mt-0.5 ${ONBOARDING_CARD_DESCRIPTION}`}>
                        Add any other website or social link
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Input
                          placeholder="https://..."
                          value={linkInput}
                          onChange={(e) => setLinkInput(e.target.value)}
                          className="h-9 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddLink}
                          className="shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {linkUrls.length > 0 && (
                        <div className="mt-2.5 space-y-1.5">
                          {linkUrls.map((url) => (
                            <div
                              key={url}
                              className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-1.5 text-xs"
                            >
                              <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="flex-1 truncate text-muted-foreground">{url}</span>
                              <button
                                onClick={() => handleRemoveLink(url)}
                                className="shrink-0 text-muted-foreground/40 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <Button
                            size="sm"
                            onClick={handleLinksImport}
                            disabled={imports.links.status === 'importing'}
                            className="mt-2 w-full"
                          >
                            {imports.links.status === 'importing' ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Import {linkUrls.length} link{linkUrls.length !== 1 ? 's' : ''}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          {error && currentStep !== 'photo' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </motion.div>
          )}
        </div>

        {/* Navigation — hidden on resume choice (options are the CTAs) */}
        {!showResumeChoice && (
          <motion.div
            className={ONBOARDING_FOOTER}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div>
              {(currentStepIndex > 0 || Boolean(resumeFileName)) && (
                <Button
                  variant="ghost"
                  onClick={goBack}
                  disabled={isCompleting || isWaitingForParsing}
                  className="gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={goNext}
                disabled={isCompleting || isWaitingForParsing}
                className="gap-1.5 px-6"
                size="lg"
                variant={hasCurrentStepAction ? 'default' : 'outline'}
              >
                {isCompleting || isWaitingForParsing ? (
                  <>
                    <Spinner size="sm" />
                    {isWaitingForParsing ? 'Finalizing...' : 'Creating resume...'}
                  </>
                ) : (
                  <>
                    {primaryNextLabel}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* ─── Full-screen parsing / complete progress overlay ─── */}
      <AnimatePresence>
        {(isWaitingForParsing || isCompleting) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="surface-raised mx-4 max-w-sm space-y-6 p-8 text-center"
            >
              {/* Single calm spinner */}
              <div className="relative mx-auto h-12 w-12">
                <div className="absolute inset-0 rounded-full border-2 border-border" />
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-section-title text-lg">
                  {isWaitingForParsing ? 'Reading your resume' : 'Creating your resume'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isWaitingForParsing ? (
                    <>
                      Extracting experience, skills, and education
                      {resumeFileName && (
                        <>
                          {' '}
                          from <span className="font-medium text-foreground">{resumeFileName}</span>
                        </>
                      )}
                    </>
                  ) : (
                    'Setting up your profile so you can edit it in the builder'
                  )}
                </p>
              </div>

              {/* Animated progress bar */}
              <div className="space-y-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: '5%' }}
                    animate={{ width: ['5%', '40%', '65%', '85%', '92%'] }}
                    transition={{ duration: 15, ease: 'easeOut', times: [0, 0.2, 0.5, 0.8, 1] }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {isWaitingForParsing ? 'This usually takes 10–30 seconds.' : 'Almost there…'}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog open={showDiscardResumeDialog} onOpenChange={setShowDiscardResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard uploaded resume?</AlertDialogTitle>
            <AlertDialogDescription>
              {resumeFileName
                ? `This will remove "${resumeFileName}" and any data we've extracted from it. You can upload again or start blank.`
                : "This will remove your uploaded resume and any data we've extracted from it. You can upload again or start blank."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep resume</AlertDialogCancel>
            <AlertDialogAction onClick={discardResumeAndReturnToChoice}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
