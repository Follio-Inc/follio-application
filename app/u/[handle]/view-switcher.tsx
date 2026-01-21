'use client';

import { motion } from 'framer-motion';
import { Clock, FileText, Grid3X3, UserCheck } from 'lucide-react';

import type { ProfileView } from '@/types';

interface ViewSwitcherProps {
  currentView: ProfileView;
  onViewChange: (view: ProfileView) => void;
}

const VIEWS = [
  {
    id: 'resume' as const,
    label: 'Resume',
    icon: FileText,
    description: 'Traditional resume format',
  },
  {
    id: 'portfolio' as const,
    label: 'Portfolio',
    icon: Grid3X3,
    description: 'Visual project showcase',
  },
  { id: 'timeline' as const, label: 'Timeline', icon: Clock, description: 'Career journey' },
  {
    id: 'snapshot' as const,
    label: 'SnapShot',
    icon: UserCheck,
    description: 'Key facts summary',
  },
];

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  return (
    <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container">
        <nav className="flex items-center justify-center gap-1 overflow-x-auto py-3 sm:gap-2">
          {VIEWS.map((view) => {
            const Icon = view.icon;
            const isActive = currentView === view.id;

            return (
              <button
                key={view.id}
                onClick={() => onViewChange(view.id)}
                className="relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Icon
                  className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
                  {view.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="activeViewIndicator"
                    className="absolute inset-0 rounded-lg bg-primary/10"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
