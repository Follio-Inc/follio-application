import { Palette, Sparkles } from 'lucide-react';

export const metadata = {
  title: 'Portfolio Builder - Follio',
  description: 'Design and customize your portfolio',
};

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center justify-center text-center">
        {/* Icon */}
        <div className="relative mb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <Palette className="h-10 w-10 text-primary" />
          </div>
          <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-3 text-3xl font-bold tracking-tight">Portfolio Builder</h1>

        {/* Description */}
        <p className="mb-8 max-w-lg text-muted-foreground">
          A fully customizable portfolio experience is coming soon. You&apos;ll be able to choose
          themes, layouts, and control exactly how your work is presented to the world.
        </p>

        {/* Feature Preview */}
        <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-5 text-left">
            <div className="mb-2 text-sm font-semibold">Themes</div>
            <p className="text-xs text-muted-foreground">
              Choose from beautiful pre-built themes or create your own custom design.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5 text-left">
            <div className="mb-2 text-sm font-semibold">Layouts</div>
            <p className="text-xs text-muted-foreground">
              Flexible layouts to showcase projects, blog posts, photos, and more.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5 text-left">
            <div className="mb-2 text-sm font-semibold">Live Preview</div>
            <p className="text-xs text-muted-foreground">
              See changes in real-time as you design your portfolio side by side.
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="mt-8 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Coming Soon
        </div>
      </div>
    </div>
  );
}
