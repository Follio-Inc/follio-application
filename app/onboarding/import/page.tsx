'use client';

import { useUser } from '@clerk/nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  User,
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
import { ConstellationField } from '@/components/onboarding/constellation/constellation-field';
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
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { extractGitHubUsername, extractLinkedInSlug } from '@/lib/import/profile-url';
import {
  importConstellationOAuth,
  importConstellationPlatform,
  type ConstellationImportBundle,
  type ConstellationLink,
} from '@/lib/onboarding/constellation/import-adapters';
import type {
  BadgeCorner,
  PlatformDef,
  PlatformId,
} from '@/lib/onboarding/constellation/platforms';
import type { ConstellationConnection } from '@/components/onboarding/constellation/constellation-field';
import { hasImportStepAction, importStepNextLabel } from '@/lib/onboarding/step-action';
import {
  ONBOARDING_DROPZONE,
  ONBOARDING_DROPZONE_ACTIVE,
  ONBOARDING_FOOTER,
  ONBOARDING_ICON_WELL,
  ONBOARDING_MAIN,
  ONBOARDING_PAGE_SHELL,
  ONBOARDING_PAGE_SHELL_WIDE,
  ONBOARDING_PAGE_SUBTITLE,
  ONBOARDING_PAGE_TITLE,
  ONBOARDING_STEP_HEADER,
  ONBOARDING_STEP_TRACK,
  ONBOARDING_SURFACE,
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
// ─── Types ────────────────────────────────────────────────────────
type ImportSource = 'resume' | 'github' | 'linkedin' | 'medium' | 'youtube' | 'substack' | 'links';

interface ImportStatus {
  source: ImportSource;
  status: 'idle' | 'added' | 'importing' | 'success' | 'error';
  message?: string;
  itemsImported?: number;
}

type OnboardingStep = 'resume' | 'photo' | 'connect';

const STEPS: OnboardingStep[] = ['resume', 'photo', 'connect'];

const STEP_META: Record<OnboardingStep, { title: string; subtitle: string }> = {
  resume: {
    title: 'How do you want to start?',
    subtitle: 'Upload an existing resume or build one from scratch',
  },
  photo: {
    title: 'Add a profile photo',
    subtitle: 'Upload a photo to make your profile stand out',
  },
  connect: {
    title: 'Connect your accounts',
    subtitle: 'Import data from your professional profiles',
  },
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
/**
 * Extract a clean Substack identifier from various input formats:
 * - username → username
 * - @username → username
 * - https://username.substack.com → username
 * - https://username.substack.com/p/some-post → username
 * - username.substack.com → username
 */
/**
 * Extract a clean YouTube channel identifier from various input formats.
 * The backend's parseChannelInput already handles most formats, but we
 * do a light cleanup here for edge cases.
 */
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
  const [constellationHasAction, setConstellationHasAction] = useState(false);
  const [constellationLinks, setConstellationLinks] = useState<
    Partial<Record<PlatformId, ConstellationLink>>
  >({});
  const [constellationConnected, setConstellationConnected] = useState<
    Partial<Record<PlatformId, ConstellationConnection>>
  >({});
  const constellationBundlesRef = useRef<Partial<Record<PlatformId, ConstellationImportBundle>>>(
    {}
  );
  const [linkUrls, setLinkUrls] = useState<string[]>([]);
  const [linkInput] = useState('');

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

  // ─── State persistence (OAuth draft restore) ───────────────────
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
              parsed.currentStep === 'review' ||
              parsed.currentStep === 'accounts' ||
              parsed.currentStep === 'platforms'
                ? 'connect'
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

  // OAuth auto-import for GitHub / LinkedIn is handled inside ConstellationField
  // once the user lands on the connect step (after redirect restore).

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

  // ─── Constellation connect (replaces accounts + platforms steps) ─
  const applyConstellationBundle = (
    platform: PlatformDef,
    bundle: ConstellationImportBundle,
    input?: string
  ) => {
    constellationBundlesRef.current[platform.id] = bundle;

    if (bundle.dataKey && bundle.data) {
      setImportedData((prev) => ({ ...prev, [bundle.dataKey!]: bundle.data }));
      updateImportStatus(bundle.dataKey, {
        status: 'success',
        message: `Imported ${platform.label}`,
        itemsImported: 1,
      });
      if (bundle.dataKey === 'github') {
        const username =
          (input ? extractGitHubUsername(input) : null) ||
          githubUsernameFromAccount ||
          githubUsername;
        if (username) setGithubUsername(username);
      }
      if (bundle.dataKey === 'linkedin' && input) {
        const slug = extractLinkedInSlug(input);
        if (slug) setLinkedinProfileInput(slug);
      }
      if (bundle.dataKey === 'medium' && input) setMediumUsername(input.trim());
      if (bundle.dataKey === 'youtube' && input) setYoutubeChannel(input.trim());
      if (bundle.dataKey === 'substack' && input) setSubstackUsername(input.trim());
    }

    if (bundle.link) {
      setConstellationLinks((prev) => ({ ...prev, [platform.id]: bundle.link! }));
      if (platform.id === 'portfolio') {
        setPortfolioUrl(bundle.link.url);
      }
    }
  };

  const handleConstellationImport = async (platform: PlatformDef, input: string) => {
    const bundle = await importConstellationPlatform(platform, input);
    applyConstellationBundle(platform, bundle, input);
    return { identity: bundle.identity };
  };

  const handleConstellationOAuth = async (platform: PlatformDef) => {
    const bundle = await importConstellationOAuth(platform, {
      githubUsername: githubUsernameFromAccount,
    });
    applyConstellationBundle(platform, bundle);
    return { identity: bundle.identity };
  };

  const handleConstellationConnected = (
    platformId: PlatformId,
    result: { identity: ConstellationConnection['identity'] },
    meta: { badgeCorner: BadgeCorner }
  ) => {
    setConstellationConnected((prev) => ({
      ...prev,
      [platformId]: { identity: result.identity, badgeCorner: meta.badgeCorner },
    }));
    setConstellationHasAction(true);
  };

  const handleConstellationDisconnected = (platformId: PlatformId) => {
    delete constellationBundlesRef.current[platformId];
    setConstellationConnected((prev) => {
      const next = { ...prev };
      delete next[platformId];
      return next;
    });
    setConstellationLinks((prev) => {
      const next = { ...prev };
      delete next[platformId];
      return next;
    });

    const dataKeyMap: Partial<
      Record<PlatformId, 'github' | 'linkedin' | 'medium' | 'youtube' | 'substack'>
    > = {
      github: 'github',
      linkedin: 'linkedin',
      medium: 'medium',
      youtube: 'youtube',
      substack: 'substack',
    };
    const dataKey = dataKeyMap[platformId];
    if (dataKey) {
      setImportedData((prev) => {
        const next = { ...prev };
        delete next[dataKey];
        return next;
      });
      updateImportStatus(dataKey, { status: 'idle', message: undefined, itemsImported: undefined });
    }
    if (platformId === 'portfolio') setPortfolioUrl('');
    if (platformId === 'github') setGithubUsername('');
    if (platformId === 'linkedin') setLinkedinProfileInput('');
    if (platformId === 'medium') setMediumUsername('');
    if (platformId === 'youtube') setYoutubeChannel('');
    if (platformId === 'substack') setSubstackUsername('');
  };

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
      const substackData = importedData.substack as Record<string, unknown> | undefined;
      const youtubeData = importedData.youtube as Record<string, unknown> | undefined;

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
        ...((substackData?.links as Array<Record<string, unknown>>) || []),
        ...((youtubeData?.links as Array<Record<string, unknown>>) || []),
      ];

      // Links attached via constellation (portfolio + platforms without rich APIs)
      for (const link of Object.values(constellationLinks)) {
        if (!link?.url) continue;
        allLinks.push({
          url: link.url,
          type: link.type,
          label: link.label,
        });
      }

      // Personal portfolio URL — prefer constellation portfolio, fall back to typed
      const trimmedPortfolio = constellationLinks.portfolio?.url?.trim() || portfolioUrl.trim();
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

      // Custom links added on the platforms step (legacy draft restore)
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

      const blogPosts = [
        ...((mediumData?.blogPosts as Array<Record<string, unknown>>) || []),
        ...((substackData?.blogPosts as Array<Record<string, unknown>>) || []),
      ];
      const youtubeVideos = [
        ...((youtubeData?.youtubeVideos as Array<Record<string, unknown>>) || []),
      ];
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
            youtubeVideos,
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
    constellationHasAction,
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

      <div
        className={currentStep === 'connect' ? ONBOARDING_PAGE_SHELL_WIDE : ONBOARDING_PAGE_SHELL}
      >
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

            {/* ─────────────── STEP 3: CONNECT PROFILES (constellation) ─────────────── */}
            {currentStep === 'connect' && (
              <motion.div
                key="step-connect"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <ConstellationField
                  importPlatform={handleConstellationImport}
                  importOAuth={handleConstellationOAuth}
                  onBeforeOAuthRedirect={saveImportState}
                  oauthReady={hasRestoredPersistedState && currentStep === 'connect'}
                  initialConnected={constellationConnected}
                  onHasActionChange={setConstellationHasAction}
                  onPlatformConnected={handleConstellationConnected}
                  onPlatformDisconnected={handleConstellationDisconnected}
                />
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
