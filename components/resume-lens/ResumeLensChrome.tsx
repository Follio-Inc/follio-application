'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  buildResumeLens,
  validateJobDescription,
  type LensProfile,
  type ResumeLensResult,
} from '@/lib/resume-lens';
import { readStoredJobDescription, writeStoredJobDescription } from '@/lib/resume-lens/storage';

type Panel = 'idle' | 'compose' | 'active';

interface ResumeLensChromeProps {
  profile: LensProfile;
  lens: ResumeLensResult | null;
  onLensChange: (lens: ResumeLensResult | null) => void;
}

export function ResumeLensChrome({ profile, lens, onLensChange }: ResumeLensChromeProps) {
  const fieldId = useId();
  const errorId = useId();
  const [panel, setPanel] = useState<Panel>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    const stored = readStoredJobDescription();
    if (stored) {
      const parsed = validateJobDescription(stored);
      if (parsed.ok) {
        setDraft(parsed.jd);
        onLensChange(buildResumeLens(profileRef.current, parsed.jd));
        setPanel('active');
      }
    }
    setHydrated(true);
  }, [profile.id, onLensChange]);

  const applyJd = useCallback(
    (raw: string) => {
      const parsed = validateJobDescription(raw);
      if (!parsed.ok) {
        setError(parsed.message);
        setPanel('compose');
        return;
      }
      setError(null);
      const next = buildResumeLens(profile, parsed.jd);
      writeStoredJobDescription(parsed.jd);
      onLensChange(next);
      setDraft(parsed.jd);
      setPanel('active');
    },
    [onLensChange, profile]
  );

  const clearLens = useCallback(() => {
    writeStoredJobDescription(null);
    onLensChange(null);
    setError(null);
    setDraft('');
    setPanel('idle');
  }, [onLensChange]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    applyJd(draft);
  };

  const onMetaEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      applyJd(draft);
    }
  };

  if (!hydrated) {
    return <div className="resume-lens-ui print:hidden" aria-hidden />;
  }

  if (panel === 'idle') {
    return (
      <div className="resume-lens-ui mb-3 print:hidden">
        <button
          type="button"
          onClick={() => setPanel('compose')}
          className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Read against a role
        </button>
      </div>
    );
  }

  if (panel === 'active') {
    if (!lens) {
      return <div className="resume-lens-ui print:hidden" aria-hidden />;
    }
    return (
      <div
        className="resume-lens-ui sticky z-20 mb-3 print:hidden"
        style={{ top: 'calc(var(--follio-chrome-offset, 0px) + 8px)' }}
      >
        <div className="rounded-xl border border-border/60 bg-background/90 px-4 py-2.5 shadow-sm backdrop-blur-md">
          {lens.jobTitleHint ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Reading as {lens.jobTitleHint}
            </p>
          ) : (
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Reading against this role
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[13px] leading-5 text-foreground">{lens.strip}</p>
            <div className="flex shrink-0 items-center gap-3 text-[12px]">
              <button
                type="button"
                onClick={() => {
                  setPanel('compose');
                  setError(null);
                }}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Change role
              </button>
              <button
                type="button"
                onClick={clearLens}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="resume-lens-ui mb-3 print:hidden"
      style={{ top: 'calc(var(--follio-chrome-offset, 0px) + 8px)' }}
    >
      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm"
      >
        <p className="text-sm font-medium text-foreground">Read against a role</p>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Paste a job description. Matching evidence is highlighted on this resume — the document
          itself does not change.
        </p>
        <label htmlFor={fieldId} className="sr-only">
          Job description
        </label>
        <Textarea
          id={fieldId}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onMetaEnter}
          placeholder="Paste the role’s responsibilities and requirements…"
          className="mt-3 min-h-[8.5rem] resize-y"
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        {error ? (
          <p id={errorId} className="mt-2 text-[13px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm">
            Highlight matches
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              if (lens) {
                setPanel('active');
                setError(null);
                return;
              }
              setPanel('idle');
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
