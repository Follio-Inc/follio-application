import { createHash, randomBytes, timingSafeEqual } from 'crypto';

import { ACCESS_TOKEN_PREFIX, CLIENT_ID_PREFIX } from './constants';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateAccessToken(): string {
  return `${ACCESS_TOKEN_PREFIX}${generateOpaqueToken(32)}`;
}

export function generateClientId(): string {
  return `${CLIENT_ID_PREFIX}${generateOpaqueToken(16)}`;
}

export function hashSecret(value: string): string {
  return sha256Hex(value);
}

export function secretsMatch(plain: string, hashed: string): boolean {
  const digest = Buffer.from(sha256Hex(plain), 'hex');
  const expected = Buffer.from(hashed, 'hex');
  if (digest.length !== expected.length) return false;
  return timingSafeEqual(digest, expected);
}
