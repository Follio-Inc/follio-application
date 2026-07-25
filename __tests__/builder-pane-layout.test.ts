import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BUILDER_VIEW_MODE,
  builderSideCollapseLabel,
  closeBuilderSide,
  escapeBuilderViewMode,
  isBuilderDesignerActive,
  isBuilderPreviewOnly,
  isContentEdgeTabVisible,
  isDesignEdgeTabVisible,
  openBuilderSide,
} from '@/app/(dashboard)/builder/lib/pane-layout';

describe('builder view mode', () => {
  it('defaults to content', () => {
    expect(DEFAULT_BUILDER_VIEW_MODE).toBe('content');
    expect(isBuilderPreviewOnly(DEFAULT_BUILDER_VIEW_MODE)).toBe(false);
    expect(isBuilderDesignerActive(DEFAULT_BUILDER_VIEW_MODE)).toBe(false);
  });

  it('opening one side replaces the other (mutual exclusion)', () => {
    expect(openBuilderSide('content', 'designer')).toBe('designer');
    expect(openBuilderSide('designer', 'content')).toBe('content');
    expect(openBuilderSide('preview', 'designer')).toBe('designer');
    expect(openBuilderSide('preview', 'content')).toBe('content');
  });

  it('closing the active side yields preview-only', () => {
    expect(closeBuilderSide('content')).toBe('preview');
    expect(closeBuilderSide('designer')).toBe('preview');
    expect(closeBuilderSide('preview')).toBe('preview');
    expect(isBuilderPreviewOnly('preview')).toBe(true);
  });

  it('escape returns from designer to content only', () => {
    expect(escapeBuilderViewMode('designer')).toBe('content');
    expect(escapeBuilderViewMode('content')).toBe('content');
    expect(escapeBuilderViewMode('preview')).toBe('preview');
  });

  it('edge tabs match original swap plus both visible in preview', () => {
    expect(isDesignEdgeTabVisible('content')).toBe(true);
    expect(isContentEdgeTabVisible('content')).toBe(false);

    expect(isDesignEdgeTabVisible('designer')).toBe(false);
    expect(isContentEdgeTabVisible('designer')).toBe(true);

    expect(isDesignEdgeTabVisible('preview')).toBe(true);
    expect(isContentEdgeTabVisible('preview')).toBe(true);
  });

  it('collapse labels only when a side is open', () => {
    expect(builderSideCollapseLabel('content')).toBe('Hide content');
    expect(builderSideCollapseLabel('designer')).toBe('Hide design');
    expect(builderSideCollapseLabel('preview')).toBeNull();
  });
});
