import { z } from 'zod';

export const oauthRegisterSchema = z.object({
  client_name: z.string().max(120).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  token_endpoint_auth_method: z
    .enum(['none', 'client_secret_post', 'client_secret_basic'])
    .optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
});

export type OAuthRegisterInput = z.infer<typeof oauthRegisterSchema>;

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'http:' && LOCALHOST_HOSTS.has(parsed.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

export function redirectUriMatches(registered: string[], candidate: string): boolean {
  return registered.includes(candidate);
}
