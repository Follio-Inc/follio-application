/**
 * Resumes dashboard loading state.
 *
 * Mirrors the eventual grid layout so the page doesn't jump when
 * the real content streams in.
 */
export default function ResumesLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="h-9 w-32 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
