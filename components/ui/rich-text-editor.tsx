'use client';

import BulletList from '@tiptap/extension-bullet-list';
import ListItem from '@tiptap/extension-list-item';
import OrderedList from '@tiptap/extension-ordered-list';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Circle,
  Italic,
  List,
  ListOrdered,
  Minus,
  Redo2,
  Square,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import { Toggle } from '@/components/ui/toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Separator } from './separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type BulletStyle = 'disc' | 'circle' | 'square' | 'dash';

interface RichTextEditorProps {
  /** HTML content */
  value: string;
  /** Called with the updated HTML string */
  onChange: (html: string) => void;
  /** Called when the editor loses focus (after content is current) */
  onBlur?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Additional class for the editor container */
  className?: string;
  /** Min height for the editable area */
  minHeight?: string;
  /** Disabled state */
  disabled?: boolean;
  /**
   * When true, the editor enforces bullet-list mode:
   * - Content starts in a bullet list
   * - Paragraphs are auto-converted to bullet items on input
   *
   * Use for fields that represent bullet points (experience highlights, etc.)
   */
  bulletMode?: boolean;
}

// ─────────────────────────────────────────────
// Custom BulletList extension with `bulletStyle` attribute
//
// Tiptap's built-in BulletList doesn't register a `class` or style
// attribute, so `updateAttributes` for classes silently fails.
// This extension adds a proper `bulletStyle` schema attribute that
// persists to HTML as `data-bullet-style` and a corresponding CSS class.
// ─────────────────────────────────────────────

const CustomBulletList = BulletList.extend({
  addAttributes() {
    return {
      bulletStyle: {
        default: 'disc',
        parseHTML: (element: HTMLElement) => {
          // Check data attribute first
          const dataAttr = element.getAttribute('data-bullet-style');
          if (dataAttr) return dataAttr;
          // Fallback: infer from existing class (backward compat)
          const cls = element.className || '';
          const match = cls.match(/bullet-style-(\w+)/);
          return match ? match[1] : 'disc';
        },
        renderHTML: (attributes: Record<string, string>) => ({
          'data-bullet-style': attributes.bulletStyle,
          class: `bullet-style-${attributes.bulletStyle}`,
        }),
      },
    };
  },
});

// ─────────────────────────────────────────────
// Bullet style options
// ─────────────────────────────────────────────

const BULLET_STYLES: { style: BulletStyle; icon: React.ElementType; label: string }[] = [
  { style: 'disc', icon: Circle, label: 'Filled Circle' },
  { style: 'circle', icon: Circle, label: 'Open Circle' },
  { style: 'square', icon: Square, label: 'Square' },
  { style: 'dash', icon: Minus, label: 'Dash' },
];

// ─────────────────────────────────────────────
// Toolbar button helper
// ─────────────────────────────────────────────

