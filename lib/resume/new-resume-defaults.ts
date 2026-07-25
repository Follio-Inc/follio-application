/**
 * Defaults applied when creating any new resume (blank, clone, or upload shell).
 * Visibility is never inherited from a source profile — clones start private.
 */
export const NEW_RESUME_DEFAULTS = {
  status: 'DRAFT' as const,
  resumeVisibility: 'PRIVATE' as const,
};
