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
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
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

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
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

// ─── SVG Brand Icons ──────────────────────────────────────────────
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
        fill="#1877F2"
      />
    </svg>
  );
}

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
type ImportSource =
  | 'resume'
  | 'github'
  | 'linkedin'
  | 'facebook'
  | 'medium'
  | 'youtube'
  | 'substack'
  | 'links';

interface ImportStatus {
  source: ImportSource;
  status: 'idle' | 'added' | 'importing' | 'success' | 'error';
  message?: string;
  itemsImported?: number;
}

type OnboardingStep = 'resume' | 'photo' | 'accounts' | 'platforms' | 'gallery' | 'review';

const STEPS: OnboardingStep[] = ['resume', 'photo', 'accounts', 'platforms', 'gallery', 'review'];

const STEP_META: Record<OnboardingStep, { title: string; subtitle: string }> = {
  resume: {
    title: 'Upload your resume',
    subtitle: "We'll extract your experience, education, skills and more",
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
  gallery: { title: 'Portfolio photos', subtitle: 'Add up to 3 photos to showcase your work' },
  review: {
    title: 'Review your profile',
    subtitle: 'Check everything looks good before creating your profile',
  },
};

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

  const [facebookConnecting, setFacebookConnecting] = useState(false);
  const [facebookDisconnecting, setFacebookDisconnecting] = useState(false);
  const [facebookError, setFacebookError] = useState<string | null>(null);

  // ─── Import states ──────────────────────────────────────────────
  const [imports, setImports] = useState<Record<ImportSource, ImportStatus>>({
    resume: { source: 'resume', status: 'idle' },
    github: { source: 'github', status: 'idle' },
    linkedin: { source: 'linkedin', status: 'idle' },
    facebook: { source: 'facebook', status: 'idle' },
    medium: { source: 'medium', status: 'idle' },
    youtube: { source: 'youtube', status: 'idle' },
    substack: { source: 'substack', status: 'idle' },
    links: { source: 'links', status: 'idle' },
  });

  // ─── Form states ───────────────────────────────────────────────
  const [githubUsername, setGithubUsername] = useState('');
  const [mediumUsername, setMediumUsername] = useState('');
  const [youtubeChannel, setYoutubeChannel] = useState('');
  const [substackUsername, setSubstackUsername] = useState('');
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

  // Gallery states
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);

  // Resume
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [, setResumeFileUrl] = useState<string | null>(null);
  const [resumeThumbnail, setResumeThumbnail] = useState<string | null>(null);
  const [resumeParsingPromise, setResumeParsingPromise] = useState<Promise<void> | null>(null);
  const [isWaitingForParsing, setIsWaitingForParsing] = useState(false);
  const [isDraggingResume, setIsDraggingResume] = useState(false);

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
    if (fromLI?.username) return fromLI.username as string;
    if (connectedLinkedin?.username) return connectedLinkedin.username;
    if (liProfile?.firstName && liProfile?.lastName)
      return `${liProfile.firstName} ${liProfile.lastName}`;
    if (connectedLinkedin?.firstName && connectedLinkedin?.lastName)
      return `${connectedLinkedin.firstName} ${connectedLinkedin.lastName}`;
    return null;
  })();

  const connectedFacebook = user?.externalAccounts?.find((a) => {
    const p = a.provider as string;
    return p === 'facebook' || p === 'oauth_facebook';
  });

  const facebookName = (() => {
    if (connectedFacebook?.firstName && connectedFacebook?.lastName)
      return `${connectedFacebook.firstName} ${connectedFacebook.lastName}`;
    if (connectedFacebook?.firstName || connectedFacebook?.lastName)
      return connectedFacebook?.firstName || connectedFacebook?.lastName;
    return null;
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

      const galleryPhotoKeys: string[] = [];
      for (let i = 0; i < galleryPhotos.length; i++) {
        const key = `onboarding_gallery_${user?.id || 'anon'}_${i}`;
        await savePhotoToIndexedDB(key, galleryPhotos[i]);
        galleryPhotoKeys.push(key);
      }

      const stateToSave = {
        imports,
        importedData,
        githubUsername,
        resumeFileName,
        uploadedPhotoKey,
        galleryPhotoKeys: galleryPhotoKeys.length > 0 ? galleryPhotoKeys : null,
        mediumUsername,
        youtubeChannel,
        substackUsername,
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
    uploadedPhoto,
    galleryPhotos,
    resumeFileName,
    user?.id,
    mediumUsername,
    youtubeChannel,
    substackUsername,
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
            setImports(restoredImports);
          }
          if (parsed.importedData) setImportedData(parsed.importedData);
          if (parsed.githubUsername) setGithubUsername(parsed.githubUsername);
          if (parsed.resumeFileName) setResumeFileName(parsed.resumeFileName);
          if (parsed.mediumUsername) setMediumUsername(parsed.mediumUsername);
          if (parsed.youtubeChannel) setYoutubeChannel(parsed.youtubeChannel);
          if (parsed.substackUsername) setSubstackUsername(parsed.substackUsername);
          if (parsed.linkUrls?.length) setLinkUrls(parsed.linkUrls);
          if (parsed.currentStep && STEPS.includes(parsed.currentStep))
            setCurrentStep(parsed.currentStep);

          if (parsed.uploadedPhotoKey) {
            const photoData = await getPhotoFromIndexedDB(parsed.uploadedPhotoKey);
            if (photoData) setUploadedPhoto(photoData);
          }
          if (parsed.galleryPhotoKeys?.length) {
            const restoredGallery: string[] = [];
            for (const key of parsed.galleryPhotoKeys) {
              const photoData = await getPhotoFromIndexedDB(key);
              if (photoData) restoredGallery.push(photoData);
            }
            if (restoredGallery.length > 0) setGalleryPhotos(restoredGallery);
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
    const resolved = (overrideUsername ?? githubUsername).trim();
    if (!resolved) {
      updateImportStatus('github', { status: 'error', message: 'Please enter a GitHub username' });
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
    } catch (err: unknown) {
      setLinkedinError(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLinkedinDisconnecting(false);
    }
  };

  const handleLinkedInImport = async () => {
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
  };

  // ─── Facebook ───────────────────────────────────────────────────
  const handleFacebookConnect = async () => {
    setFacebookConnecting(true);
    setFacebookError(null);
    const primaryEmail = user?.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      setFacebookError('Please verify your email first.');
      setFacebookConnecting(false);
      return;
    }
    try {
      await saveImportState();
      const externalAccount = await user?.createExternalAccount({
        strategy: 'oauth_facebook',
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) window.location.href = url.toString();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already connected')) {
        await user?.reload();
        setFacebookError(null);
      } else setFacebookError(`Connection failed: ${msg}`);
      setFacebookConnecting(false);
    }
  };

  const handleFacebookDisconnect = async () => {
    if (!connectedFacebook) return;
    setFacebookDisconnecting(true);
    setFacebookError(null);
    try {
      await connectedFacebook.destroy();
      await user?.reload();
      updateImportStatus('facebook', {
        status: 'idle',
        message: undefined,
        itemsImported: undefined,
      });
    } catch (err: unknown) {
      setFacebookError(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFacebookDisconnecting(false);
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

  // Gallery upload
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = 3 - galleryPhotos.length;
    if (remaining <= 0) {
      setError('Maximum 3 portfolio photos');
      return;
    }
    setIsUploadingGallery(true);
    setError(null);
    try {
      const newPhotos: string[] = [];
      for (let i = 0; i < Math.min(files.length, remaining); i++) {
        const file = files[i];
        if (!file.type.startsWith('image/') || file.size > 40 * 1024 * 1024) continue;
        const base64 = await fileToBase64(file);
        newPhotos.push(base64);
      }
      if (newPhotos.length === 0) setError('No valid image files selected');
      else setGalleryPhotos((prev) => [...prev, ...newPhotos].slice(0, 3));
    } catch {
      setError('Failed to process gallery images');
    } finally {
      setIsUploadingGallery(false);
      e.target.value = '';
    }
  };

  const handleRemoveGalleryPhoto = (index: number) => {
    setGalleryPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Photo resolution helper ───────────────────────────────────

  // ─── Continue to Review handler ────────────────────────────────
  const handleGoToReview = async (options?: { skipReview?: boolean }) => {
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
      // Try to get from imported data
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

    const resumeProfile = (resumeData?.profile as Record<string, unknown>) || {};
    const linkedinProfile = (linkedinData?.profile as Record<string, unknown>) || {};
    const githubProfile = (githubData?.profile as Record<string, unknown>) || {};
    const resumeContactInfo = resumeData?.contactInfo as Record<string, unknown> | undefined;

    const allNames: Array<{
      firstName?: string;
      middleName?: string;
      lastName?: string;
      source: string;
    }> = [];
    if (user?.firstName || user?.lastName)
      allNames.push({
        firstName: user.firstName || undefined,
        middleName: undefined,
        lastName: user.lastName || undefined,
        source: 'SIGNUP',
      });
    if (resumeProfile.firstName || resumeProfile.middleName || resumeProfile.lastName)
      allNames.push({
        firstName: resumeProfile.firstName as string | undefined,
        middleName: resumeProfile.middleName as string | undefined,
        lastName: resumeProfile.lastName as string | undefined,
        source: 'RESUME',
      });
    if (linkedinProfile.firstName || linkedinProfile.middleName || linkedinProfile.lastName)
      allNames.push({
        firstName: linkedinProfile.firstName as string | undefined,
        middleName: linkedinProfile.middleName as string | undefined,
        lastName: linkedinProfile.lastName as string | undefined,
        source: 'LINKEDIN',
      });
    if (githubProfile.firstName || githubProfile.middleName || githubProfile.lastName)
      allNames.push({
        firstName: githubProfile.firstName as string | undefined,
        middleName: githubProfile.middleName as string | undefined,
        lastName: githubProfile.lastName as string | undefined,
        source: 'GITHUB',
      });

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

    // Store avatar in IndexedDB if it's a data URL
    const avatarUrlForStorage = mergedProfile.avatarUrl as string | undefined;
    if (avatarUrlForStorage?.startsWith('data:')) {
      try {
        const photoKey = `uploaded_avatar_${Date.now()}`;
        await savePhotoToIndexedDB(photoKey, avatarUrlForStorage);
        mergedProfile.avatarUrl = `indexeddb:${photoKey}`;
      } catch (err) {
        console.error('Failed to store photo in IndexedDB:', err);
        delete mergedProfile.avatarUrl;
      }
    }

    // Also store the full uncropped photo if there's one
    if (uploadedPhoto) {
      try {
        const fullPhotoKey = `uploaded_full_photo_${Date.now()}`;
        await savePhotoToIndexedDB(fullPhotoKey, uploadedPhoto);
        mergedProfile.fullPhotoUrl = `indexeddb:${fullPhotoKey}`;
      } catch (err) {
        console.error('Failed to store full photo:', err);
      }
    }

    const allLinks = [
      ...((resumeData?.links as Array<Record<string, unknown>>) || []),
      ...((linkedinData?.links as Array<Record<string, unknown>>) || []),
      ...((githubData?.links as Array<Record<string, unknown>>) || []),
    ];
    const seenUrls = new Set<string>();
    const uniqueLinks = allLinks.filter((link) => {
      const url = (link.url as string)?.toLowerCase().trim();
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });

    const galleryPhotoRefs: string[] = [];
    for (let i = 0; i < galleryPhotos.length; i++) {
      const photo = galleryPhotos[i];
      if (photo.startsWith('data:')) {
        try {
          const galleryKey = `gallery_photo_${Date.now()}_${i}`;
          await savePhotoToIndexedDB(galleryKey, photo);
          galleryPhotoRefs.push(`indexeddb:${galleryKey}`);
        } catch (err) {
          console.error('Failed to store gallery photo:', err);
        }
      } else {
        galleryPhotoRefs.push(photo);
      }
    }

    const dataForReview = {
      profile: mergedProfile,
      contactInfo,
      allNames,
      experiences: resumeData?.experiences || [],
      educations: resumeData?.educations || [],
      skills: [
        ...((resumeData?.skills as string[]) || []),
        ...((githubData?.skills as string[]) || []),
      ].filter((s, i, arr) => arr.indexOf(s) === i),
      links: uniqueLinks,
      certifications: resumeData?.certifications || [],
      projects: [
        ...((resumeData?.projects as Array<Record<string, unknown>>) || []),
        ...((githubData?.projects as Array<Record<string, unknown>>) || []),
      ],
      galleryPhotos: galleryPhotoRefs,
      _sources: { hasResume: !!resumeData, hasLinkedIn: !!linkedinData, hasGitHub: !!githubData },
      _resumeFileName: resumeFileName || null,
    };

    sessionStorage.setItem('onboarding_parsed_resume', JSON.stringify(dataForReview));
    // skipReview sends the user straight to the dashboard by auto-submitting the
    // imported data on the review screen; otherwise they step through the review.
    router.push(options?.skipReview ? '/onboarding/review?auto=1' : '/onboarding/review');
  };

  // ─── Navigation ─────────────────────────────────────────────────
  const isLastDataStep = STEPS[STEPS.indexOf(currentStep) + 1] === 'review';

  const goNext = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1]);
    }
  };

  const goBack = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) setCurrentStep(STEPS[idx - 1]);
  };

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
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          {status === 'added' ? 'Added' : message || 'Done'}
        </span>
      );
    }
    if (status === 'importing') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          <Loader2 className="h-3 w-3 animate-spin" /> Importing...
        </span>
      );
    }
    if (status === 'error') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-500">
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
      {/* Progress bar */}
      <div className="fixed left-0 right-0 top-16 z-40 h-1 bg-muted/50">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-primary/70"
          initial={{ width: '0%' }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 pb-24 pt-10 sm:px-6">
        {/* Step indicator pills */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((step, idx) => (
            <button
              key={step}
              onClick={() => {
                // Allow clicking on previous/current steps
                if (idx <= currentStepIndex) setCurrentStep(step);
              }}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === currentStepIndex
                  ? 'w-8 bg-primary'
                  : idx < currentStepIndex
                    ? 'w-2 bg-primary/50 hover:bg-primary/70'
                    : 'w-2 bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step header */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
            className="mb-8 text-center"
          >
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {STEP_META[currentStep].title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {STEP_META[currentStep].subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Step content */}
        <AnimatePresence mode="wait">
          {/* ─────────────── STEP 1: RESUME ─────────────── */}
          {currentStep === 'resume' && (
            <motion.div
              key="step-resume"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
            >
              <div
                ref={resumeDropRef}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingResume(true);
                }}
                onDragLeave={() => setIsDraggingResume(false)}
                onDrop={handleResumeDrop}
                className={`relative mx-auto max-w-md rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
                  isDraggingResume
                    ? 'scale-[1.02] border-primary bg-primary/5'
                    : resumeFileName
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-border/60 bg-card/50 hover:border-primary/30'
                }`}
              >
                <AnimatePresence mode="wait">
                  {resumeFileName &&
                  (imports.resume.status === 'success' ||
                    imports.resume.status === 'added' ||
                    imports.resume.status === 'importing') ? (
                    <motion.div
                      key="uploaded"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="group relative">
                        {resumeThumbnail ? (
                          <div className="relative h-48 w-36 overflow-hidden rounded-lg border border-border/40 bg-white shadow-md">
                            <Image
                              src={resumeThumbnail}
                              alt="Resume preview"
                              fill
                              className="object-cover object-top"
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div className="flex h-48 w-36 flex-col items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 shadow-md">
                            <FileText className="h-12 w-12 text-emerald-500" />
                            <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">
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
                              <Loader2 className="h-3 w-3 animate-spin text-primary" /> AI parsing
                              in background...
                            </p>
                            <div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-muted">
                              <motion.div
                                className="h-full rounded-full bg-primary/60"
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
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
                            <Loader2 className="h-3 w-3 animate-spin text-primary" /> Uploading...
                          </p>
                        )}
                        {imports.resume.status === 'success' && imports.resume.message && (
                          <motion.p
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mt-1 text-xs text-emerald-600 dark:text-emerald-400"
                          >
                            <CheckCircle2 className="mr-1 inline h-3 w-3" />
                            {imports.resume.message}
                          </motion.p>
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
                          onClick={() => {
                            setResumeFileName(null);
                            setResumeFileUrl(null);
                            setResumeThumbnail(null);
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
                          }}
                          className="gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="placeholder"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/60">
                        {imports.resume.status === 'importing' ? (
                          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                        ) : (
                          <FileText className="h-10 w-10 text-muted-foreground/60" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {isDraggingResume ? 'Drop your resume here' : 'Drag & drop your resume'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">PDF format, up to 10MB</p>
                      </div>
                      <Button
                        onClick={() => document.getElementById('resume-upload')?.click()}
                        disabled={imports.resume.status === 'importing'}
                        className="gap-1.5"
                      >
                        <Upload className="h-4 w-4" /> Choose file
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {imports.resume.status === 'error' && imports.resume.message && (
                  <p className="mt-4 text-sm text-red-500">{imports.resume.message}</p>
                )}

                <input
                  id="resume-upload"
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleResumeUpload}
                />
              </div>
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
              <div className="mx-auto max-w-4xl">
                {uploadedPhoto ? (
                  <div className="flex flex-col items-stretch gap-6 md:flex-row">
                    {/* Crop area — fills available height */}
                    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border/40 bg-black/5 md:aspect-square md:h-[min(70vh,32rem)] md:w-auto md:flex-shrink-0">
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
                          cropAreaStyle: { border: '2px solid hsl(var(--primary))' },
                        }}
                      />
                    </div>

                    {/* Controls — sidebar on desktop, below on mobile */}
                    <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/40 bg-card/80 p-5 backdrop-blur-sm md:w-56">
                      <div className="space-y-5">
                        {/* Zoom */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">
                              Zoom
                            </label>
                            <span className="text-xs text-muted-foreground">
                              {Math.round(photoZoom * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={photoZoom}
                            min={1}
                            max={3}
                            step={0.01}
                            onChange={setPhotoZoom}
                          />
                        </div>

                        {/* Tilt correction */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">
                              Tilt correction
                            </label>
                            <span className="text-xs text-muted-foreground">{photoRotation}°</span>
                          </div>
                          <Slider
                            value={photoRotation}
                            min={-45}
                            max={45}
                            step={1}
                            onChange={setPhotoRotation}
                          />
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPhotoRotation(0);
                            setPhotoZoom(1);
                            setPhotoCrop({ x: 0, y: 0 });
                          }}
                          className="w-full gap-1.5"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Reset
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById('photo-upload')?.click()}
                          className="w-full gap-1.5"
                        >
                          <Camera className="h-3.5 w-3.5" /> Reupload
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRemovePhoto}
                          className="w-full gap-1.5 text-muted-foreground hover:text-destructive"
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
                    className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 ${
                      isDraggingPhoto
                        ? 'scale-[1.02] border-primary bg-primary/5'
                        : 'border-border/60 bg-card/50 hover:border-primary/30'
                    }`}
                  >
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted/60">
                      {isUploadingPhoto ? (
                        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                      ) : (
                        <User className="h-12 w-12 text-muted-foreground/50" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {isDraggingPhoto ? 'Drop your photo here' : 'Drag & drop your photo'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        JPG, PNG or WebP. Drag the square area to select your display picture.
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

                {error && <p className="mt-4 text-center text-sm text-red-500">{error}</p>}

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
              className="space-y-4"
            >
              {/* LinkedIn */}
              <div className="rounded-xl border border-border/40 bg-card/80 p-5 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0A66C2]/10">
                    <Linkedin className="h-6 w-6 text-[#0A66C2]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">LinkedIn</h3>
                        <p className="text-xs text-muted-foreground">
                          Import your headline, work experience, education, and profile photo
                        </p>
                      </div>
                      {connectedLinkedin && (
                        <StatusBadge
                          status={
                            imports.linkedin.status === 'idle' ? 'success' : imports.linkedin.status
                          }
                          message={linkedinName || 'Connected'}
                        />
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {connectedLinkedin ? (
                        <>
                          <div className="flex items-center gap-2">
                            {connectedLinkedin.imageUrl && (
                              <div className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-border/50">
                                <Image
                                  src={connectedLinkedin.imageUrl}
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
                              onClick={handleLinkedInImport}
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
                        </>
                      ) : (
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
                            <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />
                          )}
                          {linkedinConnecting ? 'Connecting...' : 'Connect LinkedIn'}
                        </Button>
                      )}
                    </div>
                    {linkedinError && <p className="mt-2 text-xs text-red-500">{linkedinError}</p>}
                    {imports.linkedin.status === 'error' && imports.linkedin.message && (
                      <p className="mt-2 text-xs text-red-500">{imports.linkedin.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* GitHub */}
              <div className="rounded-xl border border-border/40 bg-card/80 p-5 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                    <Github className="h-6 w-6 text-[#24292e] dark:text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">GitHub</h3>
                        <p className="text-xs text-muted-foreground">
                          Import your repositories, programming languages, and contribution stats
                        </p>
                      </div>
                      {(connectedGithub || imports.github.status === 'success') && (
                        <StatusBadge
                          status={
                            imports.github.status === 'idle' ? 'success' : imports.github.status
                          }
                          message={
                            githubUsernameFromAccount
                              ? `@${githubUsernameFromAccount}`
                              : 'Connected'
                          }
                        />
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {connectedGithub ? (
                        <>
                          <div className="flex items-center gap-2">
                            {connectedGithub.imageUrl && (
                              <div className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-border/50">
                                <Image
                                  src={connectedGithub.imageUrl}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            )}
                            <span className="text-sm text-muted-foreground">
                              @{githubUsernameFromAccount}
                            </span>
                          </div>
                          <div className="ml-auto flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                githubUsernameFromAccount &&
                                handleGitHubImport(githubUsernameFromAccount)
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
                        </>
                      ) : (
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
                      )}
                    </div>
                    {githubError && <p className="mt-2 text-xs text-red-500">{githubError}</p>}
                    {imports.github.status === 'error' && imports.github.message && (
                      <p className="mt-2 text-xs text-red-500">{imports.github.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Facebook */}
              <div className="rounded-xl border border-border/40 bg-card/80 p-5 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/10">
                    <FacebookIcon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">Facebook</h3>
                        <p className="text-xs text-muted-foreground">
                          Import your name, profile photo, and basic info
                        </p>
                      </div>
                      {connectedFacebook && (
                        <StatusBadge status="success" message={facebookName || 'Connected'} />
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {connectedFacebook ? (
                        <>
                          <div className="flex items-center gap-2">
                            {connectedFacebook.imageUrl && (
                              <div className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-border/50">
                                <Image
                                  src={connectedFacebook.imageUrl}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            )}
                            <span className="text-sm text-muted-foreground">{facebookName}</span>
                          </div>
                          <div className="ml-auto">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground hover:text-destructive"
                              onClick={handleFacebookDisconnect}
                              disabled={facebookDisconnecting}
                            >
                              {facebookDisconnecting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                              <span className="ml-1">Disconnect</span>
                            </Button>
                          </div>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleFacebookConnect}
                          disabled={facebookConnecting}
                          className="gap-1.5"
                        >
                          {facebookConnecting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FacebookIcon className="h-3.5 w-3.5" />
                          )}
                          {facebookConnecting ? 'Connecting...' : 'Connect Facebook'}
                        </Button>
                      )}
                    </div>
                    {facebookError && <p className="mt-2 text-xs text-red-500">{facebookError}</p>}
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
              {/* YouTube */}
              <div className="rounded-xl border border-border/40 bg-card/80 p-5 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                    <YouTubeIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">YouTube</h3>
                      <StatusBadge
                        status={imports.youtube.status}
                        message={imports.youtube.message}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
                        disabled={imports.youtube.status === 'importing' || !youtubeChannel.trim()}
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
                      <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {imports.youtube.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Medium */}
              <div className="rounded-xl border border-border/40 bg-card/80 p-5 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]">
                    <MediumIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Medium</h3>
                      <StatusBadge
                        status={imports.medium.status}
                        message={imports.medium.message}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
                      <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {imports.medium.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Substack */}
              <div className="rounded-xl border border-border/40 bg-card/80 p-5 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FF6719]/10">
                    <SubstackIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Substack</h3>
                      <StatusBadge
                        status={imports.substack.status}
                        message={imports.substack.message}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
                      <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {imports.substack.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Links */}
              <div className="rounded-xl border border-border/40 bg-card/80 p-5 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                    <Link2 className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Custom Links</h3>
                      <StatusBadge status={imports.links.status} message={imports.links.message} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Add any other website, portfolio, or social link
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
                            className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs"
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

          {/* ─────────────── STEP 5: PORTFOLIO PHOTOS ─────────────── */}
          {currentStep === 'gallery' && (
            <motion.div
              key="step-gallery"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mx-auto max-w-lg">
                <div className="grid grid-cols-3 gap-4">
                  {[0, 1, 2].map((idx) => (
                    <div key={idx} className="aspect-square">
                      {galleryPhotos[idx] ? (
                        <div className="group relative h-full w-full overflow-hidden rounded-xl border border-border/40 shadow-sm">
                          <Image
                            src={galleryPhotos[idx]}
                            alt={`Portfolio ${idx + 1}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => handleRemoveGalleryPhoto(idx)}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-white shadow-md"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="absolute bottom-2 right-2 rounded-full bg-emerald-500 p-1 opacity-0 shadow-sm group-hover:opacity-0">
                            <CheckCircle2 className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => document.getElementById('gallery-upload')?.click()}
                          disabled={isUploadingGallery}
                          className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-card/50 transition-all hover:border-primary/30 hover:bg-primary/5"
                        >
                          {isUploadingGallery ? (
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              <Plus className="h-8 w-8 text-muted-foreground/40" />
                              <span className="text-xs text-muted-foreground">Add photo</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-center text-xs text-muted-foreground">
                  {galleryPhotos.length}/3 photos added. These will be displayed in your portfolio
                  showcase.
                </p>

                {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}

                <input
                  id="gallery-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleGalleryUpload}
                />
              </div>
            </motion.div>
          )}

          {/* ─────────────── STEP 6: REVIEW (transition) ─────────────── */}
          {currentStep === 'review' && (
            <motion.div
              key="step-review"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="text-center"
            >
              <div className="mx-auto max-w-md space-y-6">
                {/* Animated checkmark icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                  className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-emerald-500/20 shadow-lg shadow-primary/5"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.4 }}
                  >
                    <CheckCircle2 className="h-10 w-10 text-primary" />
                  </motion.div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <h2 className="text-xl font-bold">All set!</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We&apos;ve gathered your data. Head straight to your dashboard, or review the
                    details first if you&apos;d like.
                  </p>
                </motion.div>

                {/* Summary of what was collected */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="space-y-2 text-left"
                >
                  {(imports.resume.status === 'success' || imports.resume.status === 'added') && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 }}
                      className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm"
                    >
                      {imports.resume.status === 'added' && resumeParsingPromise ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      )}
                      <span className="flex-1">Resume: {resumeFileName}</span>
                      {imports.resume.status === 'added' && resumeParsingPromise && (
                        <span className="text-xs text-amber-500">Processing...</span>
                      )}
                    </motion.div>
                  )}
                  {uploadedPhoto && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 }}
                      className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span>Profile photo uploaded</span>
                    </motion.div>
                  )}
                  {(connectedLinkedin || imports.linkedin.status === 'success') && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.9 }}
                      className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span>LinkedIn: {linkedinName || 'Connected'}</span>
                    </motion.div>
                  )}
                  {(connectedGithub || imports.github.status === 'success') && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.0 }}
                      className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span>GitHub: @{githubUsernameFromAccount || githubUsername}</span>
                    </motion.div>
                  )}
                  {connectedFacebook && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.1 }}
                      className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span>Facebook: {facebookName || 'Connected'}</span>
                    </motion.div>
                  )}
                  {galleryPhotos.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.2 }}
                      className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span>
                        {galleryPhotos.length} portfolio photo
                        {galleryPhotos.length !== 1 ? 's' : ''}
                      </span>
                    </motion.div>
                  )}

                  {/* Show if nothing was collected */}
                  {imports.resume.status === 'idle' &&
                    !uploadedPhoto &&
                    !connectedLinkedin &&
                    imports.linkedin.status !== 'success' &&
                    !connectedGithub &&
                    imports.github.status !== 'success' &&
                    !connectedFacebook &&
                    galleryPhotos.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7 }}
                        className="rounded-lg border border-muted bg-muted/30 p-4 text-center text-sm text-muted-foreground"
                      >
                        No data imported yet. You can still review and fill in details manually.
                      </motion.div>
                    )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && currentStep !== 'photo' && currentStep !== 'gallery' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </motion.div>
        )}

        {/* Navigation */}
        <motion.div
          className="mt-10 flex items-center justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div>
            {currentStepIndex > 0 && (
              <Button variant="ghost" onClick={goBack} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Skip on optional steps */}
            {currentStep !== 'review' && (
              <Button variant="ghost" onClick={goNext} className="text-muted-foreground">
                Skip
              </Button>
            )}

            {currentStep === 'review' ? (
              <div className="flex items-center gap-3">
                {/* Secondary: review everything step by step (optional) */}
                <Button
                  onClick={() => handleGoToReview()}
                  disabled={isWaitingForParsing}
                  variant="outline"
                  size="lg"
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Review details
                </Button>

                {/* Primary: skip review and go straight to the dashboard */}
                <Button
                  onClick={() => handleGoToReview({ skipReview: true })}
                  disabled={isWaitingForParsing}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 px-8 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
                  size="lg"
                >
                  {isWaitingForParsing ? (
                    <>
                      <Spinner size="sm" />
                      Finalizing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Go to Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            ) : isLastDataStep ? (
              <Button
                onClick={goNext}
                className="gap-2 bg-gradient-to-r from-primary to-primary/80 px-6 shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/25"
                size="lg"
              >
                <Sparkles className="h-4 w-4" />
                Review
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={goNext} className="gap-1.5" size="lg">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </motion.div>
      </div>

      {/* ─── Full-screen parsing progress overlay ─── */}
      <AnimatePresence>
        {isWaitingForParsing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="mx-4 max-w-sm space-y-6 rounded-2xl border bg-card p-8 text-center shadow-2xl"
            >
              {/* Animated circular spinner */}
              <div className="relative mx-auto h-20 w-20">
                <div className="absolute inset-0 rounded-full border-4 border-muted" />
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute inset-2 rounded-full border-4 border-primary/30 border-b-transparent"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileText className="h-7 w-7 text-primary" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold">Analyzing your resume</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Our AI is extracting experience, skills, and education
                  {resumeFileName && (
                    <>
                      {' '}
                      from <span className="font-medium text-foreground">{resumeFileName}</span>
                    </>
                  )}
                </p>
              </div>

              {/* Animated progress bar */}
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                    initial={{ width: '5%' }}
                    animate={{ width: ['5%', '40%', '65%', '85%', '92%'] }}
                    transition={{ duration: 15, ease: 'easeOut', times: [0, 0.2, 0.5, 0.8, 1] }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">This usually takes 10–30 seconds…</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