function ToolbarButton({
  pressed,
  onPressedChange,
  tooltip,
  children,
  disabled,
}: {
  pressed: boolean;
  onPressedChange: () => void;
  tooltip: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={pressed}
          onPressedChange={onPressedChange}
          disabled={disabled}
          className="h-7 w-7 p-0"
        >
          {children}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  minHeight = '160px',
  disabled = false,
  bulletMode = false,
}: RichTextEditorProps) {
  // Tracks whether the latest value change came from the editor itself.
  // When true, the external-sync effect skips the next value comparison
  // to avoid fighting the editor's own output (and resetting the cursor).
  const isInternalUpdate = useRef(false);

  const EMPTY_BULLET_HTML =
    '<ul data-bullet-style="disc" class="rich-text-bullets bullet-style-disc"><li><p></p></li></ul>';

  const initialContent = value || (bulletMode ? EMPTY_BULLET_HTML : '');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Underline,
      CustomBulletList.configure({
        HTMLAttributes: { class: 'rich-text-bullets' },
      }),
      OrderedList.configure({
        HTMLAttributes: { class: 'rich-text-ordered' },
      }),
      ListItem,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        defaultAlignment: 'justify',
      }),
    ],
    content: initialContent,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none',
          'px-3 py-2 text-sm'
        ),
        style: `min-height: ${minHeight}`,
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
    },
    onUpdate: ({ editor: ed }) => {
      isInternalUpdate.current = true;
      onChange(ed.getHTML());
    },
    onBlur: ({ event }) => {
      const related = event.relatedTarget as Node | null;
      const root = (event.target as HTMLElement | null)?.closest?.('[data-rich-text-editor]');
      if (related && root?.contains(related)) return;
      onBlur?.();
    },
  });

  // Sync external value changes (e.g., discard, undo, switching to a different entry)
  useEffect(() => {
    if (!editor) return;

    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    const current = editor.getHTML();
    if (current !== value) {
      const newContent = value || (bulletMode ? EMPTY_BULLET_HTML : '');
      editor.commands.setContent(newContent, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Bullet mode: when the cursor escapes to a bare paragraph (e.g. after
  // pressing Enter twice or Backspace at the start), wrap it back into
  // a bullet list.  Only do this on user-driven "selectionUpdate" events
  // (not programmatic transactions) to avoid infinite loops.
  useEffect(() => {
    if (!editor || !bulletMode) return;

    const handler = () => {
      if (
        editor.isActive('paragraph') &&
        !editor.isActive('bulletList') &&
        !editor.isActive('orderedList')
      ) {
        editor.chain().toggleBulletList().run();
      }
    };

    editor.on('selectionUpdate', handler);
    return () => {
      editor.off('selectionUpdate', handler);
    };
  }, [editor, bulletMode]);

  const setBulletStyle = useCallback(
    (style: BulletStyle) => {
      if (!editor) return;

      // Ensure we have a bullet list first
      if (!editor.isActive('bulletList')) {
        editor.chain().focus().toggleBulletList().run();
      }

      // Update the registered `bulletStyle` attribute on the active bulletList node.
      // This works because CustomBulletList defines `bulletStyle` in its schema,
      // so `updateAttributes` persists it and `renderHTML` produces the CSS class.
      editor.chain().focus().updateAttributes('bulletList', { bulletStyle: style }).run();
    },
    [editor]
  );

  if (!editor) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-rich-text-editor
        className={cn(
          'rounded-lg border border-input shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border/40 bg-muted/30 px-1.5 py-1">
          {/* Text formatting */}
          <ToolbarButton
            pressed={editor.isActive('bold')}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
            tooltip="Bold (Ctrl+B)"
            disabled={disabled}
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={editor.isActive('italic')}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
            tooltip="Italic (Ctrl+I)"
            disabled={disabled}
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={editor.isActive('underline')}
            onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
            tooltip="Underline (Ctrl+U)"
            disabled={disabled}
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* Lists */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Toggle
                    size="sm"
                    pressed={editor.isActive('bulletList')}
                    className="h-7 w-7 p-0"
                    disabled={disabled}
                  >
                    <List className="h-3.5 w-3.5" />
                  </Toggle>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Bullet List
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              {BULLET_STYLES.map(({ style, icon: Icon, label }) => (
                <DropdownMenuItem
                  key={style}
                  onSelect={() => setBulletStyle(style)}
                  className="gap-2 text-xs"
                >
                  <Icon
                    className={cn(
                      'h-3 w-3',
                      style === 'circle' && 'fill-none',
                      style === 'disc' && 'fill-current',
                      style === 'square' && 'fill-current'
                    )}
                  />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolbarButton
            pressed={editor.isActive('orderedList')}
            onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
            tooltip="Numbered List"
            disabled={disabled}
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* Alignment */}
          <ToolbarButton
            pressed={editor.isActive({ textAlign: 'left' })}
            onPressedChange={() => editor.chain().focus().setTextAlign('left').run()}
            tooltip="Align Left"
            disabled={disabled}
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={editor.isActive({ textAlign: 'center' })}
            onPressedChange={() => editor.chain().focus().setTextAlign('center').run()}
            tooltip="Align Center"
            disabled={disabled}
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={editor.isActive({ textAlign: 'right' })}
            onPressedChange={() => editor.chain().focus().setTextAlign('right').run()}
            tooltip="Align Right"
            disabled={disabled}
          >
            <AlignRight className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={
              editor.isActive({ textAlign: 'justify' }) ||
              (!editor.isActive({ textAlign: 'left' }) &&
                !editor.isActive({ textAlign: 'center' }) &&
                !editor.isActive({ textAlign: 'right' }))
            }
            onPressedChange={() => editor.chain().focus().setTextAlign('justify').run()}
            tooltip="Justify"
            disabled={disabled}
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* Undo/Redo */}
          <ToolbarButton
            pressed={false}
            onPressedChange={() => editor.chain().focus().undo().run()}
            tooltip="Undo (Ctrl+Z)"
            disabled={disabled || !editor.can().undo()}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={false}
            onPressedChange={() => editor.chain().focus().redo().run()}
            tooltip="Redo (Ctrl+Shift+Z)"
            disabled={disabled || !editor.can().redo()}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>

        {/* Editor content area */}
        <EditorContent editor={editor} />
      </div>
    </TooltipProvider>
  );
}
