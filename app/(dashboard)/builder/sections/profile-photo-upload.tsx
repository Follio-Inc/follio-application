'use client';

import { Camera, Link, Trash2, Upload, User, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

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

    // Test if the image can be loaded
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

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setUrlError('Please select an image file');
      return;
    }

    // Max file size: 5MB
    if (file.size > 5 * 1024 * 1024) {
      setUrlError('Image size must be less than 5MB');
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreviewUrl(dataUrl);
      setIsLoading(false);
    };
    reader.onerror = () => {
      setUrlError('Failed to read file');
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
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

  const resetDialog = () => {
    setUrlInput('');
    setUrlError('');
    setPreviewUrl(null);
    setIsLoading(false);
  };

  const hasPhoto = !!currentPhotoUrl;

  return (
    <div className="flex items-center gap-6">
      {/* Current Photo Display */}
      <div className="group relative">
        <Avatar className="h-24 w-24 border-2 border-muted">
          <AvatarImage src={currentPhotoUrl || undefined} alt="Profile photo" />
          <AvatarFallback className="bg-muted text-2xl">
            {initials || <User className="h-10 w-10 text-muted-foreground" />}
          </AvatarFallback>
        </Avatar>

        {/* Hover overlay */}
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetDialog();
          }}
        >
          <DialogTrigger asChild>
            <button
              className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Change profile photo"
            >
              <Camera className="h-6 w-6 text-white" />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Profile Photo</DialogTitle>
              <DialogDescription>
                Upload a photo or paste an image URL to update your profile picture.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="upload" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Upload
                </TabsTrigger>
                <TabsTrigger value="url" className="gap-2">
                  <Link className="h-4 w-4" />
                  URL
                </TabsTrigger>
              </TabsList>

              {/* Upload Tab */}
              <TabsContent value="upload" className="space-y-4">
                {previewUrl ? (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <div className="relative">
                        <Avatar className="h-32 w-32 border-2 border-muted">
                          <AvatarImage src={previewUrl} alt="Preview" />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <button
                          onClick={() => setPreviewUrl(null)}
                          className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground hover:bg-destructive/90"
                          aria-label="Remove preview"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-center text-sm text-muted-foreground">
                      Preview of your new profile photo
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setPreviewUrl(null)}
                      >
                        Choose Different
                      </Button>
                      <Button className="flex-1" onClick={handleConfirmUpload} disabled={isLoading}>
                        Save Photo
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
                    <Upload className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium">Drop an image here or click to browse</p>
                    <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, GIF up to 5MB</p>
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
                  <p className="text-xs text-muted-foreground">
                    Paste a direct link to an image (e.g., from Google, LinkedIn, or any public URL)
                  </p>
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
                  className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleRemovePhoto}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove Photo
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Photo Label */}
      <div className="flex-1 space-y-1">
        <Label className="text-base font-medium">Profile Photo</Label>
        <p className="text-sm text-muted-foreground">
          {hasPhoto
            ? 'Hover over your photo to change or remove it'
            : 'Hover over the placeholder to add a photo'}
        </p>
      </div>
    </div>
  );
}
