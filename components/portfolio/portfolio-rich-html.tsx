'use client';

/**
 * Safe renderer for portfolio Medium-style HTML (or legacy plain text).
 */

import {
  isPortfolioRichHtml,
  isPortfolioTextEmpty,
  sanitizePortfolioHtml,
} from '@/lib/portfolio/rich-html';
import { cn } from '@/lib/utils';

interface PortfolioRichHtmlProps {
  html: string | null | undefined;
  className?: string;
  /** Extra class on the wrapper when content is rich HTML. */
  richClassName?: string;
}

export function PortfolioRichHtml({ html, className, richClassName }: PortfolioRichHtmlProps) {
  if (isPortfolioTextEmpty(html)) return null;

  if (isPortfolioRichHtml(html)) {
    return (
      <div
        className={cn('portfolio-rich-html', className, richClassName)}
        dangerouslySetInnerHTML={{ __html: sanitizePortfolioHtml(html) }}
      />
    );
  }

  return <div className={cn('portfolio-rich-html', className)}>{html}</div>;
}
