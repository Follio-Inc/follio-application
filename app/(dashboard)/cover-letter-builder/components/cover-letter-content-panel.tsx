'use client';

import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CoverLetterContent } from '@/lib/cover-letter';
import { cn } from '@/lib/utils';

import { useCoverLetterStore } from '../cover-letter-store';

const CONTENT_SAVE_DEBOUNCE_MS = 700;

type ContentCategory = 'header' | 'body' | 'footer';

const CATEGORIES: { id: ContentCategory; label: string; description: string }[] = [
  { id: 'header', label: 'Header', description: 'Title, date, and recipient' },
  { id: 'body', label: 'Body', description: 'Greeting and letter text' },
  { id: 'footer', label: 'Footer', description: 'Closing and signature' },
];

/**
 * Cover letter content editor — Header / Body / Footer categories,
 * mirroring the resume builder section grouping.
 */
export function CoverLetterContentPanel() {
  const draft = useCoverLetterStore((s) => s.draft);
  const updateContent = useCoverLetterStore((s) => s.updateContent);
  const updateTitle = useCoverLetterStore((s) => s.updateTitle);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState<ContentCategory | null>('header');

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const persist = useCallback(
    (patch: { title?: string; content?: Partial<CoverLetterContent> }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await fetch(`/api/cover-letters/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      }, CONTENT_SAVE_DEBOUNCE_MS);
    },
    [draft.id]
  );

  const onTitleChange = (title: string) => {
    updateTitle(title);
    persist({ title });
  };

  const onField = <K extends keyof CoverLetterContent>(key: K, value: CoverLetterContent[K]) => {
    updateContent({ [key]: value });
    persist({ content: { [key]: value } });
  };

  const c = draft.content;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Content</h2>
        <p className="text-[11px] text-muted-foreground">Write your cover letter</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.id}
            label={cat.label}
            description={cat.description}
            expanded={expanded === cat.id}
            onToggle={() => setExpanded((prev) => (prev === cat.id ? null : cat.id))}
          >
            {cat.id === 'header' ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cl-title" className="text-[12px]">
                    Document title
                  </Label>
                  <Input
                    id="cl-title"
                    value={draft.title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    placeholder="Untitled Cover Letter"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cl-date" className="text-[12px]">
                    Date
                  </Label>
                  <Input
                    id="cl-date"
                    value={c.date}
                    onChange={(e) => onField('date', e.target.value)}
                    placeholder="July 25, 2026"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cl-recipient" className="text-[12px]">
                      Recipient
                    </Label>
                    <Input
                      id="cl-recipient"
                      value={c.recipientName}
                      onChange={(e) => onField('recipientName', e.target.value)}
                      placeholder="Jordan Lee"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cl-recipient-title" className="text-[12px]">
                      Title
                    </Label>
                    <Input
                      id="cl-recipient-title"
                      value={c.recipientTitle}
                      onChange={(e) => onField('recipientTitle', e.target.value)}
                      placeholder="Hiring Manager"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cl-company" className="text-[12px]">
                    Company
                  </Label>
                  <Input
                    id="cl-company"
                    value={c.company}
                    onChange={(e) => onField('company', e.target.value)}
                    placeholder="Acme Inc."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cl-address" className="text-[12px]">
                    Company address
                  </Label>
                  <Textarea
                    id="cl-address"
                    value={c.companyAddress}
                    onChange={(e) => onField('companyAddress', e.target.value)}
                    placeholder="123 Market St&#10;San Francisco, CA"
                    rows={2}
                    className="resize-none text-[13px]"
                  />
                </div>
              </div>
            ) : null}

            {cat.id === 'body' ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cl-greeting" className="text-[12px]">
                    Greeting
                  </Label>
                  <Input
                    id="cl-greeting"
                    value={c.greeting}
                    onChange={(e) => onField('greeting', e.target.value)}
                    placeholder="Dear Hiring Manager,"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cl-body" className="text-[12px]">
                    Letter
                  </Label>
                  <Textarea
                    id="cl-body"
                    value={c.body}
                    onChange={(e) => onField('body', e.target.value)}
                    placeholder="Write your letter. Separate paragraphs with a blank line."
                    rows={12}
                    className="min-h-[220px] resize-y text-[13px] leading-relaxed"
                  />
                </div>
              </div>
            ) : null}

            {cat.id === 'footer' ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cl-closing" className="text-[12px]">
                    Closing
                  </Label>
                  <Input
                    id="cl-closing"
                    value={c.closing}
                    onChange={(e) => onField('closing', e.target.value)}
                    placeholder="Sincerely,"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cl-signature" className="text-[12px]">
                    Your name
                  </Label>
                  <Input
                    id="cl-signature"
                    value={c.signatureName}
                    onChange={(e) => onField('signatureName', e.target.value)}
                    placeholder="Alex Rivera"
                  />
                </div>
              </div>
            ) : null}
          </CategoryCard>
        ))}
      </div>
    </div>
  );
}

function CategoryCard({
  label,
  description,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const buttonId = useId();

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-card transition-colors hover:border-border">
      <button
        type="button"
        id={buttonId}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors',
          expanded && 'border-b border-border/60'
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200',
            expanded && '-rotate-180 text-foreground'
          )}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="bg-muted/30 px-4 py-4"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
