import { extractHandleFromHost, isMainDomain } from '@/lib/url';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher(['/builder(.*)', '/onboarding(.*)', '/settings(.*)']);

// Define public routes that should never require auth
const isPublicRoute = createRouteMatcher([
  '/',
  '/u/(.*)',
  '/share/(.*)',
  '/api/export/(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sign-in/sso-callback',
  '/sign-up/sso-callback',
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow Clerk's internal sign-out requests without interference
  // This prevents "Failed to fetch" errors during sign-out
  const pathname = req.nextUrl.pathname;
  if (pathname.includes('clerk') || pathname.includes('__clerk')) {
    return NextResponse.next();
  }

  // --- Subdomain routing ---
  // Detect user subdomains: username.follio.me → rewrite to /u/username
  const hostname = req.headers.get('host') || '';
  if (!isMainDomain(hostname)) {
    const handle = extractHandleFromHost(hostname);
    if (handle) {
      const url = req.nextUrl.clone();

      // username.follio.me/r → /u/username/resume
      if (pathname === '/r' || pathname === '/r/') {
        url.pathname = `/u/${handle}/resume`;
        // Preserve query params (including ?key=...)
        return NextResponse.rewrite(url);
      }

      // username.follio.me/l → /u/username/links
      if (pathname === '/l' || pathname === '/l/') {
        url.pathname = `/u/${handle}/links`;
        return NextResponse.rewrite(url);
      }

      // username.follio.me → /u/username (root and any other paths)
      if (pathname === '/' || pathname === '') {
        url.pathname = `/u/${handle}`;
        return NextResponse.rewrite(url);
      }

      // username.follio.me/anything-else → pass through to /u/handle/anything
      // This allows future sub-routes under the subdomain
      url.pathname = `/u/${handle}${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // Protect dashboard and builder routes
  if (isProtectedRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(signInUrl);
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
