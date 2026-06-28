/**
 * Builder route loading state.
 *
 * Next.js renders this instantly during navigation while the server
 * component (`layout.tsx`) runs its Prisma query. Without it the user
 * sees the previous page frozen until the new HTML arrives, which on
 * cold dev compiles can be several seconds.
 *
 * Kept intentionally minimal — a skeleton that mirrors the editor's
 * top toolbar + three-panel shape so the layout doesn't jump on swap-in.
 */
export default function BuilderLoading() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] animate-pulse flex-col bg-muted/30 xl:h-[calc(100vh-3.5rem)]">
      {/* Top toolbar skeleton */}
      <div className="hidden h-12 shrink-0 items-center justify-between border-b border-border/60 bg-background px-5 xl:flex">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-7 w-40 rounded-lg bg-muted" />
      </div>

      <div className="flex flex-1 xl:min-h-0">
        {/* Editor column skeleton */}
        <div className="flex w-full flex-col gap-3 bg-muted/40 px-6 py-8 xl:flex-[4_0_0%]">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pl-5">
            <div className="h-14 rounded-lg bg-muted" />
            <div className="h-14 rounded-lg bg-muted" />
            <div className="h-14 rounded-lg bg-muted" />
            <div className="h-14 rounded-lg bg-muted" />
            <div className="h-14 rounded-lg bg-muted" />
          </div>
        </div>

        {/* Preview column skeleton */}
        <div className="hidden flex-col border-l border-border/60 bg-muted/20 xl:flex xl:flex-[5_0_0%]">
          <div className="flex h-12 shrink-0 items-center border-b border-border/60 px-6">
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
          <div className="flex-1 p-6">
            <div className="mx-auto h-full w-full max-w-2xl rounded-lg bg-muted" />
          </div>
        </div>

        {/* Designer column skeleton */}
        <div className="hidden flex-col border-l border-border/60 bg-background xl:flex xl:flex-[4_0_0%]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-5">
            <div className="h-3 w-14 rounded bg-muted" />
            <div className="h-7 w-7 rounded-md bg-muted" />
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="h-8 rounded-md bg-muted" />
            <div className="h-8 rounded-md bg-muted" />
            <div className="h-8 rounded-md bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
