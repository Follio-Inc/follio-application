'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useCopyElementText
 *
 * Copies the visible text content (`innerText`) of a referenced DOM
 * element to the clipboard. Uses the modern Clipboard API where
 * available and falls back to `document.execCommand('copy')` for
 * non-secure contexts (e.g. http://localhost over LAN).
 *
 * Returns a `copied` flag that flips to `true` for `feedbackMs`
 * milliseconds after a successful copy, suitable for driving a
 * "Copied!" affordance on a button.
 *
 * Shared between the public resume actions cluster and the builder's
 * preview floating actions so both surfaces behave identically.
 */
export function useCopyElementText(
  ref: React.RefObject<HTMLElement | null>,
  feedbackMs = 2000
): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    const text = el.innerText;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), feedbackMs);
    } catch (err) {
      console.error('Failed to copy element text:', err);
    }
  }, [ref, feedbackMs]);

  return { copied, copy };
}
