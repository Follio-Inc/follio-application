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
    <div className="builder-base flex min-h-[calc(100vh-3.5rem)] animate-pulse flex-col xl:h-[calc(100vh-3.5rem)]">
      {/* Top toolbar skeleton */}
      <div className="builder-base hidden h-12 shrink-0 items-center justify-between border-b border-border/30 px-5 xl:flex">
        <div className="h-3 w-24 rounded bg-muted-foreground/15" />
        <div className="h-7 w-40 rounded-lg bg-muted-foreground/15" />
      </div>

      <div className="flex flex-1 xl:min-h-0">
        {/* Editor column skeleton */}
        <div className="builder-base flex w-full flex-col xl:flex-[4_0_0%]">
          <div className="builder-panel flex flex-1 flex-col gap-3 p-6 xl:m-2.5 xl:mr-2 xl:rounded-xl">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pl-5">
              <div className="h-14 rounded-xl bg-muted" />
              <div className="h-14 rounded-xl bg-muted" />
              <div className="h-14 rounded-xl bg-muted" />
              <div className="h-14 rounded-xl bg-muted" />
              <div className="h-14 rounded-xl bg-muted" />
            </div>
          </div>
        </div>

        {/* Preview column skeleton */}
        <div className="builder-base hidden xl:flex xl:flex-[5_0_0%]">
          <div className="builder-panel flex flex-1 flex-col overflow-hidden xl:my-2.5 xl:rounded-xl">
            <div className="flex h-12 shrink-0 items-center border-b border-border/30 px-6">
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
            <div className="builder-stage flex-1 p-6">
              <div className="builder-paper mx-auto h-full w-full max-w-2xl rounded-md" />
            </div>
          </div>
        </div>

        {/* Designer column skeleton */}
        <div className="builder-base hidden xl:flex xl:flex-[4_0_0%]">
          <div className="builder-panel flex flex-1 flex-col gap-3 overflow-hidden p-4 xl:m-2.5 xl:ml-2 xl:rounded-xl">
            <div className="h-12 shrink-0 border-b border-border/30" />
            <div className="h-24 rounded-xl bg-muted" />
            <div className="h-24 rounded-xl bg-muted" />
            <div className="h-24 rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
