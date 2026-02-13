'use client';

import type { ProfilePhoto } from '@prisma/client';
import { Camera, ImagePlus, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import type { FullProfile } from '@/types';

// ─── Profile Photo Upload (moved from basic-info) ───────────────────────────

interface AvatarOption {
  id: string;
  label: string;
  url: string;
  source: string;
  isActive: boolean;
}

/** Compress image to 512×512 JPEG for Clerk's 5 MB limit */
const compressImage = (file: File, maxSize = 512): Promise<string> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = maxSize;
      canvas.height = maxSize;
      const scale = Math.max(maxSize / img.width, maxSize / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx?.drawImage(img, (maxSize - w) / 2, (maxSize - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });

/** Compress gallery image — keep larger resolution */
const compressGalleryImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const max = 1920;
      let w = img.width;
      let h = img.height;
      if (w > max || h > max) {
        const ratio = Math.min(max / w, max / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      ctx?.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });

const getSourceIcon = (source: string) => {
  switch (source) {
    case 'google':
      return '🌐';
    case 'linkedin':
      return '💼';
    case 'github':
      return '🐙';
    default:
      return '📷';
  }
};

// ─── Photos Section ──────────────────────────────────────────────────────────

interface PhotosSectionProps {
  profile: FullProfile;
  onUpdateAction: (data: Partial<FullProfile>) => void;
}

export function PhotosSection({ profile, onUpdateAction }: PhotosSectionProps) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>(profile.photos || []);
  const galleryPhotos = photos.filter((p) => p.category === 'GALLERY');

  // ── Profile Photo state ──────────────────────────────────────────────────
  const [availableAvatars, setAvailableAvatars] = useState<AvatarOption[]>([]);
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(true);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const profileFileRef = useRef<HTMLInputElement>(null);

  // ── Gallery Photo state ──────────────────────────────────────────────────
  const [galleryDialogOpen, setGalleryDialogOpen] = useState(false);
  const [galleryUrlInput, setGalleryUrlInput] = useState('');
  const [galleryUrlError, setGalleryUrlError] = useState('');
  const [galleryPreviewUrl, setGalleryPreviewUrl] = useState<string | null>(null);
  const [galleryIsDragging, setGalleryIsDragging] = useState(false);
  const [galleryIsLoading, setGalleryIsLoading] = useState(false);
  const [galleryCaption, setGalleryCaption] = useState('');
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch available avatars from connected sources
  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const response = await fetch('/api/profile/available-avatars');
        if (response.ok) {
          const data = await response.json();
          setAvailableAvatars(data.avatars || []);
        }
      } catch (err) {
        console.error('Failed to fetch available avatars:', err);
      } finally {
        setIsLoadingAvatars(false);
      }
    };
    fetchAvatars();
  }, []);

  // Keep isActive in sync with current profile avatarUrl
  useEffect(() => {
    setAvailableAvatars((prev) =>
      prev.map((a) => ({ ...a, isActive: a.url === profile.avatarUrl }))
    );
  }, [profile.avatarUrl]);

  // Helper: save a photo via API and update local state
  const savePhoto = async (
    url: string,
    category: 'PROFILE' | 'GALLERY',
    caption?: string
  ): Promise<ProfilePhoto | null> => {
    try {
      const res = await fetch('/api/profile/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, category, caption }),
      });
      if (res.ok) {
        const data = await res.json();
        const newPhoto = data.photo as ProfilePhoto;
        setPhotos((prev) => [...prev, newPhoto]);
        return newPhoto;
      }
    } catch (err) {
      console.error('Failed to save photo:', err);
    }
    return null;
  };

  const deletePhoto = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/profile/photos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete photo:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Profile Photo handlers ──────────────────────────────────────────────

  const handleProfilePhotoChange = (url: string) => {
    onUpdateAction({ avatarUrl: url });
    // Also save as a PROFILE photo record
    savePhoto(url, 'PROFILE');
  };

  const handleProfilePhotoRemove = () => {
    onUpdateAction({ avatarUrl: '' });
  };

  const handleSelectSourceAvatar = (avatar: AvatarOption) => {
    if (avatar.isActive) return;
    onUpdateAction({ avatarUrl: avatar.url });
  };

  const handleProfileFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUrlError('Please select an image file');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setUrlError('Image must be less than 40 MB');
      return;
    }
    setIsLoading(true);
    setUrlError('');
    try {
      const compressed = await compressImage(file);
      setPreviewUrl(compressed);
    } catch {
      setUrlError('Failed to process image');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleProfileUrlSubmit = async () => {
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
    const img = new Image();
    img.onload = () => {
      handleProfilePhotoChange(urlInput);
      setProfileDialogOpen(false);
      setUrlInput('');
      setIsLoading(false);
    };
    img.onerror = () => {
      setUrlError('Could not load image from this URL');
      setIsLoading(false);
    };
    img.src = urlInput;
  };

  const resetProfileDialog = () => {
    setUrlInput('');
    setUrlError('');
    setPreviewUrl(null);
    setIsLoading(false);
  };

  // ── Gallery Photo handlers ──────────────────────────────────────────────

  const handleGalleryFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setGalleryUrlError('Please select an image file');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setGalleryUrlError('Image must be less than 40 MB');
      return;
    }
    setGalleryIsLoading(true);
    setGalleryUrlError('');
    try {
      const compressed = await compressGalleryImage(file);
      setGalleryPreviewUrl(compressed);
    } catch {
      setGalleryUrlError('Failed to process image');
    } finally {
      setGalleryIsLoading(false);
    }
  }, []);

  const handleGalleryUrlSubmit = async () => {
    if (!galleryUrlInput.trim()) {
      setGalleryUrlError('Please enter a URL');
      return;
    }
    try {
      new URL(galleryUrlInput);
    } catch {
      setGalleryUrlError('Please enter a valid URL');
      return;
    }
    setGalleryIsLoading(true);
    setGalleryUrlError('');
    const img = new Image();
    img.onload = async () => {
      await savePhoto(galleryUrlInput, 'GALLERY', galleryCaption || undefined);
      setGalleryDialogOpen(false);
      setGalleryUrlInput('');
      setGalleryCaption('');
      setGalleryIsLoading(false);
    };
    img.onerror = () => {
      setGalleryUrlError('Could not load image from this URL');
      setGalleryIsLoading(false);
    };
    img.src = galleryUrlInput;
  };

  const handleGalleryConfirmUpload = async () => {
    if (galleryPreviewUrl) {
      setGalleryIsLoading(true);
      await savePhoto(galleryPreviewUrl, 'GALLERY', galleryCaption || undefined);
      setGalleryDialogOpen(false);
      setGalleryPreviewUrl(null);
      setGalleryCaption('');
      setGalleryIsLoading(false);
    }
  };

  const resetGalleryDialog = () => {
    setGalleryUrlInput('');
    setGalleryUrlError('');
    setGalleryPreviewUrl(null);
    setGalleryCaption('');
    setGalleryIsLoading(false);
  };

  const currentPhotoUrl = profile.avatarUrl;
  const hasPhoto = !!currentPhotoUrl;
  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;
  const hasSourceAvatars = availableAvatars.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Profile Photo Card ── */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
          <CardDescription>
            Your main profile picture, shown across your portfolio and resume views.
            {hasSourceAvatars
              ? ' You can also pick from photos imported from your connected accounts.'
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            {/* Clickable avatar */}
            <div className="group relative shrink-0">
              <Avatar className="h-24 w-24 border-2 border-border shadow-sm">
                <AvatarImage src={currentPhotoUrl || undefined} alt="Profile photo" />
                <AvatarFallback className="bg-muted text-2xl font-medium">
                  {initials || <Camera className="h-8 w-8 text-muted-foreground" />}
                </AvatarFallback>
              </Avatar>

              <Dialog
                open={profileDialogOpen}
                onOpenChange={(open) => {
                  setProfileDialogOpen(open);
                  if (!open) resetProfileDialog();
                }}
              >
                <DialogTrigger asChild>
                  <button
                    className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Change profile photo"
                  >
                    <Camera className="h-6 w-6 text-white" />
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Profile Photo</DialogTitle>
                    <DialogDescription>
                      {hasSourceAvatars
                        ? 'Choose from your accounts, upload a new photo, or paste a URL.'
                        : 'Upload a photo or paste an image URL.'}
                    </DialogDescription>
                  </DialogHeader>

                  <Tabs defaultValue={hasSourceAvatars ? 'sources' : 'upload'} className="mt-4">
                    <TabsList
                      className={cn(
                        'grid w-full',
                        hasSourceAvatars ? 'grid-cols-3' : 'grid-cols-2'
                      )}
                    >
                      {hasSourceAvatars && (
                        <TabsTrigger value="sources" className="gap-2">
                          Sources
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="upload" className="gap-2">
                        <Upload className="h-4 w-4" />
                        Upload
                      </TabsTrigger>
                      <TabsTrigger value="url" className="gap-2">
                        URL
                      </TabsTrigger>
                    </TabsList>

                    {/* Sources Tab */}
                    {hasSourceAvatars && (
                      <TabsContent value="sources" className="space-y-3 pt-1">
                        <div className="space-y-2">
                          {availableAvatars.map((avatar) => (
                            <button
                              key={avatar.id}
                              onClick={() => {
                                handleSelectSourceAvatar(avatar);
                                setProfileDialogOpen(false);
                              }}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                                avatar.isActive
                                  ? 'border-primary/50 bg-primary/5'
                                  : 'border-transparent bg-muted/40 hover:bg-muted'
                              )}
                            >
                              <Avatar className="h-10 w-10 shrink-0 border border-border">
                                <AvatarImage src={avatar.url} alt={avatar.label} />
                                <AvatarFallback className="text-xs">
                                  {getSourceIcon(avatar.source)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="flex-1 truncate text-sm font-medium">
                                {avatar.label}
                              </span>
                              {avatar.isActive && (
                                <span className="text-xs text-primary">Current</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </TabsContent>
                    )}

                    {/* Upload Tab */}
                    <TabsContent value="upload" className="space-y-4">
                      {previewUrl ? (
                        <div className="space-y-4">
                          <div className="flex justify-center">
                            <div className="relative">
                              <Avatar className="h-32 w-32 border-2 border-border shadow-sm">
                                <AvatarImage src={previewUrl} alt="Preview" />
                                <AvatarFallback>{initials}</AvatarFallback>
                              </Avatar>
                              <button
                                onClick={() => setPreviewUrl(null)}
                                className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm"
                                aria-label="Remove preview"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => setPreviewUrl(null)}
                            >
                              Change
                            </Button>
                            <Button
                              className="flex-1"
                              onClick={() => {
                                if (previewUrl) {
                                  handleProfilePhotoChange(previewUrl);
                                  setProfileDialogOpen(false);
                                  setPreviewUrl(null);
                                }
                              }}
                              disabled={isLoading}
                            >
                              Use Photo
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            'cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                            isDragging
                              ? 'border-primary bg-primary/5'
                              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
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
                            if (file) handleProfileFileSelect(file);
                          }}
                          onClick={() => profileFileRef.current?.click()}
                        >
                          <input
                            ref={profileFileRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleProfileFileSelect(file);
                            }}
                            className="hidden"
                          />
                          <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                          <p className="text-sm font-medium">Drop an image or click to browse</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            PNG, JPG, GIF up to 40 MB
                          </p>
                        </div>
                      )}
                      {urlError && (
                        <p className="text-center text-sm text-destructive">{urlError}</p>
                      )}
                    </TabsContent>

                    {/* URL Tab */}
                    <TabsContent value="url" className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="profilePhotoUrl">Image URL</Label>
                        <Input
                          id="profilePhotoUrl"
                          type="url"
                          value={urlInput}
                          onChange={(e) => {
                            setUrlInput(e.target.value);
                            setUrlError('');
                          }}
                          placeholder="https://example.com/photo.jpg"
                        />
                        {urlError && <p className="text-sm text-destructive">{urlError}</p>}
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleProfileUrlSubmit}
                        disabled={!urlInput.trim() || isLoading}
                      >
                        {isLoading ? 'Loading...' : 'Use This Photo'}
                      </Button>
                    </TabsContent>
                  </Tabs>

                  {/* Remove Photo */}
                  {hasPhoto && (
                    <div className="mt-4 border-t pt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          handleProfilePhotoRemove();
                          setProfileDialogOpen(false);
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Remove Photo
                      </Button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>

            {/* Right side info + quick-pick thumbnails */}
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <Label className="text-base font-medium">Profile Photo</Label>
                <p className="text-xs text-muted-foreground">
                  {hasPhoto ? 'Hover the photo to change it' : 'Click the avatar to add a photo'}
                </p>
              </div>

              {isLoadingAvatars ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading photos…</span>
                </div>
              ) : hasSourceAvatars ? (
                <div className="flex items-center gap-1.5">
                  {availableAvatars.map((avatar) => (
                    <button
                      key={avatar.id}
                      onClick={() => handleSelectSourceAvatar(avatar)}
                      className={cn(
                        'relative rounded-full transition-all',
                        avatar.isActive
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                          : 'opacity-70 hover:opacity-100'
                      )}
                      title={avatar.isActive ? `${avatar.label} (current)` : `Use ${avatar.label}`}
                    >
                      <Avatar className="h-9 w-9 border border-border">
                        <AvatarImage src={avatar.url} alt={avatar.label} />
                        <AvatarFallback className="text-[10px]">
                          {getSourceIcon(avatar.source)}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  ))}
                  <span className="ml-0.5 text-[10px] text-muted-foreground">← pick one</span>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Gallery Photos Card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gallery</CardTitle>
              <CardDescription>
                Upload additional photos to showcase in your portfolio. You&apos;ll be able to
                choose where each photo appears later.
              </CardDescription>
            </div>
            <Dialog
              open={galleryDialogOpen}
              onOpenChange={(open) => {
                setGalleryDialogOpen(open);
                if (!open) resetGalleryDialog();
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Photo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Gallery Photo</DialogTitle>
                  <DialogDescription>
                    Upload a photo or paste an image URL to add to your gallery.
                  </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="upload" className="mt-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upload" className="gap-2">
                      <Upload className="h-4 w-4" />
                      Upload
                    </TabsTrigger>
                    <TabsTrigger value="url" className="gap-2">
                      URL
                    </TabsTrigger>
                  </TabsList>

                  {/* Upload Tab */}
                  <TabsContent value="upload" className="space-y-4">
                    {galleryPreviewUrl ? (
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={galleryPreviewUrl}
                              alt="Preview"
                              className="max-h-48 rounded-lg border object-contain"
                            />
                            <button
                              onClick={() => setGalleryPreviewUrl(null)}
                              className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm"
                              aria-label="Remove preview"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="galleryCaption">Caption (optional)</Label>
                          <Input
                            id="galleryCaption"
                            value={galleryCaption}
                            onChange={(e) => setGalleryCaption(e.target.value)}
                            placeholder="Describe this photo…"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setGalleryPreviewUrl(null)}
                          >
                            Change
                          </Button>
                          <Button
                            className="flex-1"
                            onClick={handleGalleryConfirmUpload}
                            disabled={galleryIsLoading}
                          >
                            {galleryIsLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving…
                              </>
                            ) : (
                              'Add Photo'
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                          galleryIsDragging
                            ? 'border-primary bg-primary/5'
                            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                        )}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setGalleryIsDragging(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          setGalleryIsDragging(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setGalleryIsDragging(false);
                          const file = e.dataTransfer.files[0];
                          if (file) handleGalleryFileSelect(file);
                        }}
                        onClick={() => galleryFileRef.current?.click()}
                      >
                        <input
                          ref={galleryFileRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleGalleryFileSelect(file);
                          }}
                          className="hidden"
                        />
                        <ImagePlus className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">Drop an image or click to browse</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          PNG, JPG, GIF up to 40 MB
                        </p>
                      </div>
                    )}
                    {galleryUrlError && (
                      <p className="text-center text-sm text-destructive">{galleryUrlError}</p>
                    )}
                  </TabsContent>

                  {/* URL Tab */}
                  <TabsContent value="url" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="galleryPhotoUrl">Image URL</Label>
                      <Input
                        id="galleryPhotoUrl"
                        type="url"
                        value={galleryUrlInput}
                        onChange={(e) => {
                          setGalleryUrlInput(e.target.value);
                          setGalleryUrlError('');
                        }}
                        placeholder="https://example.com/photo.jpg"
                      />
                      {galleryUrlError && (
                        <p className="text-sm text-destructive">{galleryUrlError}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="galleryCaptionUrl">Caption (optional)</Label>
                      <Input
                        id="galleryCaptionUrl"
                        value={galleryCaption}
                        onChange={(e) => setGalleryCaption(e.target.value)}
                        placeholder="Describe this photo…"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleGalleryUrlSubmit}
                      disabled={!galleryUrlInput.trim() || galleryIsLoading}
                    >
                      {galleryIsLoading ? 'Loading...' : 'Add Photo'}
                    </Button>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {galleryPhotos.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <ImagePlus className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">No gallery photos yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add photos to showcase your work, events, or anything you&apos;d like visitors to
                see.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {galleryPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Gallery photo'}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  {/* Overlay with delete button */}
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex w-full items-center justify-between p-2">
                      {photo.caption && (
                        <span className="truncate text-xs text-white">{photo.caption}</span>
                      )}
                      <button
                        onClick={() => deletePhoto(photo.id)}
                        disabled={deletingId === photo.id}
                        className="ml-auto rounded-full bg-destructive/80 p-1.5 text-white transition-colors hover:bg-destructive"
                        aria-label="Delete photo"
                      >
                        {deletingId === photo.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
