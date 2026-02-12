'use client';

import {
  Camera,
  Check,
  Github,
  Globe,
  Link,
  Linkedin,
  Loader2,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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

interface AvatarOption {
  id: string;
  label: string;
  url: string;
  source: string;
  isActive: boolean;
}

/**
 * Compress an image file to a target size (for Clerk's 5MB limit)
 * Resizes to 512x512 with center crop and JPEG compression
 */
const compressImageForClerk = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      const targetSize = 512;
      canvas.width = targetSize;
      canvas.height = targetSize;

      const scale = Math.max(targetSize / img.width, targetSize / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const offsetX = (targetSize - scaledWidth) / 2;
      const offsetY = (targetSize - scaledHeight) / 2;

      ctx?.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      console.log(
        `[Image Compress] Compressed from ${file.size} bytes to ~${Math.round(dataUrl.length * 0.75)} bytes`
      );
      resolve(dataUrl);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

/** Get icon for a source type */
const getSourceIcon = (source: string) => {
  switch (source) {
    case 'google':
      return Globe;
    case 'linkedin':
      return Linkedin;
    case 'github':
      return Github;
    default:
      return Upload;
  }
};

interface ProfilePhotoUploadProps {
  currentPhotoUrl: string | null | undefined;
  initials: string;
  onPhotoChange: (url: string) => void;
  onPhotoRemove: () => void;
}

export function ProfilePhotoUpload({
  currentPhotoUrl,
  initials,
  onPhotoChange,
  onPhotoRemove,
}: ProfilePhotoUploadProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available avatars from connected sources
  const [availableAvatars, setAvailableAvatars] = useState<AvatarOption[]>([]);
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(true);

  // Fetch available avatars from all connected sources
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

  // Update isActive status when currentPhotoUrl changes
  useEffect(() => {
    setAvailableAvatars((prev) =>
      prev.map((a) => ({
        ...a,
        isActive: a.url === currentPhotoUrl,
      }))
    );
  }, [currentPhotoUrl]);

  const validateImageUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) {
      setUrlError('Please enter a URL');
      return;
    }

    if (!validateImageUrl(urlInput)) {
      setUrlError('Please enter a valid URL');
      return;
    }

    setIsLoading(true);
    setUrlError('');

    const img = new Image();
    img.onload = () => {
      onPhotoChange(urlInput);
      setIsDialogOpen(false);
      setUrlInput('');
      setPreviewUrl(null);
      setIsLoading(false);
    };
    img.onerror = () => {
      setUrlError('Could not load image from this URL. Please check the URL and try again.');
      setIsLoading(false);
    };
    img.src = urlInput;
  };

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUrlError('Please select an image file');
      return;
    }

    if (file.size > 40 * 1024 * 1024) {
      setUrlError('Image size must be less than 40MB');
      return;
    }

    setIsLoading(true);
    setUrlError('');

    try {
      const compressedDataUrl = await compressImageForClerk(file);
      setPreviewUrl(compressedDataUrl);
    } catch (err) {
      console.error('Failed to process image:', err);
      setUrlError('Failed to process image');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleConfirmUpload = () => {
    if (previewUrl) {
      onPhotoChange(previewUrl);
      setIsDialogOpen(false);
      setPreviewUrl(null);
    }
  };

  const handleRemovePhoto = () => {
    onPhotoRemove();
    setIsDialogOpen(false);
  };

  const handleSelectSourceAvatar = (avatar: AvatarOption) => {
    if (avatar.isActive) return;
    onPhotoChange(avatar.url);
  };

  const resetDialog = () => {
    setUrlInput('');
    setUrlError('');
    setPreviewUrl(null);
    setIsLoading(false);
  };

  const hasPhoto = !!currentPhotoUrl;
  const hasSourceAvatars = availableAvatars.length > 0;

  return (
    <div className="space-y-5">
      {/* Main profile photo row */}
      <div className="flex items-center gap-5">
        {/* Photo with hover overlay */}
        <div className="group relative shrink-0">
          <Avatar className="h-20 w-20 border-2 border-border shadow-sm">
            <AvatarImage src={currentPhotoUrl || undefined} alt="Profile photo" />
            <AvatarFallback className="bg-muted text-xl font-medium">
              {initials || <User className="h-8 w-8 text-muted-foreground" />}
            </AvatarFallback>
          </Avatar>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetDialog();
            }}
          >
            <DialogTrigger asChild>
              <button
                className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Change profile photo"
              >
                <Camera className="h-5 w-5 text-white" />
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
                  className={cn('grid w-full', hasSourceAvatars ? 'grid-cols-3' : 'grid-cols-2')}
                >
                  {hasSourceAvatars && (
                    <TabsTrigger value="sources" className="gap-2">
                      <User className="h-4 w-4" />
                      Sources
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="upload" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="url" className="gap-2">
                    <Link className="h-4 w-4" />
                    URL
                  </TabsTrigger>
                </TabsList>

                {/* Sources Tab */}
                {hasSourceAvatars && (
                  <TabsContent value="sources" className="space-y-3 pt-1">
                    <div className="space-y-2">
                      {availableAvatars.map((avatar) => {
                        const SourceIcon = getSourceIcon(avatar.source);
                        return (
                          <button
                            key={avatar.id}
                            onClick={() => {
                              handleSelectSourceAvatar(avatar);
                              setIsDialogOpen(false);
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
                                <SourceIcon className="h-4 w-4 text-muted-foreground" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <SourceIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
                    </div>
                    <p className="text-center text-xs text-muted-foreground">
                      Selected photo syncs to your login avatar
                    </p>
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
                            className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm hover:bg-destructive/90"
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
                          onClick={handleConfirmUpload}
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
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                      <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Drop an image or click to browse</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        PNG, JPG, GIF up to 40 MB
                      </p>
                    </div>
                  )}
                  {urlError && <p className="text-center text-sm text-destructive">{urlError}</p>}
                </TabsContent>

                {/* URL Tab */}
                <TabsContent value="url" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="photoUrl">Image URL</Label>
                    <Input
                      id="photoUrl"
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
                    onClick={handleUrlSubmit}
                    disabled={!urlInput.trim() || isLoading}
                  >
                    {isLoading ? 'Loading...' : 'Use This Photo'}
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Remove Photo Option */}
              {hasPhoto && (
                <div className="mt-4 border-t pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleRemovePhoto}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Remove Photo
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Right side: label + quick-pick thumbnails */}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <Label className="text-base font-medium">Profile Photo</Label>
            <p className="text-xs text-muted-foreground">
              {hasPhoto ? 'Hover to change' : 'Click to add a photo'}
            </p>
          </div>

          {/* Inline source avatar pills */}
          {isLoadingAvatars ? (
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading photos…</span>
            </div>
          ) : hasSourceAvatars ? (
            <div className="flex items-center gap-1.5">
              {availableAvatars.map((avatar) => {
                const SourceIcon = getSourceIcon(avatar.source);
                return (
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
                        <SourceIcon className="h-3.5 w-3.5 text-muted-foreground" />
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
              <span className="ml-0.5 text-[10px] text-muted-foreground">← pick one</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
