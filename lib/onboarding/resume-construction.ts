/**
 * Session flag set during onboarding upload → builder handoff.
 * The builder preview reads this once, plays a brief construction status, then clears it.
 *
 * Values:
 * - `'1'` — handoff requested (set by onboarding)
 * - `'playing'` — animation in progress (survives React Strict Mode remount)
 */
export const RESUME_CONSTRUCTION_SESSION_KEY = 'follio_resume_construct';
export const RESUME_CONSTRUCTION_SESSION_PLAYING = 'playing';

/** Keep the status chip short — resume content is visible immediately underneath. */
export const RESUME_CONSTRUCTION_REVEAL_MS = 900;
export const RESUME_CONSTRUCTION_STATUS_TICK_MS = 180;
/** Show refresh advice if the chip is somehow still up. */
export const RESUME_CONSTRUCTION_REFRESH_HINT_MS = 2500;
/** Hard-dismiss so the UI can never stay stuck. */
export const RESUME_CONSTRUCTION_HARD_DISMISS_MS = 4000;

export const RESUME_CONSTRUCTION_STATUSES = [
  'Reading your resume…',
  'Placing experience…',
  'Adding education…',
  'Organizing skills…',
  'Finishing layout…',
] as const;
