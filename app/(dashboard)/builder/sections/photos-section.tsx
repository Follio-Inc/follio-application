'use client';

import { Camera, Eye, EyeOff, Loader2, Trash2, Upload } from 'lucide-react';
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
import { ImageCropper, type CropArea } from '@/components/ui/image-cropper';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notifyProfileUpdated } from '@/lib/events';
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

/** Load an image element from a URL */
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.crossOrigin = 'anonymous';
    img.src = url;
  });

/** Crop the image to the given pixel area and resize to 512×512 JPEG */
async function getCroppedImg(imageSrc: string, pixelCrop: CropArea): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  const outputSize = 512;
  canvas.width = outputSize;
  canvas.height = outputSize;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return canvas.toDataURL('image/jpeg', 0.85);
}

// ─── Photos Section ──────────────────────────────────────────────────────────

interface PhotosSectionProps {
  profile: FullProfile;
  onUpdateAction: (data: Partial<FullProfile>) => void;
}

export function PhotosSection({ profile, onUpdateAction }: PhotosSectionProps) {
  // ── Resume photo toggle state ────────────────────────────────────────────
  const [resumeShowPhoto, setResumeShowPhoto] = useState(
    (profile as unknown as Record<string, unknown>).resumeShowPhoto === true
  );

  // ── Profile Photo state ──────────────────────────────────────────────────
  const [availableAvatars, setAvailableAvatars] = useState<AvatarOption[]>([]);
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(true);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropPixels, setCropPixels] = useState<CropArea | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const profileFileRef = useRef<HTMLInputElement>(null);

  // ── Resume photo toggle handler ──────────────────────────────────────────
  const handleResumeShowPhotoToggle = async () => {
    const newValue = !resumeShowPhoto;
    setResumeShowPhoto(newValue);
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeShowPhoto: newValue }),
      });
      notifyProfileUpdated();
    } catch (error) {
      console.error('Failed to update resume photo visibility:', error);
      setResumeShowPhoto(!newValue);
    }
  };

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
  ): Promise<void> => {
    try {
      await fetch('/api/profile/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, category, caption }),
      });
    } catch (err) {
      console.error('Failed to save photo:', err);
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
    setUrlError('');
    // Load the full-resolution image for cropping (don't pre-compress)
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
      setCropPixels(null);
    };
    reader.onerror = () => setUrlError('Failed to read image');
    reader.readAsDataURL(file);
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
    setCropPixels(null);
    setIsLoading(false);
  };

  const currentPhotoUrl = profile.avatarUrl;
  const hasPhoto = !!currentPhotoUrl;
  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;
  const hasSourceAvatars = availableAvatars.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Profile Photo Card ── */}
      <Card className={cn(!resumeShowPhoto && 'opacity-50')}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex-1 text-center">
            <CardTitle>Profile Photo</CardTitle>
            <CardDescription>
              Your main profile picture, shown across your portfolio and resume views.
              {hasSourceAvatars
                ? ' You can also pick from photos imported from your connected accounts.'
                : ''}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleResumeShowPhotoToggle}
              className={!resumeShowPhoto ? 'text-muted-foreground' : ''}
              title={resumeShowPhoto ? 'Hide photo from resume' : 'Show photo on resume'}
              disabled={!hasPhoto}
            >
              {resumeShowPhoto ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-6">
            {/* Clickable avatar — large & centered */}
            <div className="group relative shrink-0">
              <Avatar className="h-40 w-40 border-4 border-border shadow-lg ring-4 ring-background">
                <AvatarImage
                  src={currentPhotoUrl || undefined}
                  alt="Profile photo"
                  className="object-cover"
                />
                <AvatarFallback className="bg-muted text-4xl font-semibold">
                  {initials || <Camera className="h-12 w-12 text-muted-foreground" />}
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
                        <div className="space-y-3">
                          {/* Cropper */}
                          <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-xl border border-border/40">
                            <ImageCropper
                              image={previewUrl}
                              aspect={1}
                              cropShape="round"
                              onCropChange={(area) => setCropPixels(area)}
                            />
                          </div>
                          <p className="text-center text-[11px] text-muted-foreground">
                            Drag image to reposition · Drag handles to resize · Scroll to zoom
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setPreviewUrl(null);
                                setCropPixels(null);
                              }}
                            >
                              Change
                            </Button>
                            <Button
                              className="flex-1"
                              onClick={async () => {
                                if (previewUrl && cropPixels) {
                                  setIsLoading(true);
                                  try {
                                    const cropped = await getCroppedImg(previewUrl, cropPixels);
                                    handleProfilePhotoChange(cropped);
                                    setProfileDialogOpen(false);
                                    setPreviewUrl(null);
                                    setCropPixels(null);
                                  } catch {
                                    setUrlError('Failed to crop image');
                                  } finally {
                                    setIsLoading(false);
                                  }
                                }
                              }}
                              disabled={isLoading || !cropPixels}
                            >
                              {isLoading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Processing…
                                </>
                              ) : (
                                'Use Photo'
                              )}
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

            {/* Center info text */}
            <div className="space-y-1 text-center">
              <p className="text-sm text-muted-foreground">
                {hasPhoto ? 'Hover the photo to change it' : 'Click the avatar to add a photo'}
              </p>
            </div>

            {/* Source avatars — horizontal row below */}
            {isLoadingAvatars ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading connected photos…</span>
              </div>
            ) : hasSourceAvatars ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Or pick from your accounts
                </p>
                <div className="flex items-center gap-3">
                  {availableAvatars.map((avatar) => (
                    <button
                      key={avatar.id}
                      onClick={() => handleSelectSourceAvatar(avatar)}
                      className={cn(
                        'group/avatar relative rounded-full transition-all duration-200',
                        avatar.isActive
                          ? 'scale-105 ring-[3px] ring-primary ring-offset-[3px] ring-offset-background'
                          : 'opacity-75 hover:scale-110 hover:opacity-100'
                      )}
                      title={avatar.isActive ? `${avatar.label} (current)` : `Use ${avatar.label}`}
                    >
                      <Avatar className="h-14 w-14 border-2 border-border shadow-sm">
                        <AvatarImage src={avatar.url} alt={avatar.label} className="object-cover" />
                        <AvatarFallback className="text-sm">
                          {getSourceIcon(avatar.source)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-muted-foreground">
                        {avatar.source.charAt(0).toUpperCase() + avatar.source.slice(1)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
