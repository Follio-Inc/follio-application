'use client';

/**
 * BuilderStoreProvider
 *
 * React context provider that creates and exposes a builder zustand store
 * to all builder children — the section editor and the resume preview panel.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';

import type { FullProfile } from '@/types';

import {
  createBuilderStore,
  type BuilderState,
  type BuilderStoreApi,
} from '@/lib/stores/builder-store';

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
  // State to force re-render when store is recreated (e.g., on resume switch)
  const [storeInstance, setStoreInstance] = useState<BuilderStoreApi | null>(null);

  if (!storeRef.current) {
    storeRef.current = createBuilderStore(profile);
  }

  // When the server-provided profile changes (e.g. after the layout re-fetches
  // due to a revalidation or resume switch), sync the store accordingly.
  const profileIdRef = useRef(profile.id);
  useEffect(() => {
    if (!storeRef.current) return;

    if (profileIdRef.current !== profile.id) {
      // Profile ID changed — user switched to a different resume.
      // Fully replace the store with the new profile data.
      storeRef.current = createBuilderStore(profile);
      // Force a re-render so children pick up the new store instance.
      // We do this by updating the ref and triggering a state change below.
      profileIdRef.current = profile.id;
      setStoreInstance(storeRef.current);
      return;
    }

    // Same profile, potentially newer data from server refresh
    const state = storeRef.current.getState();
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
  }, [profile]);

  return (
    <BuilderStoreContext.Provider value={storeInstance ?? storeRef.current}>
      {children}
    </BuilderStoreContext.Provider>
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
