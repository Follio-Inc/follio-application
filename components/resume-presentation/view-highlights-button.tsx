'use client';

import { Highlighter } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { FloatingActionCluster, FloatingIconButton } from '@/components/floating-icon-button';
import { TooltipProvider } from '@/components/ui/tooltip';

interface ViewHighlightsButtonProps {
  /** Public page: open this highlights URL. */
  href?: string;
  /** Builder: swap the preview in place instead of navigating. */
  onClick?: () => void;
  /** Tooltip. Defaults to "View Highlights". */
  label?: string;
  /** Defaults to a highlighter. */
  icon?: React.ReactNode;
}

/**
 * Same flying icon button as Copy, Download, and Share.
 * The name is the tooltip, shown on hover.
 * Position is owned by the parent so the button can stay put while the resume scrolls.
 */
export function ViewHighlightsButton({
  href,
  onClick,
  label = 'View Highlights',
  icon,
}: ViewHighlightsButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (href) router.push(href);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <FloatingActionCluster className="view-highlights">
        <FloatingIconButton label={label} onClick={handleClick}>
          {icon ?? <Highlighter className="h-[18px] w-[18px]" />}
        </FloatingIconButton>
      </FloatingActionCluster>
    </TooltipProvider>
  );
}
