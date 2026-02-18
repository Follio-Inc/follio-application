/**
 * Profile Events
 * Lightweight event system for notifying the resume preview when profile data changes.
 * Section editors dispatch this after successful saves so the preview auto-refreshes.
 */

export function notifyProfileUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('profile-updated'));
  }
}
