'use client';

import { ImagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { uploadPortfolioImage } from './upload';

interface ImageRowProps {
  shape: 'circle' | 'square';
  imageUrl: string | null;
  category: 'avatar' | 'project';
  /** Whether a "Reset to profile" action makes sense (override set + a profile default exists). */
  canReset: boolean;
  onUploaded: (url: string) => void;
  onRemove: () => void;
  onReset: () => void;
}

/**
 * A compact image control: thumbnail + Upload/Replace, Remove, and optional
 * Reset. Shared by the avatar and per-project image editors.
 */
export function ImageRow({
  shape,
  imageUrl,
  category,
  canReset,
  onUploaded,
  onRemove,
  onReset,
}: ImageRowProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadPortfolioImage(file, category);
      onUploaded(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border bg-muted ${
          shape === 'circle' ? 'rounded-full' : 'rounded-md'
        }`}
      >
        {uploading ? (
          <Spinner size="sm" />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            {imageUrl ? 'Replace' : 'Upload'}
          </Button>
          {imageUrl && (
            <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={onRemove}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
          )}
          {canReset && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={onReset}
              title="Use the photo from your profile"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
