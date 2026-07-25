'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface SliderProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'size'
> {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Visually thinner track + smaller thumb for compact design panels */
  size?: 'default' | 'sm';
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, min, max, step = 1, onChange, size = 'default', ...props }, ref) => {
    const percentage = ((value - min) / (max - min)) * 100;
    const thumbSize = size === 'sm' ? '14px' : '16px';

    return (
      <div
        className={cn('relative flex w-full items-center', className)}
        style={{ ['--slider-thumb-size' as string]: thumbSize }}
      >
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            'slider-input w-full cursor-pointer appearance-none rounded-full bg-muted/80 outline-none transition-[background] duration-150',
            size === 'sm' ? 'h-1' : 'h-1.5'
          )}
          style={{
            background: `linear-gradient(to right, hsl(var(--foreground)) 0%, hsl(var(--foreground)) ${percentage}%, hsl(var(--muted)) ${percentage}%, hsl(var(--muted)) 100%)`,
          }}
          {...props}
        />
        <style jsx>{`
          .slider-input::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: var(--slider-thumb-size, 16px);
            height: var(--slider-thumb-size, 16px);
            border-radius: 50%;
            background: hsl(var(--background));
            cursor: pointer;
            border: 1.5px solid hsl(var(--foreground));
            box-shadow:
              0 1px 2px rgba(0, 0, 0, 0.12),
              0 0 0 1px hsl(var(--background));
            transition:
              transform 0.15s ease,
              box-shadow 0.15s ease,
              border-color 0.15s ease;
          }
          .slider-input:hover::-webkit-slider-thumb {
            box-shadow:
              0 1px 3px rgba(0, 0, 0, 0.18),
              0 0 0 1px hsl(var(--background));
          }
          .slider-input:active::-webkit-slider-thumb {
            transform: scale(1.08);
          }
          .slider-input:focus-visible::-webkit-slider-thumb {
            outline: 2px solid hsl(var(--ring));
            outline-offset: 2px;
          }
          .slider-input::-moz-range-thumb {
            width: var(--slider-thumb-size, 16px);
            height: var(--slider-thumb-size, 16px);
            border-radius: 50%;
            background: hsl(var(--background));
            cursor: pointer;
            border: 1.5px solid hsl(var(--foreground));
            box-shadow:
              0 1px 2px rgba(0, 0, 0, 0.12),
              0 0 0 1px hsl(var(--background));
          }
          .slider-input:focus-visible::-moz-range-thumb {
            outline: 2px solid hsl(var(--ring));
            outline-offset: 2px;
          }
        `}</style>
      </div>
    );
  }
);
Slider.displayName = 'Slider';

export { Slider };
