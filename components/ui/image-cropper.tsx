'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropperProps {
  /** Data URL or object URL of the image to crop */
  image: string;
  /** Width / height ratio of the crop area (default 1 = square) */
  aspect?: number;
  /** Visual shape of the crop overlay */
  cropShape?: 'rect' | 'round';
  /** Called whenever the crop area changes, with pixel coords in the original image */
  onCropChange?: (croppedAreaPixels: CropArea) => void;
  /** Minimum crop box dimension in container pixels */
  minCropSize?: number;
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type DragMode = 'pan' | 'move-crop' | HandleDir;

// ─── Component ───────────────────────────────────────────────────────────────

export function ImageCropper({
  image,
  aspect = 1,
  cropShape = 'round',
  onCropChange,
  minCropSize = 60,
}: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Image natural dimensions
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);

  // Image display: position (px from container top-left) + scale (display px / natural px)
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
  const [imgScale, setImgScale] = useState(1);

  // Crop box in container-pixel coordinates
  const [crop, setCrop] = useState<CropArea>({ x: 0, y: 0, width: 200, height: 200 });

  // Container size (cached for constraint calculations)
  const [cSize, setCSize] = useState({ w: 400, h: 400 });

  // ── Load the source image ──────────────────────────────────────────────

  useEffect(() => {
    setLoaded(false);
    const img = new window.Image();
    img.onload = () => {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setLoaded(true);
    };
    img.src = image;
  }, [image]);

  // ── Initialise layout once the image loads ─────────────────────────────

  useEffect(() => {
    if (!loaded || !containerRef.current) return;
    const el = containerRef.current;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    setCSize({ w: cw, h: ch });

    // Scale image to *cover* the container
    const scale = Math.max(cw / naturalSize.w, ch / naturalSize.h);
    setImgScale(scale);
    setImgPos({
      x: (cw - naturalSize.w * scale) / 2,
      y: (ch - naturalSize.h * scale) / 2,
    });

    // Default crop = 72 % of the shorter container side, centred
    const dim = Math.min(cw, ch) * 0.72;
    const cropW = dim;
    const cropH = dim / aspect;
    setCrop({
      x: (cw - cropW) / 2,
      y: (ch - cropH) / 2,
      width: cropW,
      height: cropH,
    });
  }, [loaded, naturalSize, aspect]);

  // ── Report crop area in original-image pixels ──────────────────────────

  const onCropChangeRef = useRef(onCropChange);
  onCropChangeRef.current = onCropChange;

  useEffect(() => {
    if (!loaded || !onCropChangeRef.current) return;

    const px = (crop.x - imgPos.x) / imgScale;
    const py = (crop.y - imgPos.y) / imgScale;
    const pw = crop.width / imgScale;
    const ph = crop.height / imgScale;

    onCropChangeRef.current({
      x: Math.max(0, Math.round(px)),
      y: Math.max(0, Math.round(py)),
      width: Math.round(pw),
      height: Math.round(ph),
    });
  }, [crop, imgPos, imgScale, loaded]);

  // ── Drag / resize logic ────────────────────────────────────────────────

  const startDrag = useCallback(
    (e: React.PointerEvent, mode: DragMode) => {
      e.preventDefault();
      e.stopPropagation();

      const sx = e.clientX;
      const sy = e.clientY;
      const startCrop = { ...crop };
      const startImg = { ...imgPos };

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;

        // ── Pan the image ──
        if (mode === 'pan') {
          setImgPos({ x: startImg.x + dx, y: startImg.y + dy });
          return;
        }

        // ── Move the crop box ──
        if (mode === 'move-crop') {
          setCrop({
            ...startCrop,
            x: Math.max(0, Math.min(cSize.w - startCrop.width, startCrop.x + dx)),
            y: Math.max(0, Math.min(cSize.h - startCrop.height, startCrop.y + dy)),
          });
          return;
        }

        // ── Resize the crop box (aspect-ratio locked) ──
        let { x, y, width, height } = startCrop;

        switch (mode) {
          case 'se':
            width = Math.max(minCropSize, startCrop.width + dx);
            height = width / aspect;
            break;

          case 'sw': {
            const nw = Math.max(minCropSize, startCrop.width - dx);
            x = startCrop.x + startCrop.width - nw;
            width = nw;
            height = nw / aspect;
            break;
          }

          case 'ne':
            width = Math.max(minCropSize, startCrop.width + dx);
            height = width / aspect;
            y = startCrop.y + startCrop.height - height;
            break;

          case 'nw': {
            const nw2 = Math.max(minCropSize, startCrop.width - dx);
            const nh2 = nw2 / aspect;
            x = startCrop.x + startCrop.width - nw2;
            y = startCrop.y + startCrop.height - nh2;
            width = nw2;
            height = nh2;
            break;
          }

          case 'n': {
            const nh = Math.max(minCropSize / aspect, startCrop.height - dy);
            const nw3 = nh * aspect;
            x = startCrop.x + (startCrop.width - nw3) / 2;
            y = startCrop.y + startCrop.height - nh;
            width = nw3;
            height = nh;
            break;
          }

          case 's': {
            const nh4 = Math.max(minCropSize / aspect, startCrop.height + dy);
            const nw4 = nh4 * aspect;
            x = startCrop.x + (startCrop.width - nw4) / 2;
            width = nw4;
            height = nh4;
            break;
          }

          case 'e':
            width = Math.max(minCropSize, startCrop.width + dx);
            height = width / aspect;
            y = startCrop.y + (startCrop.height - height) / 2;
            break;

          case 'w': {
            const nw5 = Math.max(minCropSize, startCrop.width - dx);
            const nh6 = nw5 / aspect;
            x = startCrop.x + startCrop.width - nw5;
            y = startCrop.y + (startCrop.height - nh6) / 2;
            width = nw5;
            height = nh6;
            break;
          }
        }

        // Clamp to container bounds
        x = Math.max(0, x);
        y = Math.max(0, y);
        if (x + width > cSize.w) {
          width = cSize.w - x;
          height = width / aspect;
        }
        if (y + height > cSize.h) {
          height = cSize.h - y;
          width = height * aspect;
        }
        if (width < minCropSize) {
          width = minCropSize;
          height = width / aspect;
        }

        setCrop({ x, y, width, height });
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [crop, imgPos, cSize, aspect, minCropSize]
  );

  // ── Scroll-wheel zoom (centred on container) ──────────────────────────

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.95 : 1.05;

      setImgScale((prev) => {
        const next = Math.max(0.1, prev * factor);
        const ratio = next / prev;
        const cx = cSize.w / 2;
        const cy = cSize.h / 2;

        setImgPos((p) => ({
          x: cx - (cx - p.x) * ratio,
          y: cy - (cy - p.y) * ratio,
        }));

        return next;
      });
    },
    [cSize]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Resize handle geometry
  const hs = 12; // handle diameter
  const hh = hs / 2;

  const handles: { dir: HandleDir; cursor: string; x: number; y: number }[] = [
    // Corners
    { dir: 'nw', cursor: 'nwse-resize', x: crop.x - hh, y: crop.y - hh },
    { dir: 'ne', cursor: 'nesw-resize', x: crop.x + crop.width - hh, y: crop.y - hh },
    { dir: 'sw', cursor: 'nesw-resize', x: crop.x - hh, y: crop.y + crop.height - hh },
    { dir: 'se', cursor: 'nwse-resize', x: crop.x + crop.width - hh, y: crop.y + crop.height - hh },
    // Edges
    { dir: 'n', cursor: 'ns-resize', x: crop.x + crop.width / 2 - hh, y: crop.y - hh },
    {
      dir: 's',
      cursor: 'ns-resize',
      x: crop.x + crop.width / 2 - hh,
      y: crop.y + crop.height - hh,
    },
    { dir: 'w', cursor: 'ew-resize', x: crop.x - hh, y: crop.y + crop.height / 2 - hh },
    {
      dir: 'e',
      cursor: 'ew-resize',
      x: crop.x + crop.width - hh,
      y: crop.y + crop.height / 2 - hh,
    },
  ];

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden rounded-xl"
      style={{ touchAction: 'none', background: '#111' }}
    >
      {/* Source image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        draggable={false}
        className="pointer-events-none absolute"
        style={{
          left: imgPos.x,
          top: imgPos.y,
          width: naturalSize.w * imgScale,
          height: naturalSize.h * imgScale,
          maxWidth: 'none',
        }}
      />

      {/* Pan area – covers the whole container behind everything else */}
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ zIndex: 1 }}
        onPointerDown={(e) => startDrag(e, 'pan')}
      />

      {/* Crop overlay (box-shadow darkens everything outside) + drag-to-move */}
      <div
        className="absolute cursor-move"
        style={{
          left: crop.x,
          top: crop.y,
          width: crop.width,
          height: crop.height,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
          borderRadius: cropShape === 'round' ? '50%' : 0,
          border: '2px solid rgba(255, 255, 255, 0.75)',
          zIndex: 2,
        }}
        onPointerDown={(e) => startDrag(e, 'move-crop')}
      >
        {/* Rule-of-thirds grid */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ borderRadius: cropShape === 'round' ? '50%' : 0 }}
        >
          <div className="absolute bottom-0 left-1/3 top-0 w-px bg-white/20" />
          <div className="absolute bottom-0 left-2/3 top-0 w-px bg-white/20" />
          <div className="absolute left-0 right-0 top-1/3 h-px bg-white/20" />
          <div className="absolute left-0 right-0 top-2/3 h-px bg-white/20" />
        </div>
      </div>

      {/* Resize handles */}
      {handles.map((h) => (
        <div
          key={h.dir}
          className="absolute rounded-full bg-white shadow-md"
          style={{
            left: h.x,
            top: h.y,
            width: hs,
            height: hs,
            cursor: h.cursor,
            zIndex: 3,
            border: '1.5px solid rgba(0, 0, 0, 0.25)',
          }}
          onPointerDown={(e) => startDrag(e, h.dir)}
        />
      ))}
    </div>
  );
}
