/**
 * Public profile loading state.
 *
 * Shown instantly during navigation to `/u/[handle]` while the server
 * fetches profile + portfolio data. Renders a centered spinner card
 * sized to fit a typical portfolio hero so layout shift is minimal.
 */
export default function ProfileLoading() {
  return (
    <div className="flex min-h-screen animate-pulse flex-col items-center bg-background">
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-7 w-64 rounded bg-muted" />
            <div className="h-4 w-48 rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-5/6 rounded bg-muted" />
          <div className="h-4 w-4/6 rounded bg-muted" />
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="h-32 rounded-lg bg-muted" />
          <div className="h-32 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
