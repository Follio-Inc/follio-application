import { createHash, timingSafeEqual } from 'crypto';

export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;

  const digest = createHash('sha256').update(codeVerifier).digest();
  const computed = digest.toString('base64url');

  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
