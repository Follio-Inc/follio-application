/**
 * Builder Store
 *
 * Zustand store with zundo temporal middleware for undo/redo.
 * Holds the draft profile state for the builder, enabling:
 * - Real-time preview updates (preview reads from draftProfile)
 * - Explicit save (draft is persisted to API only on Save)
 * - Cancel/discard changes (revert draft to last saved state)
 * - Undo/redo for all draft changes
 */

import { temporal, type TemporalState } from 'zundo';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { FullProfile } from '@/types';

// ──────────────────────────────────────────────
// Contact Draft Shape
// ──────────────────────────────────────────────

export interface ContactDraft {
  email: string;
  emailPublic: boolean;
  phone: string;
  phoneCountryCode: string | null;
  phoneNumber: string;
  phonePublic: boolean;
  website: string;
  additionalEmails: Array<{ email: string; source: string }>;
  additionalPhones: Array<{ countryCode: string | null; number: string; source: string }>;
}

// ──────────────────────────────────────────────
// Store State & Actions
// ──────────────────────────────────────────────

export interface BuilderState {
  /** The current draft (what the user sees and edits). Preview reads from this. */
  draftProfile: FullProfile;
  /** The last successfully saved state. Used for discard / change-detection. */
  savedProfile: FullProfile;
  /** Contact info draft (separate because it's a different API endpoint) */
  contactDraft: ContactDraft;
  /** Contact info last saved state */
  savedContact: ContactDraft;
  /** Whether an API save is in-flight */
  isSaving: boolean;

  // ── Actions ──

  /** Update draft profile fields (triggers real-time preview update). */
  updateDraft: (updates: Partial<FullProfile>) => void;

  /** Update contact draft fields. */
  updateContactDraft: (updates: Partial<ContactDraft>) => void;

  /**
   * Commit an inline change to BOTH draft and saved profile.
   * Use this for list-based sections (Experience, Education, etc.) that
   * save to the API immediately via their own dialogs.
   */
  commitInlineChange: (updates: Partial<FullProfile>) => void;

  /** After a successful API save, sync savedProfile = draftProfile. */
  markSaved: () => void;

  /** Revert draft to the last saved state (cancel). */
  discardChanges: () => void;

  /** Set the saving loading state. */
  setSaving: (saving: boolean) => void;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function parseJsonArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T[];
    } catch {
      return [];
    }
  }
  return [];
}

export function extractContactDraft(profile: FullProfile): ContactDraft {
  const ci = profile.contactInfo as Record<string, unknown> | null;
  return {
    email: (ci?.email as string) || '',
    emailPublic: (ci?.emailPublic as boolean) || false,
    phone: (ci?.phone as string) || '',
    phoneCountryCode: (ci?.phoneCountryCode as string | null) || null,
    phoneNumber: (ci?.phoneNumber as string) || '',
    phonePublic: (ci?.phonePublic as boolean) || false,
    website: (ci?.website as string) || '',
    additionalEmails: parseJsonArray<{ email: string; source: string }>(ci?.additionalEmails),
    additionalPhones: parseJsonArray<{
      countryCode: string | null;
      number: string;
      source: string;
    }>(ci?.additionalPhones),
  };
}

/**
 * Compare draft vs saved to determine if there are unsaved profile changes.
 * Only checks the fields that are editable in form-based sections.
 */
export function hasProfileChanges(draft: FullProfile, saved: FullProfile): boolean {
  return (
    draft.firstName !== saved.firstName ||
    draft.lastName !== saved.lastName ||
    draft.headline !== saved.headline ||
    draft.summary !== saved.summary ||
    draft.location !== saved.location ||
    draft.avatarUrl !== saved.avatarUrl ||
    draft.status !== saved.status
  );
}

/** Compare contact drafts for unsaved changes. */
export function hasContactDraftChanges(draft: ContactDraft, saved: ContactDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}

// ──────────────────────────────────────────────
// Partialised type for undo/redo tracking
// ──────────────────────────────────────────────

type TrackedState = Pick<BuilderState, 'draftProfile' | 'contactDraft'>;

// ──────────────────────────────────────────────
// Store Factory
// ──────────────────────────────────────────────

export type BuilderStoreApi = StoreApi<BuilderState> & {
  temporal: StoreApi<TemporalState<TrackedState>>;
};

export function createBuilderStore(profile: FullProfile): BuilderStoreApi {
  const initialContact = extractContactDraft(profile);

  return createStore<BuilderState>()(
    temporal(
      (set) => ({
        draftProfile: profile,
        savedProfile: profile,
        contactDraft: initialContact,
        savedContact: { ...initialContact },
        isSaving: false,

        updateDraft: (updates) =>
          set((state) => ({
            draftProfile: { ...state.draftProfile, ...updates },
          })),

        updateContactDraft: (updates) =>
          set((state) => ({
            contactDraft: { ...state.contactDraft, ...updates },
          })),

        commitInlineChange: (updates) =>
          set((state) => ({
            draftProfile: { ...state.draftProfile, ...updates },
            savedProfile: { ...state.savedProfile, ...updates },
          })),

        markSaved: () =>
          set((state) => ({
            savedProfile: { ...state.draftProfile },
            savedContact: { ...state.contactDraft },
          })),

        discardChanges: () =>
          set((state) => ({
            draftProfile: { ...state.savedProfile },
            contactDraft: { ...state.savedContact },
          })),

        setSaving: (saving) => set({ isSaving: saving }),
      }),
      {
        partialize: (state): TrackedState => ({
          draftProfile: state.draftProfile,
          contactDraft: state.contactDraft,
        }),
        limit: 100,
      }
    )
  ) as BuilderStoreApi;
}
