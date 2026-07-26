/**
 * Desktop document builder view mode.
 *
 * Mutual exclusion: Content+Preview XOR Preview+Design.
 * `preview` — both side panes closed; strip stays 13/9 wide and translates
 * so the preview column is centered (invisible side panes act as gutters).
 *
 * Shared by resume builder and cover letter builder.
 */

export type BuilderViewMode = 'content' | 'designer' | 'preview';

export const DEFAULT_BUILDER_VIEW_MODE: BuilderViewMode = 'content';

export function openBuilderSide(
  _mode: BuilderViewMode,
  side: 'content' | 'designer'
): BuilderViewMode {
  return side;
}

/** Collapse the active side pane → preview-only. No-op if already preview. */
export function closeBuilderSide(mode: BuilderViewMode): BuilderViewMode {
  if (mode === 'preview') return mode;
  return 'preview';
}

/**
 * Escape from design returns to content (original behavior).
 * Preview and content are unchanged.
 */
export function escapeBuilderViewMode(mode: BuilderViewMode): BuilderViewMode {
  if (mode === 'designer') return 'content';
  return mode;
}

export function isBuilderPreviewOnly(mode: BuilderViewMode): boolean {
  return mode === 'preview';
}

export function isBuilderDesignerActive(mode: BuilderViewMode): boolean {
  return mode === 'designer';
}

/** Design edge tab — shown whenever design is not the active side. */
export function isDesignEdgeTabVisible(mode: BuilderViewMode): boolean {
  return mode !== 'designer';
}

/** Content edge tab — shown whenever content is not the active side. */
export function isContentEdgeTabVisible(mode: BuilderViewMode): boolean {
  return mode !== 'content';
}

export function builderSideCollapseLabel(mode: BuilderViewMode): string | null {
  if (mode === 'content') return 'Hide content';
  if (mode === 'designer') return 'Hide design';
  return null;
}
