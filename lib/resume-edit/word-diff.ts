/**
 * Word-level diff for showing an AI edit next to the original line.
 * Lines are short, so a plain longest-common-subsequence is fast enough.
 */

export type DiffPart = { kind: 'same' | 'added' | 'removed'; text: string };

function words(value: string): string[] {
  return value.match(/\s+|[^\s]+/g) ?? [];
}

function push(parts: DiffPart[], kind: DiffPart['kind'], text: string) {
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) last.text += text;
  else parts.push({ kind, text });
}

export function diffWords(before: string, after: string): DiffPart[] {
  const a = words(before);
  const b = words(after);
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(parts, 'same', a[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push(parts, 'removed', a[i]);
      i += 1;
    } else {
      push(parts, 'added', b[j]);
      j += 1;
    }
  }
  while (i < a.length) push(parts, 'removed', a[i++]);
  while (j < b.length) push(parts, 'added', b[j++]);
  return parts;
}

/**
 * One side of a diff for display: the old line with removals, or the new line
 * with additions. Spaces between two changed runs join them, so a rewritten
 * phrase reads as one highlight rather than a word-by-word patchwork.
 */
export function diffSide(parts: DiffPart[], side: 'before' | 'after'): DiffPart[] {
  const changed = side === 'before' ? 'removed' : 'added';
  const kept = parts.filter((part) => part.kind === 'same' || part.kind === changed);
  const out: DiffPart[] = [];
  kept.forEach((part, index) => {
    const bridge =
      part.kind === 'same' &&
      /^\s+$/.test(part.text) &&
      kept[index - 1]?.kind === changed &&
      kept[index + 1]?.kind === changed;
    push(out, bridge ? changed : part.kind, part.text);
  });
  return out;
}

/** True when so little of the line survives that word highlights would only add noise. */
export function isRewrite(parts: DiffPart[], threshold = 0.4): boolean {
  let same = 0;
  let before = 0;
  let after = 0;
  for (const part of parts) {
    const size = part.text.replace(/\s+/g, '').length;
    if (part.kind !== 'added') before += size;
    if (part.kind !== 'removed') after += size;
    if (part.kind === 'same') same += size;
  }
  const longest = Math.max(before, after);
  return longest > 0 && same / longest < threshold;
}
