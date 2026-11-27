import { NextResponse } from 'next/server';

/**
 * Send the browser to the client callback with GET.
 * The consent form is a POST. A 307 redirect would replay that POST, and
 * Claude's callback answers 405 Method Not Allowed. 303 switches to GET.
 */
export function oauthSeeOther(redirectUri: string, params: Record<string, string>): NextResponse {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}
