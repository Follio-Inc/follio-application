'use client';

/**
 * Medium-style portfolio rich text editor.
 *
 * Constrained blocks (not Word): Body · Heading · Quote, plus alignment and
 * light emphasis. Used for section Subtext and long-form entry fields.
 */

import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Italic,
  Quote,
  Type,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { sanitizePortfolioHtml, toPortfolioEditorHtml } from '@/lib/portfolio/rich-html';
import { cn } from '@/lib/utils';

type BlockStyle = 'paragraph' | 'heading' | 'quote';

interface PortfolioRichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  disabled?: boolean;
}

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
          className="h-7 gap-1 px-1.5 text-[11px] font-medium"
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

function activeBlock(editor: NonNullable<ReturnType<typeof useEditor>>): BlockStyle {
  if (editor.isActive('blockquote')) return 'quote';
  if (editor.isActive('heading', { level: 2 }) || editor.isActive('heading', { level: 3 })) {
    return 'heading';
  }
  return 'paragraph';
}

function setBlockStyle(editor: NonNullable<ReturnType<typeof useEditor>>, style: BlockStyle) {
  const chain = editor.chain().focus();
  if (style === 'paragraph') {
    if (editor.isActive('blockquote')) chain.lift('blockquote');
    chain.setParagraph().run();
    return;
  }
  if (style === 'heading') {
    if (editor.isActive('blockquote')) chain.lift('blockquote');
    chain.setHeading({ level: 2 }).run();
    return;
  }
  // Quote
  if (editor.isActive('heading')) {
    chain.setParagraph();
  }
  chain.toggleBlockquote().run();
}

export function PortfolioRichTextEditor({
  value,
  onChange,
  placeholder = 'Write something…',
  className,
  minHeight = '120px',
  disabled = false,
}: PortfolioRichTextEditorProps) {
  const isInternalUpdate = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
        defaultAlignment: 'left',
      }),
    ],
    content: toPortfolioEditorHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          'portfolio-rich-editor max-w-none focus:outline-none',
          'px-3 py-2.5 text-sm leading-relaxed'
        ),
        style: `min-height: ${minHeight}`,
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
    },
    onUpdate: ({ editor: ed }) => {
      isInternalUpdate.current = true;
      onChange(sanitizePortfolioHtml(ed.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const next = toPortfolioEditorHtml(value);
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next || '', { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  const block = activeBlock(editor);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-input bg-background shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border/50 bg-muted/25 px-1.5 py-1">
          <ToolbarButton
            pressed={block === 'paragraph'}
            onPressedChange={() => setBlockStyle(editor, 'paragraph')}
            tooltip="Body"
            disabled={disabled}
          >
            <Type className="h-3.5 w-3.5" />
            Body
          </ToolbarButton>
          <ToolbarButton
            pressed={block === 'heading'}
            onPressedChange={() => setBlockStyle(editor, 'heading')}
            tooltip="Heading"
            disabled={disabled}
          >
            <Heading2 className="h-3.5 w-3.5" />
            Heading
          </ToolbarButton>
          <ToolbarButton
            pressed={block === 'quote'}
            onPressedChange={() => setBlockStyle(editor, 'quote')}
            tooltip="Quote"
            disabled={disabled}
          >
            <Quote className="h-3.5 w-3.5" />
            Quote
          </ToolbarButton>

          <span className="mx-1 h-4 w-px bg-border" />

          <ToolbarButton
            pressed={editor.isActive({ textAlign: 'left' })}
            onPressedChange={() => editor.chain().focus().setTextAlign('left').run()}
            tooltip="Align left"
            disabled={disabled}
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={editor.isActive({ textAlign: 'center' })}
            onPressedChange={() => editor.chain().focus().setTextAlign('center').run()}
            tooltip="Align center"
            disabled={disabled}
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={editor.isActive({ textAlign: 'right' })}
            onPressedChange={() => editor.chain().focus().setTextAlign('right').run()}
            tooltip="Align right"
            disabled={disabled}
          >
            <AlignRight className="h-3.5 w-3.5" />
          </ToolbarButton>

          <span className="mx-1 h-4 w-px bg-border" />

          <ToolbarButton
            pressed={editor.isActive('bold')}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
            tooltip="Bold"
            disabled={disabled}
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={editor.isActive('italic')}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
            tooltip="Italic"
            disabled={disabled}
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            pressed={editor.isActive('underline')}
            onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
            tooltip="Underline"
            disabled={disabled}
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>

        <EditorContent editor={editor} />
      </div>
    </TooltipProvider>
  );
}
