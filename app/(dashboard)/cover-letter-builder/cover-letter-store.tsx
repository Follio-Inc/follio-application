'use client';

import { createContext, useContext, useRef, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';

import {
  mergeCoverLetterContent,
  mergeCoverLetterDesign,
  type CoverLetterContent,
  type CoverLetterDesign,
  type CoverLetterVisibility,
} from '@/lib/cover-letter';

export interface CoverLetterDraft {
  id: string;
  title: string;
  content: Required<CoverLetterContent>;
  design: Required<CoverLetterDesign>;
  linkedProfileId: string | null;
  visibility: CoverLetterVisibility;
}

interface CoverLetterStoreState {
  draft: CoverLetterDraft;
  isSavingDesign: boolean;
  isSavingContent: boolean;
  saveError: string | null;
  updateTitle: (title: string) => void;
  updateContent: (patch: Partial<CoverLetterContent>) => void;
  updateDesign: (patch: Partial<CoverLetterDesign>) => void;
  updateVisibility: (visibility: CoverLetterVisibility) => void;
  setSavingDesign: (saving: boolean) => void;
  setSavingContent: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;
  replaceDraft: (draft: CoverLetterDraft) => void;
}

export type CoverLetterStore = StoreApi<CoverLetterStoreState>;

function createCoverLetterStore(initial: CoverLetterDraft): CoverLetterStore {
  return createStore<CoverLetterStoreState>((set) => ({
    draft: initial,
    isSavingDesign: false,
    isSavingContent: false,
    saveError: null,
    updateTitle: (title) => set((s) => ({ draft: { ...s.draft, title } })),
    updateContent: (patch) =>
      set((s) => ({
        draft: {
          ...s.draft,
          content: mergeCoverLetterContent({ ...s.draft.content, ...patch }),
        },
      })),
    updateDesign: (patch) =>
      set((s) => ({
        draft: {
          ...s.draft,
          design: mergeCoverLetterDesign({ ...s.draft.design, ...patch }),
        },
      })),
    updateVisibility: (visibility) => set((s) => ({ draft: { ...s.draft, visibility } })),
    setSavingDesign: (isSavingDesign) => set({ isSavingDesign }),
    setSavingContent: (isSavingContent) => set({ isSavingContent }),
    setSaveError: (saveError) => set({ saveError }),
    replaceDraft: (draft) => set({ draft }),
  }));
}

const CoverLetterStoreContext = createContext<CoverLetterStore | null>(null);

export function CoverLetterStoreProvider({
  initial,
  children,
}: {
  initial: CoverLetterDraft;
  children: ReactNode;
}) {
  const storeRef = useRef<CoverLetterStore | null>(null);
  if (!storeRef.current || storeRef.current.getState().draft.id !== initial.id) {
    storeRef.current = createCoverLetterStore(initial);
  }

  return (
    <CoverLetterStoreContext.Provider value={storeRef.current}>
      {children}
    </CoverLetterStoreContext.Provider>
  );
}

export function useCoverLetterStore<T>(selector: (state: CoverLetterStoreState) => T): T {
  const store = useContext(CoverLetterStoreContext);
  if (!store) {
    throw new Error('useCoverLetterStore must be used within CoverLetterStoreProvider');
  }
  return useStore(store, selector);
}

export async function readCoverLetterSaveError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}
