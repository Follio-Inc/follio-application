import { Extension } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Bullet-mode document policy for experience highlights and education notes.
 *
 * Empty content is a paragraph — never a list — so the editor does not show a
 * lone bullet. As soon as there is text, top-level paragraphs become list items.
 * Deleting the last character unwraps back to a paragraph.
 */

export type BulletModeBlock = 'bulletList' | 'orderedList' | 'paragraph' | 'other';

export function resolveBulletModeAction(input: {
  hasText: boolean;
  blocks: BulletModeBlock[];
}): 'unwrap' | 'wrap-paragraphs' | null {
  const hasList = input.blocks.some((block) => block === 'bulletList' || block === 'orderedList');

  if (!input.hasText) {
    return hasList ? 'unwrap' : null;
  }

  return input.blocks.some((block) => block === 'paragraph') ? 'wrap-paragraphs' : null;
}

function blockKind(
  node: Node,
  types: {
    bulletList?: Node['type'];
    orderedList?: Node['type'];
    paragraph?: Node['type'];
  }
): BulletModeBlock {
  if (types.bulletList && node.type === types.bulletList) return 'bulletList';
  if (types.orderedList && node.type === types.orderedList) return 'orderedList';
  if (types.paragraph && node.type === types.paragraph) return 'paragraph';
  return 'other';
}

export const BulletMode = Extension.create({
  name: 'bulletMode',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('bulletMode'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const { doc, schema } = newState;
          const bulletListType = schema.nodes.bulletList;
          const orderedListType = schema.nodes.orderedList;
          const listItemType = schema.nodes.listItem;
          const paragraphType = schema.nodes.paragraph;
          if (!bulletListType || !listItemType || !paragraphType) return null;

          const blocks: BulletModeBlock[] = [];
          doc.forEach((node) => {
            blocks.push(
              blockKind(node, {
                bulletList: bulletListType,
                orderedList: orderedListType,
                paragraph: paragraphType,
              })
            );
          });

          const action = resolveBulletModeAction({
            hasText: doc.textContent.trim().length > 0,
            blocks,
          });

          if (action === 'unwrap') {
            return newState.tr.replaceWith(0, doc.content.size, paragraphType.create());
          }

          if (action === 'wrap-paragraphs') {
            const ranges: { from: number; to: number; node: Node }[] = [];
            doc.forEach((node, pos) => {
              if (node.type === paragraphType && node.textContent.trim().length > 0) {
                ranges.push({ from: pos, to: pos + node.nodeSize, node });
              }
            });
            if (ranges.length === 0) return null;

            const tr = newState.tr;
            for (let i = ranges.length - 1; i >= 0; i -= 1) {
              const range = ranges[i];
              tr.replaceWith(
                range.from,
                range.to,
                bulletListType.create(null, listItemType.create(null, range.node))
              );
            }
            return tr;
          }

          return null;
        },
      }),
    ];
  },
});
