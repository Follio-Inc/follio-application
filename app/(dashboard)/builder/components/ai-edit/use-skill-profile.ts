'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { readStoredSkillProfile } from '@/services/ai/resume-skills/parse';
import type { StoredSkillProfile } from '@/services/ai/skills/types';

/**
 * loading: first fetch. reading: the model is reading the resume now.
 * ready: the saved read is here, or there is none and none is coming.
 */
export type SkillReadStatus = 'loading' | 'reading' | 'ready';

export interface SkillRead {
  profile: StoredSkillProfile | null;
  status: SkillReadStatus;
}

interface Snapshot extends SkillRead {
  profileId: string | null;
}

/** About a minute: long enough for a read to finish after a save. */
const POLL_MS = 4000;
const POLL_ATTEMPTS = 15;
/** Saves start a new read after their response; ask once it has had time to run. */
const AFTER_SAVE_MS = 5000;

const IDLE: Snapshot = { profileId: null, profile: null, status: 'loading' };

let snapshot: Snapshot = IDLE;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let controller: AbortController | null = null;
let attempts = 0;

function publish(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

async function load(profileId: string): Promise<void> {
  clearTimer();
  controller?.abort();
  const own = new AbortController();
  controller = own;
  try {
    const response = await fetch('/api/profile/skill-profile', {
      signal: own.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Skill read failed: ${response.status}`);
    const body = (await response.json()) as { profile?: unknown; pending?: unknown };
    if (snapshot.profileId !== profileId) return;
    const profile = readStoredSkillProfile(body.profile) ?? snapshot.profile;
    if (body.pending === true && attempts < POLL_ATTEMPTS) {
      attempts += 1;
      publish({ profile, status: 'reading' });
      timer = setTimeout(() => void load(profileId), POLL_MS);
      return;
    }
    publish({ profile, status: 'ready' });
  } catch {
    if (own.signal.aborted || snapshot.profileId !== profileId) return;
    // Scores still work from what the resume names; the saved read only adds to them.
    publish({ status: 'ready' });
  }
}

function start(profileId: string) {
  if (snapshot.profileId === profileId) return;
  attempts = 0;
  publish({ profileId, profile: null, status: 'loading' });
  void load(profileId);
}

function refreshSoon() {
  const { profileId } = snapshot;
  if (!profileId) return;
  clearTimer();
  timer = setTimeout(() => {
    attempts = 0;
    void load(profileId);
  }, AFTER_SAVE_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => IDLE;

/**
 * The saved model read of the open resume's skills. Shared by every caller,
 * fetched once per resume, and fetched again after each save.
 */
export function useStoredSkillProfile(profileId: string | null | undefined): SkillRead {
  useEffect(() => {
    if (profileId) start(profileId);
  }, [profileId]);

  useEffect(() => {
    window.addEventListener('profile-updated', refreshSoon);
    return () => window.removeEventListener('profile-updated', refreshSoon);
  }, []);

  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!profileId || current.profileId !== profileId) return { profile: null, status: 'loading' };
  return { profile: current.profile, status: current.status };
}
