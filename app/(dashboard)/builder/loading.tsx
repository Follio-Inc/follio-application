/**
 * Builder route loading state.
 *
 * Next.js renders this instantly during navigation while the server
 * component (`layout.tsx`) runs its Prisma query. Without it the user
 * sees the previous page frozen until the new HTML arrives, which on
 * cold dev compiles can be several seconds.
 *
 * Kept intentionally minimal \u2014 a skeleton that mirrors the editor's
 * three-panel shape so the layout doesn't jump on swap-in.
 */
export default function BuilderLoading() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] animate-pulse flex-col bg-muted/30">
      <div className="flex flex-1 xl:h-[calc(100vh-3.5rem)]">
        {/* Editor column skeleton */}
        <div className="flex w-full flex-col gap-3 p-6 xl:flex-[4_0_0%]">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
        </div>
        {/* Preview column skeleton */}
        <div className="hidden border-l border-border/40 bg-muted/20 p-6 xl:flex xl:flex-[5_0_0%]">
          <div className="mx-auto h-full w-full max-w-2xl rounded bg-muted" />
        </div>
        {/* Designer column skeleton */}
        <div className="hidden border-l border-border/40 bg-background p-6 xl:flex xl:flex-[4_0_0%]">
          <div className="h-8 w-32 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
