'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends React.HTMLAttributes<SVGElement> {
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  return <Loader2 className={cn('animate-spin', sizeClasses[size], className)} {...props} />;
}

interface LoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Loading({ text = 'Loading...', size = 'md', className, ...props }: LoadingProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2', className)} {...props}>
      <Spinner size={size} />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}
