'use client';

import {
  Camera,
  Check,
  Eye,
  EyeOff,
  Github,
  Globe,
  Linkedin,
  Loader2,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropPixels, setCropPixels] = useState<CropArea | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const resumeShowPhoto = profile.resumeShowPhoto ?? false;

  const handleResumeShowPhotoToggle = async () => {
    const newValue = !resumeShowPhoto;
    const update = { resumeShowPhoto: newValue } as Partial<FullProfile>;

    // Update store immediately so the preview reflects the change
    if (onInlineUpdate) {
      onInlineUpdate(update);
    } else {
      onUpdateAction(update);
    }

    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeShowPhoto: newValue }),
      });
      notifyProfileUpdated();
    } catch (error) {
      console.error('Failed to update resume photo visibility:', error);
      const revert = { resumeShowPhoto: !newValue } as Partial<FullProfile>;
      if (onInlineUpdate) {
        onInlineUpdate(revert);
      } else {
        onUpdateAction(revert);
      }
    }
  };

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

  useEffect(() => {
    setAvailableAvatars((prev) =>
      prev.map((a) => ({ ...a, isActive: a.url === profile.avatarUrl }))
    );
  }, [profile.avatarUrl]);

  const savePhoto = async (
    url: string,
    category: 'PROFILE' | 'GALLERY'
  ): Promise<string | null> => {
    try {
      const res = await fetch('/api/profile/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, category }),
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

  const handlePhotoChange = async (url: string) => {
    // Optimistically show the image while saving
    onUpdateAction({ avatarUrl: url });

    const photoId = await savePhoto(url, 'PROFILE');

    // For data URLs (uploaded/cropped photos), serve via the photos endpoint
    // so Profile.avatarUrl stays lightweight and the original is preserved.
    if (photoId && url.startsWith('data:')) {
      const servingUrl = `/api/photos/${photoId}`;
      onUpdateAction({ avatarUrl: servingUrl });
    }
  };

  const handlePhotoRemove = () => {
    onUpdateAction({ avatarUrl: '' });
  };

  const handleSelectSourceAvatar = (avatar: AvatarOption) => {
    if (avatar.isActive) return;
    onUpdateAction({ avatarUrl: avatar.url });
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
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
      setCropPixels(null);
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
    const img = new Image();
    img.onload = () => {
      handlePhotoChange(urlInput);
      setDialogOpen(false);
      setUrlInput('');
      setIsLoading(false);
    };
    img.onerror = () => {
      setUrlError('Could not load image from this URL');
      setIsLoading(false);
    };
    img.src = urlInput;
  };

  const resetDialog = () => {
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

  const photoContent = (
    <div className="flex items-center gap-5">
      {/* Avatar with hover-to-edit overlay */}
      <div className="group relative shrink-0">
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetDialog();
          }}
        >
          <DialogTrigger asChild>
            <button
              className="relative cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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

          {/* ─── Photo Dialog ─── */}
          <DialogContent className="gap-0 p-0 sm:max-w-[440px]">
            <DialogHeader className="px-6 pb-0 pt-6">
              <DialogTitle>Profile Photo</DialogTitle>
              <DialogDescription>
                {hasSourceAvatars
                  ? 'Choose from connected accounts, upload a photo, or use a URL.'
                  : 'Upload a photo or paste an image URL.'}
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 pb-6 pt-4">
              <Tabs defaultValue={hasSourceAvatars ? 'accounts' : 'upload'}>
                <TabsList
                  className={cn('grid w-full', hasSourceAvatars ? 'grid-cols-3' : 'grid-cols-2')}
                >
                  {hasSourceAvatars && <TabsTrigger value="accounts">Accounts</TabsTrigger>}
                  <TabsTrigger value="upload">Upload</TabsTrigger>
                  <TabsTrigger value="url">URL</TabsTrigger>
                </TabsList>

                {/* ── Accounts tab ── */}
                {hasSourceAvatars && (
                  <TabsContent value="accounts" className="mt-4 space-y-2">
                    {availableAvatars.map((avatar) => {
                      const Icon = getSourceIcon(avatar.source);
                      return (
                        <button
                          key={avatar.id}
                          onClick={() => {
                            handleSelectSourceAvatar(avatar);
                            setDialogOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all',
                            avatar.isActive
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border bg-card hover:border-primary/30 hover:bg-muted/60'
                          )}
                        >
                          <Avatar className="h-10 w-10 shrink-0 border border-border/50">
                            <AvatarImage src={avatar.url} alt={avatar.label} />
                            <AvatarFallback>
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate text-sm font-medium">{avatar.label}</span>
                            </div>
                          </div>
                          {avatar.isActive && (
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </TabsContent>
                )}

                {/* ── Upload tab ── */}
                <TabsContent value="upload" className="mt-4">
                  {previewUrl ? (
                    <div className="space-y-3">
                      <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-xl border border-border/40 bg-black/5">
                        <ImageCropper
                          image={previewUrl}
                          aspect={1}
                          cropShape="round"
                          onCropChange={(area) => setCropPixels(area)}
                        />
                      </div>
                      <p className="text-center text-[11px] text-muted-foreground">
                        Drag to reposition &middot; Handles to resize &middot; Scroll to zoom
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setPreviewUrl(null);
                            setCropPixels(null);
                          }}
                        >
                          Change
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={async () => {
                            if (previewUrl && cropPixels) {
                              setIsLoading(true);
                              try {
                                const cropped = await getCroppedImg(previewUrl, cropPixels);
                                handlePhotoChange(cropped);
                                setDialogOpen(false);
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
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
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
                        'cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
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
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Upload className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Drop an image or click to browse</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        PNG, JPG, GIF up to 40 MB
                      </p>
                    </div>
                  )}
                  {urlError && (
                    <p className="mt-2 text-center text-sm text-destructive">{urlError}</p>
                  )}
                </TabsContent>

                {/* ── URL tab ── */}
                <TabsContent value="url" className="mt-4 space-y-3">
                  <div className="space-y-1.5">
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
                    size="sm"
                    onClick={handleUrlSubmit}
                    disabled={!urlInput.trim() || isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      'Use This Photo'
                    )}
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Remove photo */}
              {hasPhoto && (
                <div className="mt-4 border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      handlePhotoRemove();
                      setDialogOpen(false);
                    }}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove Photo
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Right side: label + source avatar quick-pick + resume visibility toggle */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Profile Photo</p>
            <p className="text-xs text-muted-foreground">
              {hasPhoto ? 'Hover to change' : 'Click to add a photo'}
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

        {/* Source avatar quick-pick row */}
        {isLoadingAvatars ? (
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Loading photos…</span>
          </div>
        ) : hasSourceAvatars ? (
          <div className="flex items-center gap-1.5">
            {availableAvatars.map((avatar) => {
              const Icon = getSourceIcon(avatar.source);
              return (
                <button
                  key={avatar.id}
                  onClick={() => handleSelectSourceAvatar(avatar)}
                  className={cn(
                    'relative rounded-full transition-all duration-150',
                    avatar.isActive
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'opacity-60 hover:opacity-100'
                  )}
                  title={avatar.isActive ? `${avatar.label} (current)` : `Use ${avatar.label}`}
                >
                  <Avatar className="h-8 w-8 border border-border/60">
                    <AvatarImage src={avatar.url} alt={avatar.label} />
                    <AvatarFallback className="text-[10px]">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  {avatar.isActive && (
                    <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                      <Check className="h-2 w-2" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (embedded) {
    return photoContent;
  }

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
