import { describe, expect, it } from 'vitest';

import {
  getHeaderLayoutSectionLabel,
  isPhotoBeforeText,
  resolveHeaderComposition,
} from '@/lib/resume/header-layout';

describe('resolveHeaderComposition', () => {
  it('uses text mode when photo is off', () => {
    expect(resolveHeaderComposition(false, 'photo-left')).toBe('text');
    expect(resolveHeaderComposition(false, 'photo-right')).toBe('text');
  });

  it('uses explicit photo compositions when photo is on', () => {
    expect(resolveHeaderComposition(true, 'photo-left')).toBe('photo-left');
    expect(resolveHeaderComposition(true, 'photo-right')).toBe('photo-right');
    expect(resolveHeaderComposition(true, 'photo-above')).toBe('photo-above');
    expect(resolveHeaderComposition(true, 'photo-above-left')).toBe('photo-above-left');
  });
});

describe('isPhotoBeforeText', () => {
  it('puts photo first except for photo-right', () => {
    expect(isPhotoBeforeText('photo-left')).toBe(true);
    expect(isPhotoBeforeText('photo-above')).toBe(true);
    expect(isPhotoBeforeText('photo-above-left')).toBe(true);
    expect(isPhotoBeforeText('photo-right')).toBe(false);
    expect(isPhotoBeforeText('text')).toBe(false);
  });
});

describe('header layout labels', () => {
  it('labels the control by photo state', () => {
    expect(getHeaderLayoutSectionLabel(false)).toBe('Header Alignment');
    expect(getHeaderLayoutSectionLabel(true)).toBe('Photo placement');
  });
});
