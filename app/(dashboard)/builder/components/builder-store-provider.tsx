'use client';

/**
 * BuilderStoreProvider
 *
 * React context provider that creates and exposes a builder zustand store
 * (with zundo undo/redo) to all builder children — the section editor and
 * the resume preview panel.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';

import type { FullProfile } from '@/types';

import {
  createBuilderStore,
  type BuilderState,
  type BuilderStoreApi,
} from '@/lib/stores/builder-store';
import type { TemporalState } from 'zundo';

// ──────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────

const BuilderStoreContext = createContext<BuilderStoreApi | null>(null);

// ──────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────

interface BuilderStoreProviderProps {
  profile: FullProfile;
  children: ReactNode;
}

export function BuilderStoreProvider({ profile, children }: BuilderStoreProviderProps) {
  const storeRef = useRef<BuilderStoreApi | null>(null);

  if (!storeRef.current) {
    storeRef.current = createBuilderStore(profile);
  }

  // When the server-provided profile changes (e.g. after the layout re-fetches
  // due to a revalidation), sync the **saved** baseline so change-detection
  // stays accurate. We intentionally do NOT overwrite the draft — this allows
  // in-progress edits to survive a background refresh.
  const profileIdRef = useRef(profile.id);
  useEffect(() => {
    if (!storeRef.current) return;
    // Only sync if this is a genuine server refresh (same profile, potentially newer data)
    if (profileIdRef.current === profile.id) {
      const state = storeRef.current.getState();
      // Only update saved state if user has no unsaved changes
      const hasDraftChanges =
        state.draftProfile.firstName !== state.savedProfile.firstName ||
        state.draftProfile.lastName !== state.savedProfile.lastName ||
        state.draftProfile.headline !== state.savedProfile.headline ||
        state.draftProfile.summary !== state.savedProfile.summary ||
        state.draftProfile.location !== state.savedProfile.location;

      if (!hasDraftChanges) {
        storeRef.current.setState({
          draftProfile: profile,
          savedProfile: profile,
        });
      }
    }
    profileIdRef.current = profile.id;
  }, [profile]);

  return (
    <BuilderStoreContext.Provider value={storeRef.current}>{children}</BuilderStoreContext.Provider>
  );
}

// ──────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────

function useBuilderStoreApi(): BuilderStoreApi {
  const store = useContext(BuilderStoreContext);
  if (!store) {
    throw new Error('useBuilderStore must be used within a BuilderStoreProvider');
  }
  return store;
}

/**
 * Select a slice of the builder state.
 * @example const draftProfile = useBuilderStore(s => s.draftProfile);
 */
export function useBuilderStore<T>(selector: (state: BuilderState) => T): T {
  const store = useBuilderStoreApi();
  return useStore(store, selector);
}

type TrackedState = Pick<BuilderState, 'draftProfile' | 'contactDraft'>;

/**
 * Access the temporal (undo/redo) store for the builder.
 * @example const { undo, redo, pastStates, futureStates } = useBuilderTemporal(s => s);
 */
export function useBuilderTemporal<T>(selector: (state: TemporalState<TrackedState>) => T): T {
  const store = useBuilderStoreApi();
  return useStore(store.temporal, selector);
}
