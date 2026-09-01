import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Shown when there is no template-based portfolio to edit (e.g. a legacy
 * AI-generated portfolio, or one that hasn't been generated yet).
 */
export function PortfolioEditorEmptyState({ handle }: { handle: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">Editing isn&apos;t available yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The visual editor works with template-based portfolios. Generate or switch to a template
        from your dashboard to start customizing.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
        <Button asChild>
          <Link href={`/u/${handle}/work`} target="_blank">
            View portfolio
          </Link>
        </Button>
      </div>
    </div>
  );
}
