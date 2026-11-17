'use client';

/**
 * Resumes whose last propose run stopped before it could report back.
 *
 * Aborting a fetch stops this browser listening; it does not stop the server,
 * so a cancelled, timed-out or abandoned propose may still have saved a
 * suggestion set. The user has to be told, or they will ask again and end up
 * with two sets.
 *
 * The builder mounts the AI panel as `key={profileId}`, so switching resumes
 * destroys the panel and every piece of state inside it — which is exactly
 * when this warning matters most. This store lives at module scope instead,
 * above that remount, and mirrors itself into `sessionStorage` so a reload in
 * the same tab does not lose it either. It is **not** meant to outlive the
 * tab: a new session reloads Recent requests anyway, where an orphan set is
 * visible on its own.
 *
 * Only resume ids are stored. No proposal text, no session ids, no identity.
 */

const STORAGE_KEY = 'follio.uncertain-proposals';

/** Null until first read, so `sessionStorage` is touched lazily. */
let marked: Set<string> | null = null;
const listeners = new Set<() => void>();

function readStored(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // Private browsing, blocked site data, or a corrupt value. The in-memory
    // set still covers the remount this exists for.
    return [];
  }
}

function load(): Set<string> {
  if (marked) return marked;
  marked = new Set(typeof window === 'undefined' ? [] : readStored());
  return marked;
}

function persist(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota, private mode, or storage disabled. Best effort only — losing the
    // mirror costs reload survival, not the warning itself.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Record that this resume may have an unreported suggestion set. */
export function markUncertainProposal(resumeId: string): void {
  if (!resumeId) return;
  const ids = load();
  if (ids.has(resumeId)) return;
  ids.add(resumeId);
  persist(ids);
  emit();
}

/** The user has seen the warning and dismissed it. */
export function clearUncertainProposal(resumeId: string): void {
  const ids = load();
  if (!ids.delete(resumeId)) return;
  persist(ids);
  emit();
}

export function hasUncertainProposal(resumeId: string): boolean {
  return load().has(resumeId);
}

export function subscribeUncertainProposals(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset. Module state would otherwise leak between cases. */
export function __resetUncertainProposals(): void {
  marked = null;
  listeners.clear();
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage was never reachable.
  }
}
