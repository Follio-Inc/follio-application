/**
 * Resumes gallery loading state.
 *
 * Mirrors the eventual header + card grid so the page doesn't shift
 * when the real content streams in.
 */
export default function ResumesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2.5">
            <div className="h-2.5 w-16 rounded-full bg-muted" />
            <div className="h-7 w-40 rounded-md bg-muted" />
            <div className="h-3 w-72 max-w-full rounded-full bg-muted" />
          </div>
          <div className="h-9 w-32 rounded-lg bg-muted" />
        </div>

        {/* Card grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-border/60 bg-card">
              <div className="h-52 border-b border-border/60 bg-muted" />
              <div className="flex flex-col gap-3 p-4">
                <div className="h-3.5 w-3/4 rounded-full bg-muted" />
                <div className="h-3 w-1/2 rounded-full bg-muted" />
                <div className="mt-1 flex gap-2">
                  <div className="h-8 flex-1 rounded-md bg-muted" />
                  <div className="h-8 flex-1 rounded-md bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
