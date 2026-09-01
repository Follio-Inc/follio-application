/**
 * Public Follio loading state — mirrors the Follio page layout so the shell
 * does not shift when content arrives.
 */
export default function ProfileLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-background">
      <div className="mx-auto w-full max-w-4xl px-5 pt-10 sm:px-8 sm:pt-16">
        <div className="h-20 w-20 rounded-full bg-muted sm:h-24 sm:w-24" />
        <div className="mt-5 h-9 w-64 max-w-full rounded bg-muted" />
        <div className="mt-4 h-4 w-80 max-w-full rounded bg-muted" />
        <div className="mt-5 h-4 w-52 max-w-full rounded bg-muted" />

        <div className="mt-8 rounded-xl border border-border/60 p-5 sm:p-6">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="mt-5 space-y-4">
            <div className="h-4 w-56 max-w-full rounded bg-muted" />
            <div className="h-4 w-44 max-w-full rounded bg-muted" />
          </div>
          <div className="mt-6 h-10 w-full rounded-lg bg-muted" />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="h-[4.75rem] rounded-xl border border-border/60" />
          <div className="h-[4.75rem] rounded-xl border border-border/60" />
        </div>
      </div>
    </div>
  );
}
