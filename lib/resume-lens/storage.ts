const STORAGE_KEY = 'follio:resume-lens:jd';

export function readStoredJobDescription(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredJobDescription(jd: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!jd) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, jd);
  } catch {
    // Private mode / quota — lens still works for this page load.
  }
}
