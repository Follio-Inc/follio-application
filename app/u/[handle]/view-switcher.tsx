'use client';

import { motion } from 'framer-motion';
import { Clock, Grid3X3, Presentation, UserCheck } from 'lucide-react';

import type { PortfolioView } from '@/types';

interface ViewSwitcherProps {
  currentView: PortfolioView;
  onViewChange: (view: PortfolioView) => void;
}

const VIEWS = [
  { id: 'portfolio' as const, label: 'Portfolio', icon: Grid3X3 },
  { id: 'timeline' as const, label: 'Timeline', icon: Clock },
  { id: 'snapshot' as const, label: 'Snapshot', icon: UserCheck },
  { id: 'snap' as const, label: 'Snap View', icon: Presentation },
];

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  return (
    <div className="sticky top-14 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex items-center justify-center py-2.5">
        <nav className="inline-flex items-center gap-1 rounded-full border bg-background/80 p-1 shadow-sm backdrop-blur-sm">
          {VIEWS.map((view) => {
            const Icon = view.icon;
            const isActive = currentView === view.id;

            return (
              <button
                key={view.id}
                onClick={() => onViewChange(view.id)}
                className={`relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeViewPill"
                    className="absolute inset-0 rounded-full bg-primary shadow-sm"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <Icon className="relative z-10 h-3.5 w-3.5" />
                <span className="relative z-10">{view.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
