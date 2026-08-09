import * as React from 'react';

import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const PICKER_INPUT_TYPES = new Set(['date', 'month', 'week', 'time', 'datetime-local']);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onClick, disabled, readOnly, ...props }, ref) => {
    const opensPicker = typeof type === 'string' && PICKER_INPUT_TYPES.has(type);

    return (
      <input
        type={type}
        disabled={disabled}
        readOnly={readOnly}
        className={cn(
          'flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          opensPicker && !disabled && !readOnly && 'cursor-pointer',
          className
        )}
        ref={ref}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || disabled || readOnly || !opensPicker) return;
          try {
            // Open the native picker from anywhere in the field, not only the icon.
            event.currentTarget.showPicker?.();
          } catch {
            // Some browsers throw if showPicker is unavailable or blocked.
          }
        }}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
