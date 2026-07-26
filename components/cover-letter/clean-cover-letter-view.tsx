'use client';

import { ResumeFontLoader } from '@/app/u/[handle]/views/resume-font-loader';
import {
  buildCoverLetterDesignStyles,
  coverLetterBodyParagraphs,
  mergeCoverLetterContent,
  mergeCoverLetterDesign,
  type CoverLetterContent,
  type CoverLetterDesign,
} from '@/lib/cover-letter';
import {
  defaultResolvedFonts,
  getDocumentSheetWidthPx,
  isPagedPageLayout,
  resolveDocumentPageLayout,
} from '@/lib/document-design';
import { useResolvedResumeColorTheme } from '@/lib/hooks/use-resume-color-theme';
import { cn } from '@/lib/utils';

interface CleanCoverLetterViewProps {
  content: CoverLetterContent | null | undefined;
  design: CoverLetterDesign | null | undefined;
  className?: string;
}

/**
 * Canonical cover letter paper renderer — uses the same `--rd-*` token pipeline
 * and resume paper CSS surface as CleanResumeView.
 */
export function CleanCoverLetterView({ content, design, className }: CleanCoverLetterViewProps) {
  const c = mergeCoverLetterContent(content);
  const d = mergeCoverLetterDesign(design);
  const designStyles = buildCoverLetterDesignStyles(d);
  const resolvedTheme = useResolvedResumeColorTheme(d.colorTheme);
  const pageLayout = resolveDocumentPageLayout(d);
  const sheetWidth = getDocumentSheetWidthPx(pageLayout);
  const paragraphs = coverLetterBodyParagraphs(c.body);
  const fonts = defaultResolvedFonts(d);

  const recipientLines = [c.recipientName, c.recipientTitle, c.company, c.companyAddress].filter(
    (line) => line?.trim()
  );

  return (
    <>
      <ResumeFontLoader fonts={[fonts.body, fonts.name, fonts.heading]} />
      <article
        className={cn(
          'resume-paper cover-letter-paper',
          d.justifyAll && 'resume-justify-all',
          className
        )}
        data-resume-theme={resolvedTheme}
        data-resume-template="classic"
        data-page-layout={pageLayout}
        data-paged={isPagedPageLayout(pageLayout) || undefined}
        style={{
          ...designStyles,
          width: sheetWidth,
          maxWidth: '100%',
        }}
      >
        <div
          className="cover-letter-meta space-y-4"
          style={{
            fontFamily: 'var(--rd-font-body)',
            fontSize: 'var(--rd-font-size)',
            fontWeight: 'var(--rd-body-font-weight)' as unknown as number,
            fontStyle: 'var(--rd-body-font-style)' as 'normal',
            textAlign: d.justifyAll ? 'justify' : 'left',
            color: 'var(--rd-heading-color)',
          }}
        >
          {c.date ? <p className="text-foreground/80">{c.date}</p> : null}

          {recipientLines.length > 0 ? (
            <div className="space-y-0.5">
              {recipientLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}

          {c.greeting ? <p className="pt-2">{c.greeting}</p> : null}

          <div
            className={cn(
              'space-y-[var(--rd-entry-gap)] pt-1',
              // Blank body: hold a little vertical room so closing/signature sit lower.
              // Once body text exists, height follows content and the footer settles naturally.
              paragraphs.length === 0 && 'min-h-[10rem]'
            )}
          >
            {paragraphs.length > 0 ? (
              paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-wrap leading-relaxed">
                  {p}
                </p>
              ))
            ) : (
              <p className="italic text-muted-foreground/70">Start writing your letter…</p>
            )}
          </div>

          <div className="space-y-6 pt-4">
            {c.closing ? <p>{c.closing}</p> : null}
            {c.signatureName ? <p>{c.signatureName}</p> : null}
          </div>
        </div>
      </article>
    </>
  );
}
