'use client';

import type { KeyboardEvent, ReactNode, Ref, RefObject } from 'react';

import type { AlignStatus } from '@/services/ai/jd-align/types';

export interface DocumentMark {
  id: string;
  aspectId: string;
  start: number;
  end: number;
  status: AlignStatus;
  role: 'jd' | 'resume';
  label: string;
  note: string;
  evidenceQuote?: string;
}

interface AnnotatedDocumentProps {
  text: string;
  placeholder: string;
  editing: boolean;
  marks: DocumentMark[];
  activeAspectId: string | null;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onMetaEnter: () => void;
  onHoverAspect: (id: string | null) => void;
}

function markClass(mark: DocumentMark, active: boolean): string {
  const shared =
    'box-decoration-clone rounded-[2px] px-[2px] text-inherit [box-decoration-break:clone]';
  if (mark.role === 'resume') {
    return `${shared} bg-emerald-500/35 dark:bg-emerald-400/30`;
  }
  if (mark.status === 'missing') {
    return `${shared} cursor-pointer bg-rose-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600/70 dark:bg-rose-400/25 ${
      active ? 'bg-rose-500/40 dark:bg-rose-400/40' : 'hover:bg-rose-500/30'
    }`;
  }
  return `${shared} cursor-pointer bg-emerald-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700/70 dark:bg-emerald-400/25 ${
    active ? 'bg-emerald-500/45 dark:bg-emerald-400/40' : 'hover:bg-emerald-500/35'
  }`;
}

function markLabel(mark: DocumentMark): string {
  if (mark.status === 'missing') {
    return `${mark.label}. Not on the resume. ${mark.note}`;
  }
  if (mark.evidenceQuote) {
    return `${mark.label}. On the resume: ${mark.evidenceQuote} ${mark.note}`;
  }
  return `${mark.label}. On the resume. ${mark.note}`;
}

/**
 * One side of the comparison. Editing is a plain sheet. After a match, the
 * same words are drawn with marker spans the hover lines can find.
 */
export function AnnotatedDocument({
  text,
  placeholder,
  editing,
  marks,
  activeAspectId,
  textareaRef,
  onChange,
  onMetaEnter,
  onHoverAspect,
}: AnnotatedDocumentProps) {
  if (editing) {
    return (
      <textarea
        ref={textareaRef as Ref<HTMLTextAreaElement> | undefined}
        value={text}
        placeholder={placeholder}
        spellCheck
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            onMetaEnter();
          }
        }}
        className="h-full min-h-full w-full resize-none bg-transparent px-5 pb-8 pt-1 text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/45"
      />
    );
  }

  const ordered = [...marks].sort((a, b) => a.start - b.start || a.end - b.end);
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const mark of ordered) {
    const start = Math.max(0, mark.start);
    const end = Math.min(text.length, mark.end);
    if (end <= cursor || start >= end) continue;
    const from = Math.max(start, cursor);
    if (from > cursor) parts.push(text.slice(cursor, from));
    const active = activeAspectId === mark.aspectId;
    const interactive = mark.role === 'jd';
    parts.push(
      <mark
        key={mark.id}
        data-align-role={mark.role}
        data-aspect-id={mark.aspectId}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? markLabel(mark) : undefined}
        className={markClass(mark, active)}
        onMouseEnter={interactive ? () => onHoverAspect(mark.aspectId) : undefined}
        onMouseLeave={interactive ? () => onHoverAspect(null) : undefined}
        onFocus={interactive ? () => onHoverAspect(mark.aspectId) : undefined}
        onBlur={interactive ? () => onHoverAspect(null) : undefined}
        onClick={
          interactive
            ? () => {
                if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
                onHoverAspect(active ? null : mark.aspectId);
              }
            : undefined
        }
      >
        {text.slice(from, end)}
      </mark>
    );
    cursor = end;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  if (parts.length === 0) parts.push(text);

  return (
    <div className="whitespace-pre-wrap break-words px-5 pb-8 pt-1 text-[15px] leading-7 text-foreground/90">
      {parts}
    </div>
  );
}
