/**
 * Clear browser-only leftovers after account deletion or before a fresh signup.
 * Prevents onboarding/import state from reseeding a new account in the same tab.
 */

import { RESUME_CONSTRUCTION_SESSION_KEY } from '@/lib/onboarding/resume-construction';
import { ONBOARDING_TEMPLATE_KEY } from '@/lib/portfolio/templates/onboarding';

const SESSION_KEYS = [
  'onboarding_parsed_resume',
  'onboarding_handle',
  'importTargetProfileId',
  'importReturnUrl',
  ONBOARDING_TEMPLATE_KEY,
  RESUME_CONSTRUCTION_SESSION_KEY,
] as const;

const INDEXED_DB_NAMES = ['follio_onboarding', 'follio-photo-editor'] as const;

function deleteIndexedDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Best-effort clear of sessionStorage + known IndexedDB stores.
 * Safe to call from the browser; no-ops when storage APIs are unavailable.
 */
export async function clearAccountClientState(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    for (const key of SESSION_KEYS) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // sessionStorage may be unavailable (private mode / blocked)
  }

  await Promise.all(INDEXED_DB_NAMES.map((name) => deleteIndexedDatabase(name)));
}
