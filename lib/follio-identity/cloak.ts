/**
 * Contact values on a public Follio must not appear as plaintext in HTML.
 * Harvesters regex for `@` and `mailto:`; they do not execute the click that
 * unveils these tokens. Visible copy still uses a real `@` — never "at".
 */

const PREFIX = 'v1.';

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Reversible token with no `@` and no contiguous original number. */
export function cloakContactValue(value: string): string {
  return `${PREFIX}${toBase64(value).split('').reverse().join('')}`;
}

/**
 * Restores a token produced by `cloakContactValue`. Plaintext is returned as-is
 * so older snapshots and tests keep working if they skip cloaking.
 */
export function unveilContactValue(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  try {
    return fromBase64(value.slice(PREFIX.length).split('').reverse().join(''));
  } catch {
    return value;
  }
}
