import { containsHtmlFormatting, sanitizeRichHtml } from '@/lib/html-utils';

/**
 * Render a string that may contain HTML formatting from the rich text editor.
 * Falls back to plain text rendering when no HTML is detected.
 */
export function RichHtml({
  html,
  className,
  as: Tag = 'div',
}: {
  html: string;
  className?: string;
  as?: 'div' | 'p' | 'span';
}) {
  if (containsHtmlFormatting(html)) {
    return (
      <Tag className={className} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }} />
    );
  }
  return <Tag className={className}>{html}</Tag>;
}
