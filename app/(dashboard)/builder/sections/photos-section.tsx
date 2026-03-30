'use client';

import {
  Camera,
  Check,
  Contrast,
  Eye,
  EyeOff,
  Github,
  Globe,
  Link2,
  Linkedin,
  Loader2,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Area, Point } from 'react-easy-crop';
import Cropper from 'react-easy-crop';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { notifyProfileUpdated } from '@/lib/events';
import { cn } from '@/lib/utils';

import type { FullProfile } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface AvatarOption {
  id: string;
  label: string;
  url: string;
  source: string;
  isActive: boolean;
}

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  google: Globe,
  linkedin: Linkedin,
  github: Github,
};

const getSourceIcon = (source: string) => SOURCE_ICONS[source] || Upload;

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.crossOrigin = 'anonymous';
    img.src = url;
  });

interface ImageAdjustments {
  brightness: number; // 50–150, default 100
  contrast: number; // 50–150, default 100
}

const DEFAULT_ADJUSTMENTS: ImageAdjustments = { brightness: 100, contrast: 100 };

/** Full editor state persisted to DB alongside the photo so re-editing
 *  restores sliders/crop exactly where the user left them. */
interface PersistedEditorState {
  brightness: number;
  contrast: number;
  cropPosition: Point;
  cropZoom: number;
  cropRotation: number;
  croppedAreaPixels: Area | null;
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0,
  adjustments: ImageAdjustments = DEFAULT_ADJUSTMENTS
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  // When rotated, react-easy-crop returns pixel coords relative to the
  // bounding box of the rotated image. We need to draw the image rotated
  // first, then extract the crop region.
  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));

  // Bounding box of the rotated image
  const rotW = image.width * cos + image.height * sin;
  const rotH = image.width * sin + image.height * cos;

  // Step 1: draw the full rotated image onto a temporary canvas
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) throw new Error('No 2d context');

  rotCtx.translate(rotW / 2, rotH / 2);
  rotCtx.rotate(radians);
  rotCtx.drawImage(image, -image.width / 2, -image.height / 2);

  // Step 2: extract the cropped region from the rotated canvas
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%)`;

  ctx.drawImage(
    rotCanvas,
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

/** Check if a URL points to a locally-stored (editable) photo vs an external link */
const isEditablePhoto = (url: string): boolean =>
  url.startsWith('/api/photos/') || url.startsWith('data:');

/** Extract ProfilePhoto DB ID from a served photo URL like `/api/photos/{id}?v=...` */
const getPhotoIdFromUrl = (url: string): string | null => {
  const match = url.match(/^\/api\/photos\/([^/?]+)/);
  return match ? match[1] : null;
};

// ─── IndexedDB persistence for photo editor state ────────────────────────────
// Stores the original (pre-edit) image alongside the editor slider/crop state
// per photo ID.  IndexedDB is used instead of localStorage because original
// images can be several MB as base64 data URLs, exceeding localStorage's ~5 MB
// limit.

const IDB_NAME = 'follio-photo-editor';
const IDB_STORE = 'state';
const IDB_VERSION = 1;

interface StoredPhotoState {
  originalDataUrl: string;
  editorState: PersistedEditorState;
}

function openPhotoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredPhotoState(photoId: string): Promise<StoredPhotoState | null> {
  try {
    const idb = await openPhotoDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(photoId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function storePhotoState(photoId: string, state: StoredPhotoState): Promise<void> {
  try {
    const idb = await openPhotoDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(state, photoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // non-critical — editor state will fall back to the API on re-edit
  }
}

async function removeStoredPhotoState(photoId: string): Promise<void> {
  try {
    const idb = await openPhotoDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(photoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

// ─── PhotosSection ────────────────────────────────────────────────────────────

interface PhotosSectionProps {
  profile: FullProfile;
  onUpdateAction: (data: Partial<FullProfile>) => void;
  /** For changes that save directly to the API and should update the preview immediately. */
  onInlineUpdate?: (data: Partial<FullProfile>) => void;
  embedded?: boolean;
}

export function PhotosSection({
  profile,
  onUpdateAction,
  onInlineUpdate,
  embedded,
}: PhotosSectionProps) {
  const [availableAvatars, setAvailableAvatars] = useState<AvatarOption[]>([]);
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(false);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState<Point>({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [cropRotation, setCropRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [isLoadingCropper, setIsLoadingCropper] = useState(false);
  const hasAutoLoadedRef = useRef(false);

  const resumeShowPhoto = profile.resumeShowPhoto ?? false;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Apply an update through the inline path (persisted immediately) or the
   *  draft path, depending on what the parent provided. */
  const applyUpdate = useCallback(
    (update: Partial<FullProfile>) => {
      if (onInlineUpdate) {
        onInlineUpdate(update);
      } else {
        onUpdateAction(update);
      }
    },
    [onInlineUpdate, onUpdateAction]
  );

  /** Fetch all available avatars from the API and update local state. */
  const refreshAvatars = useCallback(async () => {
    try {
      const response = await fetch('/api/profile/available-avatars');
      if (response.ok) {
        const data = await response.json();
        setAvailableAvatars(data.avatars || []);
      }
    } catch (err) {
      console.error('Failed to refresh available avatars:', err);
    }
  }, []);

  /** Persist the avatar URL change to the profile via the API. */
  const persistAvatarUrl = useCallback(async (url: string) => {
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: url }),
      });
      notifyProfileUpdated();
    } catch (error) {
      console.error('Failed to persist avatar URL:', error);
    }
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleResumeShowPhotoToggle = async () => {
    const newValue = !resumeShowPhoto;
    const update = { resumeShowPhoto: newValue } as Partial<FullProfile>;
    applyUpdate(update);

    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeShowPhoto: newValue }),
      });
      notifyProfileUpdated();
    } catch (error) {
      console.error('Failed to update resume photo visibility:', error);
      applyUpdate({ resumeShowPhoto: !newValue } as Partial<FullProfile>);
    }
  };

  // Lazy-load avatars when the dialog opens (not on mount) for faster initial render
  useEffect(() => {
    if (dialogOpen && !hasFetchedOnce) {
      setIsLoadingAvatars(true);
      refreshAvatars().finally(() => {
        setHasFetchedOnce(true);
        setIsLoadingAvatars(false);
      });
    }
  }, [dialogOpen, hasFetchedOnce, refreshAvatars]);

  // Auto-load the current editable photo into the cropper when the dialog opens
  useEffect(() => {
    if (
      dialogOpen &&
      !hasAutoLoadedRef.current &&
      profile.avatarUrl &&
      isEditablePhoto(profile.avatarUrl)
    ) {
      hasAutoLoadedRef.current = true;
      const photoId = getPhotoIdFromUrl(profile.avatarUrl);
      openCropper(profile.avatarUrl, photoId);
    }
    if (!dialogOpen) {
      hasAutoLoadedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  useEffect(() => {
    setAvailableAvatars((prev) =>
      prev.map((a) => {
        // Handle cache-busted URLs (e.g., /api/photos/id?v=123)
        const normalizedAvatar = profile.avatarUrl?.replace(/\?v=\d+$/, '') ?? '';
        const isActive = a.url === profile.avatarUrl || a.url === normalizedAvatar;
        return { ...a, isActive };
      })
    );
  }, [profile.avatarUrl]);

  const savePhoto = async (
    url: string,
    category: 'PROFILE' | 'GALLERY',
    originalUrl?: string | null,
    editorState?: PersistedEditorState | null
  ): Promise<string | null> => {
    try {
      const body: Record<string, unknown> = { url, category };
      if (originalUrl) body.originalUrl = originalUrl;
      if (editorState) body.adjustments = editorState;

      const res = await fetch('/api/profile/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        return data.photo?.id ?? null;
      }
      return null;
    } catch (err) {
      console.error('Failed to save photo:', err);
      return null;
    }
  };

  /** Upload/crop flow: save or update the photo in DB, set it as the active
   *  avatar, persist to the API, and refresh the available-avatars list.
   *  When `photoIdToUpdate` is provided, the existing record is PATCHed
   *  in-place instead of creating a duplicate.
   *  `originalDataUrl` is the raw unmodified image and `editorState` holds
   *  the adjustment settings so they can be restored on re-edit. */
  const handlePhotoChange = async (
    url: string,
    photoIdToUpdate?: string | null,
    originalDataUrl?: string | null,
    editorState?: PersistedEditorState | null
  ) => {
    applyUpdate({ avatarUrl: url });

    let finalUrl = url;
    let resolvedPhotoId: string | null = photoIdToUpdate ?? null;

    if (photoIdToUpdate) {
      // Update existing photo record in-place
      try {
        const patchBody: Record<string, unknown> = { url };
        if (originalDataUrl) patchBody.originalUrl = originalDataUrl;
        if (editorState) patchBody.adjustments = editorState;

        const res = await fetch(`/api/profile/photos/${encodeURIComponent(photoIdToUpdate)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        });
        if (res.ok) {
          // Cache-bust so the browser fetches the updated image
          finalUrl = `/api/photos/${photoIdToUpdate}?v=${Date.now()}`;
        } else {
          const newId = await savePhoto(url, 'PROFILE', originalDataUrl, editorState);
          if (newId && url.startsWith('data:')) {
            finalUrl = `/api/photos/${newId}`;
            resolvedPhotoId = newId;
          }
        }
      } catch {
        const newId = await savePhoto(url, 'PROFILE', originalDataUrl, editorState);
        if (newId && url.startsWith('data:')) {
          finalUrl = `/api/photos/${newId}`;
          resolvedPhotoId = newId;
        }
      }
    } else {
      const photoId = await savePhoto(url, 'PROFILE', originalDataUrl, editorState);
      if (photoId && url.startsWith('data:')) {
        finalUrl = `/api/photos/${photoId}`;
        resolvedPhotoId = photoId;
        setEditingPhotoId(photoId);
      }
    }

    // Persist original + editor state to IndexedDB so re-editing restores
    // sliders and crop exactly where the user left them.
    if (resolvedPhotoId && originalDataUrl && editorState) {
      await storePhotoState(resolvedPhotoId, {
        originalDataUrl,
        editorState,
      });
    }

    applyUpdate({ avatarUrl: finalUrl });
    await persistAvatarUrl(finalUrl);
    await refreshAvatars();
  };

  /** Clear the profile avatar (unset, does not delete the photo record). */
  const handlePhotoRemove = async () => {
    setIsRemoving(true);
    applyUpdate({ avatarUrl: '' });
    await persistAvatarUrl('');
    await refreshAvatars();
    setIsRemoving(false);
  };

  /** Select an avatar from the available list (social or uploaded). */
  const handleSelectSourceAvatar = async (avatar: AvatarOption) => {
    // Allow re-clicking active uploaded photos to load into cropper
    if (avatar.isActive && avatar.source !== 'uploaded') return;

    // Optimistic local update — mark the new avatar active immediately
    setAvailableAvatars((prev) => prev.map((a) => ({ ...a, isActive: a.url === avatar.url })));
    applyUpdate({ avatarUrl: avatar.url });
    await persistAvatarUrl(avatar.url);
    refreshAvatars();

    if (avatar.source === 'uploaded') {
      // Load uploaded photo into the cropper for optional editing
      const photoId = avatar.id.replace('uploaded-', '');
      openCropper(avatar.url, photoId);
    } else {
      // Link-based avatar — clear any active cropper
      setPreviewUrl(null);
      setEditingPhotoId(null);
      setCroppedAreaPixels(null);
    }
  };

  /** Delete an uploaded photo. Clears the avatar first if the photo is active
   *  to avoid a 409 "photo in use" rejection from the API. */
  const handleDeletePhoto = async (avatar: AvatarOption) => {
    const photoId = avatar.id.replace('uploaded-', '');
    setDeleteError('');
    setDeletingId(avatar.id);

    try {
      // If this is the active avatar, clear it first so the DELETE won't 409
      if (avatar.isActive) {
        applyUpdate({ avatarUrl: '' });
        await persistAvatarUrl('');
      }

      const res = await fetch(`/api/profile/photos/${encodeURIComponent(photoId)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Failed to delete photo' }));
        setDeleteError(data.message || 'Failed to delete photo');
        return;
      }

      // Clean up cached editor state
      await removeStoredPhotoState(photoId);

      // If we were editing this photo, clear the cropper
      if (editingPhotoId === photoId) {
        setPreviewUrl(null);
        setEditingPhotoId(null);
        setCroppedAreaPixels(null);
        setAdjustments(DEFAULT_ADJUSTMENTS);
      }

      await refreshAvatars();
    } catch {
      setDeleteError('Failed to delete photo. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUrlError('Please select an image file');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setUrlError('Image must be under 40 MB');
      return;
    }
    setUrlError('');
    // New upload — clear editingPhotoId so Apply creates a new record
    setEditingPhotoId(null);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
      setCroppedAreaPixels(null);
      setCropPosition({ x: 0, y: 0 });
      setCropZoom(1);
      setCropRotation(0);
      setAdjustments(DEFAULT_ADJUSTMENTS);
    };
    reader.onerror = () => setUrlError('Failed to read image');
    reader.readAsDataURL(file);
  }, []);

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) {
      setUrlError('Please enter a URL');
      return;
    }
    try {
      new URL(urlInput);
    } catch {
      setUrlError('Please enter a valid URL');
      return;
    }
    setIsLoading(true);
    setUrlError('');
    // External URLs are saved directly — CORS prevents canvas-based editing
    const img = new window.Image();
    img.onload = async () => {
      try {
        setEditingPhotoId(null);
        setPreviewUrl(null);
        await handlePhotoChange(urlInput);
        setUrlInput('');
        resetAddMode();
      } catch {
        setUrlError('Failed to save image');
      } finally {
        setIsLoading(false);
      }
    };
    img.onerror = () => {
      setUrlError('Could not load image from this URL');
      setIsLoading(false);
    };
    img.src = urlInput;
  };

  // ── Derived state ───────────────────────────────────────────────────────────

  const currentPhotoUrl = profile.avatarUrl;
  const hasPhoto = !!currentPhotoUrl;
  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;

  // All available avatars for the dialog picker
  const socialAvatars = availableAvatars.filter((a) => a.source !== 'uploaded');
  const uploadedAvatars = availableAvatars.filter((a) => a.source === 'uploaded');
  const allPickableAvatars = [...socialAvatars, ...uploadedAvatars];

  /** Which add-photo mode is active inside the dialog */
  type AddMode = 'none' | 'upload' | 'url';
  const [addMode, setAddMode] = useState<AddMode>('none');

  const resetAddMode = () => setAddMode('none');

  // ── Render ──────────────────────────────────────────────────────────────────

  /** Load a photo into the cropper for editing.
   *  Prefers localStorage (original image + editor state) for instant
   *  restoration.  Falls back to the DB/API for photos edited before
   *  localStorage persistence was added. */
  const openCropper = useCallback(
    async (url: string, photoId?: string | null) => {
      setIsLoadingCropper(true);
      if (photoId !== undefined) setEditingPhotoId(photoId);
      try {
        // ── 1. Check IndexedDB for cached original + editor state ──
        const local = photoId ? await getStoredPhotoState(photoId) : null;

        if (local) {
          // We have the true original image + last-used editor state.
          const restored = local.editorState;
          setPreviewUrl(local.originalDataUrl);
          setCropPosition(restored.cropPosition ?? { x: 0, y: 0 });
          setCropZoom(restored.cropZoom ?? 1);
          setCropRotation(restored.cropRotation ?? 0);
          setCroppedAreaPixels(restored.croppedAreaPixels ?? null);
          setAdjustments({
            brightness: restored.brightness ?? 100,
            contrast: restored.contrast ?? 100,
          });
          setIsLoadingCropper(false);
          return;
        }

        // ── 2. Fallback: fetch from API (original image + metadata) ──
        const imageUrl = photoId ? `/api/photos/${photoId}?original=true` : url;
        const [imageRes, metaRes] = await Promise.all([
          fetch(imageUrl),
          photoId
            ? fetch(`/api/profile/photos/${encodeURIComponent(photoId)}`).catch(() => null)
            : Promise.resolve(null),
        ]);

        // Restore persisted editor state if available
        let restored: PersistedEditorState | null = null;
        if (metaRes?.ok) {
          const meta = await metaRes.json();
          if (meta.adjustments && typeof meta.adjustments === 'object') {
            restored = meta.adjustments as PersistedEditorState;
          }
        }

        const blob = await imageRes.blob();
        const reader = new FileReader();
        reader.onload = () => {
          setPreviewUrl(reader.result as string);
          if (restored) {
            setCropPosition(restored.cropPosition ?? { x: 0, y: 0 });
            setCropZoom(restored.cropZoom ?? 1);
            setCropRotation(restored.cropRotation ?? 0);
            setCroppedAreaPixels(restored.croppedAreaPixels ?? null);
            setAdjustments({
              brightness: restored.brightness ?? 100,
              contrast: restored.contrast ?? 100,
            });
          } else {
            setCropPosition({ x: 0, y: 0 });
            setCropZoom(1);
            setCropRotation(0);
            setCroppedAreaPixels(null);
            setAdjustments(DEFAULT_ADJUSTMENTS);
          }
          setIsLoadingCropper(false);
        };
        reader.onerror = () => {
          setUrlError('Could not load photo for editing');
          setIsLoadingCropper(false);
        };
        reader.readAsDataURL(blob);
      } catch {
        setUrlError('Could not load photo for editing');
        setIsLoadingCropper(false);
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const resetDialog = () => {
    setUrlInput('');
    setUrlError('');
    setPreviewUrl(null);
    setCropPosition({ x: 0, y: 0 });
    setCropZoom(1);
    setCropRotation(0);
    setCroppedAreaPixels(null);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setIsLoading(false);
    setDeleteError('');
    setDeletingId(null);
    setEditingPhotoId(null);
    setIsLoadingCropper(false);
    resetAddMode();
  };

  // ── Shared photo dialog (used by both embedded & card) ──────────────────

  const photoDialog = (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetDialog();
      }}
    >
      <DialogTrigger asChild>
        <button
          className="group relative cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Change profile photo"
        >
          <Avatar className="h-[72px] w-[72px] border-2 border-border shadow-sm transition-shadow group-hover:shadow-md">
            <AvatarImage
              src={currentPhotoUrl || undefined}
              alt="Profile photo"
              className="object-cover"
            />
            <AvatarFallback className="bg-muted text-lg font-medium">
              {initials || <User className="h-7 w-7 text-muted-foreground" />}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto overflow-x-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Profile Photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col">
          {/* ── TOP SECTION: Inline cropper / Link preview / Empty state / Loading ── */}
          {isLoadingCropper ? (
            <div className="flex flex-col items-center bg-muted/30 px-6 py-10">
              <div className="h-40 w-40 animate-pulse rounded-lg bg-muted" />
              <p className="mt-3 text-xs text-muted-foreground">Loading photo editor…</p>
            </div>
          ) : previewUrl ? (
            <div className="flex flex-col">
              {/* Header bar */}
              <div className="flex items-center justify-between border-b px-5 py-3">
                <p className="text-sm font-semibold">
                  {editingPhotoId ? 'Edit Photo' : 'Crop New Photo'}
                </p>
                <button
                  onClick={() => {
                    setCropPosition({ x: 0, y: 0 });
                    setCropZoom(1);
                    setCropRotation(0);
                    setAdjustments(DEFAULT_ADJUSTMENTS);
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  title="Reset all"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>

              {/* Cropper + controls side by side on desktop, stacked on mobile */}
              <div className="flex flex-col items-stretch gap-0 sm:flex-row">
                {/* Crop area */}
                <div
                  className="relative w-full overflow-hidden bg-black/5 sm:flex-1"
                  style={{
                    aspectRatio: '1 / 1',
                    maxHeight: '340px',
                    filter: `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%)`,
                  }}
                >
                  <Cropper
                    image={previewUrl}
                    crop={cropPosition}
                    zoom={cropZoom}
                    rotation={cropRotation}
                    aspect={1}
                    onCropChange={setCropPosition}
                    onCropComplete={(_: Area, croppedPx: Area) => setCroppedAreaPixels(croppedPx)}
                    onZoomChange={setCropZoom}
                    cropShape="rect"
                    showGrid={true}
                    style={{
                      containerStyle: { borderRadius: 0 },
                      cropAreaStyle: { border: '2px solid hsl(var(--primary))' },
                    }}
                  />
                </div>

                {/* Controls sidebar */}
                <div className="flex flex-col justify-between gap-4 border-t bg-card/80 p-4 sm:w-48 sm:border-l sm:border-t-0">
                  <div className="space-y-4">
                    {/* Zoom */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Zoom</span>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(cropZoom * 100)}%
                        </span>
                      </div>
                      <Slider value={cropZoom} min={1} max={3} step={0.01} onChange={setCropZoom} />
                    </div>

                    {/* Tilt correction */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Tilt</span>
                        <span className="text-xs text-muted-foreground">{cropRotation}°</span>
                      </div>
                      <Slider
                        value={cropRotation}
                        min={-45}
                        max={45}
                        step={1}
                        onChange={setCropRotation}
                      />
                    </div>

                    {/* Brightness */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          <Sun className="mr-1 inline h-3 w-3" />
                          Brightness
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {adjustments.brightness}%
                        </span>
                      </div>
                      <Slider
                        value={adjustments.brightness}
                        min={50}
                        max={150}
                        step={1}
                        onChange={(v) => setAdjustments((prev) => ({ ...prev, brightness: v }))}
                      />
                    </div>

                    {/* Contrast */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          <Contrast className="mr-1 inline h-3 w-3" />
                          Contrast
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {adjustments.contrast}%
                        </span>
                      </div>
                      <Slider
                        value={adjustments.contrast}
                        min={50}
                        max={150}
                        step={1}
                        onChange={(v) => setAdjustments((prev) => ({ ...prev, contrast: v }))}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={async () => {
                        if (previewUrl && croppedAreaPixels) {
                          setIsLoading(true);
                          try {
                            const cropped = await getCroppedImg(
                              previewUrl,
                              croppedAreaPixels,
                              cropRotation,
                              adjustments
                            );
                            // Persist the raw original + editor state alongside
                            // the processed image so re-editing restores exactly.
                            const editorState: PersistedEditorState = {
                              brightness: adjustments.brightness,
                              contrast: adjustments.contrast,
                              cropPosition,
                              cropZoom,
                              cropRotation,
                              croppedAreaPixels,
                            };
                            await handlePhotoChange(
                              cropped,
                              editingPhotoId,
                              previewUrl,
                              editorState
                            );
                            setDialogOpen(false);
                            resetDialog();
                          } catch {
                            setUrlError('Failed to process image');
                          } finally {
                            setIsLoading(false);
                          }
                        }
                      }}
                      disabled={isLoading || !croppedAreaPixels}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        'Apply'
                      )}
                    </Button>
                    {!editingPhotoId && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setPreviewUrl(null);
                          setCroppedAreaPixels(null);
                          setAdjustments(DEFAULT_ADJUSTMENTS);
                          setCropPosition({ x: 0, y: 0 });
                          setCropZoom(1);
                          setCropRotation(0);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {urlError && (
                <p className="border-t px-5 py-3 text-center text-sm text-destructive">
                  {urlError}
                </p>
              )}
            </div>
          ) : hasPhoto && !isEditablePhoto(currentPhotoUrl) ? (
            /* ── Link-based photo preview ── */
            <div className="flex flex-col items-center bg-muted/30 px-6 py-6">
              <Avatar className="h-28 w-28 border-4 border-background shadow-lg">
                <AvatarImage
                  src={currentPhotoUrl || undefined}
                  alt="Profile photo"
                  className="object-cover"
                />
                <AvatarFallback className="bg-muted text-3xl font-medium">
                  {initials || <User className="h-10 w-10 text-muted-foreground" />}
                </AvatarFallback>
              </Avatar>
              <div className="mt-3 flex items-center gap-1.5 rounded-md bg-muted/80 px-3 py-1.5">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Linked from external source — upload to enable editing
                </p>
              </div>
              <button
                type="button"
                onClick={handlePhotoRemove}
                disabled={isRemoving}
                className="mt-2.5 flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
              >
                {isRemoving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Remove Photo
              </button>
            </div>
          ) : !hasPhoto ? (
            /* ── No photo state ── */
            <div className="flex flex-col items-center bg-muted/30 px-6 py-8">
              <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-background bg-muted shadow-lg">
                <User className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium text-muted-foreground">No Photo Selected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose a photo below or upload a new one
              </p>
            </div>
          ) : null}

          {/* ── Photo picker row (always visible) ── */}
          <div className="border-t px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Choose a Photo</p>
              {hasPhoto && !previewUrl && isEditablePhoto(currentPhotoUrl) && (
                <button
                  type="button"
                  onClick={handlePhotoRemove}
                  disabled={isRemoving}
                  className="flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  {isRemoving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Remove
                </button>
              )}
            </div>

            {isLoadingAvatars ? (
              <div className="flex flex-wrap items-start gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
                    <div className="mt-1.5 h-2.5 w-10 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-start gap-3">
                {allPickableAvatars.map((avatar) => {
                  const Icon = getSourceIcon(avatar.source);
                  const isUploaded = avatar.source === 'uploaded';
                  return (
                    <div key={avatar.id} className="group/photo relative">
                      <button
                        onClick={() => handleSelectSourceAvatar(avatar)}
                        className={cn(
                          'relative h-16 w-16 overflow-hidden rounded-full border-2 transition-all',
                          avatar.isActive
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/40'
                        )}
                        title={
                          avatar.isActive
                            ? isUploaded
                              ? `${avatar.label} (current — click to edit)`
                              : `${avatar.label} (current)`
                            : `Use ${avatar.label}`
                        }
                      >
                        <Avatar className="h-full w-full rounded-none">
                          <AvatarImage
                            src={avatar.url}
                            alt={avatar.label}
                            className="object-cover"
                          />
                          <AvatarFallback className="rounded-none">
                            <Icon className="h-5 w-5 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>
                        {avatar.isActive && (
                          <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </div>
                          </div>
                        )}
                      </button>
                      <p className="mt-1 max-w-16 truncate text-center text-[10px] text-muted-foreground">
                        {avatar.source === 'uploaded'
                          ? 'Upload'
                          : avatar.source.charAt(0).toUpperCase() + avatar.source.slice(1)}
                      </p>
                      {isUploaded && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePhoto(avatar);
                          }}
                          disabled={deletingId === avatar.id}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-sm transition-opacity group-hover/photo:opacity-100"
                          title="Delete photo"
                        >
                          {deletingId === avatar.id ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-2.5 w-2.5" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add photo button */}
                <div className="flex flex-col items-center">
                  <button
                    onClick={() => setAddMode(addMode === 'none' ? 'upload' : 'none')}
                    className={cn(
                      'flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed transition-colors',
                      addMode !== 'none'
                        ? 'border-primary bg-primary/5'
                        : 'border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/50'
                    )}
                    title="Add a new photo"
                  >
                    <Plus className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <p className="mt-1 text-center text-[10px] text-muted-foreground">Add</p>
                </div>
              </div>
            )}

            {deleteError && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </div>

          {/* ── Add photo section (upload / URL) ── */}
          {addMode !== 'none' && (
            <div className="border-t px-6 pb-5 pt-4">
              <div className="mb-3 flex gap-1.5">
                <Button
                  variant={addMode === 'upload' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 gap-1.5 px-3 text-xs"
                  onClick={() => setAddMode('upload')}
                >
                  <Upload className="h-3 w-3" />
                  Upload
                </Button>
                <Button
                  variant={addMode === 'url' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 gap-1.5 px-3 text-xs"
                  onClick={() => setAddMode('url')}
                >
                  <Link2 className="h-3 w-3" />
                  URL
                </Button>
              </div>

              {addMode === 'upload' ? (
                <div
                  className={cn(
                    'cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30'
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileSelect(file);
                  }}
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    className="hidden"
                  />
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Drop an image or click to browse</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    PNG, JPG, GIF up to 40 MB
                  </p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type="url"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      setUrlError('');
                    }}
                    placeholder="https://example.com/photo.jpg"
                    className="h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={handleUrlSubmit}
                    disabled={!urlInput.trim() || isLoading}
                  >
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                  </Button>
                </div>
              )}

              {urlError && <p className="mt-2 text-center text-sm text-destructive">{urlError}</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── Compact trigger row (shared layout for avatar + label) ──────────────

  const photoContent = (
    <div className="flex items-center gap-5">
      <div className="shrink-0">{photoDialog}</div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Profile Photo</p>
            <p className="text-xs text-muted-foreground">
              {hasPhoto ? 'Click to change' : 'Click to add a photo'}
            </p>
          </div>
          {hasPhoto && (
            <button
              type="button"
              onClick={handleResumeShowPhotoToggle}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent',
                resumeShowPhoto ? 'text-primary' : 'text-muted-foreground'
              )}
              title={
                resumeShowPhoto
                  ? 'Photo visible on resume — click to hide'
                  : 'Photo hidden from resume — click to show'
              }
            >
              {resumeShowPhoto ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ── Embedded (sidebar) — just the trigger row ──────────────────────────

  if (embedded) {
    return photoContent;
  }

  // ── Full card (section editor page) — trigger row inside a Card ────────

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
        </CardHeader>
        <CardContent>{photoContent}</CardContent>
      </Card>
    </div>
  );
}
