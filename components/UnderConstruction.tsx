'use client';

import Link from 'next/link';
import { Construction, ArrowLeft, Home } from 'lucide-react';
import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';

interface UnderConstructionProps {
  title?: string;
  description?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

export function UnderConstruction({
  title = 'Under Construction',
  description = "We're working hard to bring you this feature. Check back soon!",
  showBackButton = true,
  showHomeButton = true,
}: UnderConstructionProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo href="/" size="md" />
        </div>
      </nav>

      {/* Content */}
      <div className="flex flex-col items-center justify-center px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          {/* Animated Icon */}
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10"
          >
            <Construction className="h-12 w-12 text-primary" />
          </motion.div>

          {/* Title */}
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>

          {/* Description */}
          <p className="mx-auto mb-8 max-w-md text-lg text-muted-foreground">{description}</p>

          {/* Progress Bar Animation */}
          <div className="mx-auto mb-8 h-2 w-64 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: '0%' }}
              animate={{ width: ['0%', '70%', '40%', '90%', '60%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Buttons */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {showBackButton && (
              <Button variant="outline" onClick={() => window.history.back()} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
            )}
            {showHomeButton && (
              <Link href="/">
                <Button className="gap-2">
                  <Home className="h-4 w-4" />
                  Back to Home
                </Button>
              </Link>
            )}
          </div>
        </motion.div>

        {/* Fun Facts / Coming Soon Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-16 text-center"
        >
          <p className="text-sm text-muted-foreground">🚀 Launching soon with amazing features</p>
        </motion.div>
      </div>
    </div>
  );
}
