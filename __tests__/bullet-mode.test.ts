/** @vitest-environment jsdom */

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

import { BulletMode, resolveBulletModeAction } from '@/lib/rich-text/bullet-mode';

function createBulletModeEditor(content = '') {
  return new Editor({
    extensions: [StarterKit, BulletMode],
    content,
  });
}

describe('resolveBulletModeAction', () => {
  it('does not wrap an empty paragraph — no lone bullet', () => {
    expect(resolveBulletModeAction({ hasText: false, blocks: ['paragraph'] })).toBeNull();
  });

  it('unwraps an empty bullet list back to a paragraph', () => {
    expect(resolveBulletModeAction({ hasText: false, blocks: ['bulletList'] })).toBe('unwrap');
  });

  it('unwraps an empty numbered list back to a paragraph', () => {
    expect(resolveBulletModeAction({ hasText: false, blocks: ['orderedList'] })).toBe('unwrap');
  });

  it('unwraps any empty document that still contains a list', () => {
    expect(resolveBulletModeAction({ hasText: false, blocks: ['bulletList', 'paragraph'] })).toBe(
      'unwrap'
    );
  });

  it('wraps a paragraph once there is text', () => {
    expect(resolveBulletModeAction({ hasText: true, blocks: ['paragraph'] })).toBe(
      'wrap-paragraphs'
    );
  });

  it('wraps a trailing paragraph that escaped the list', () => {
    expect(resolveBulletModeAction({ hasText: true, blocks: ['bulletList', 'paragraph'] })).toBe(
      'wrap-paragraphs'
    );
  });

  it('leaves an existing bullet list with text alone', () => {
    expect(resolveBulletModeAction({ hasText: true, blocks: ['bulletList'] })).toBeNull();
  });

  it('leaves an existing numbered list with text alone', () => {
    expect(resolveBulletModeAction({ hasText: true, blocks: ['orderedList'] })).toBeNull();
  });
});

describe('BulletMode editor', () => {
  it('starts empty without a list item', () => {
    const editor = createBulletModeEditor('');
    expect(editor.getText().trim()).toBe('');
    expect(editor.getHTML()).not.toContain('<ul');
    expect(editor.getHTML()).not.toContain('<li');
    editor.destroy();
  });

  it('unwraps stored empty bullet HTML instead of showing a lone bullet', () => {
    const editor = createBulletModeEditor('');
    editor.commands.setContent('<ul><li><p></p></li></ul>');
    expect(editor.getHTML()).not.toContain('<ul');
    expect(editor.getHTML()).not.toContain('<li');
    editor.destroy();
  });

  it('wraps the first typed characters into a bullet list', () => {
    const editor = createBulletModeEditor('');
    editor.commands.insertContent('Shipped the feature');
    expect(editor.getHTML()).toContain('<ul');
    expect(editor.getHTML()).toContain('<li');
    expect(editor.getText()).toContain('Shipped the feature');
    editor.destroy();
  });

  it('drops the list when the last character is deleted', () => {
    const editor = createBulletModeEditor('<ul><li><p>Hi</p></li></ul>');
    editor.commands.selectAll();
    editor.commands.deleteSelection();
    expect(editor.getText().trim()).toBe('');
    expect(editor.getHTML()).not.toContain('<ul');
    editor.destroy();
  });
});
