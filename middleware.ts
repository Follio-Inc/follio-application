import { extractHandleFromHost, isMainDomain } from '@/lib/url';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

type SubdomainRewriteRequest = {
  nextUrl: {
    pathname: string;
    clone(): URL;
  };
  headers: { get(name: string): string | null };
};

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/builder(.*)',
  '/onboarding(.*)',
  '/settings(.*)',
  '/data-sources(.*)',
  '/share',
  '/me(.*)',
  '/resume-preview(.*)',
  '/resumes(.*)',
]);

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

export function getSubdomainRewriteUrl(req: SubdomainRewriteRequest) {
  const pathname = req.nextUrl.pathname;
  const hostname = req.headers.get('host') || '';

  if (isMainDomain(hostname)) return null;
  if (pathname.startsWith('/api') || pathname.startsWith('/trpc')) return null;

  const handle = extractHandleFromHost(hostname);
  if (!handle) return null;

  const url = req.nextUrl.clone();

  if (pathname === '/r' || pathname === '/r/') {
    url.pathname = `/u/${handle}/resume`;
    return url;
  }

  if (pathname === '/l' || pathname === '/l/') {
    url.pathname = `/u/${handle}/links`;
    return url;
  }

  if (pathname === '/' || pathname === '') {
    url.pathname = `/u/${handle}`;
    return url;
  }

  url.pathname = `/u/${handle}${pathname}`;
  return url;
}

export default clerkMiddleware(async (auth, req) => {
  // Allow Clerk's internal sign-out requests without interference
  // This prevents "Failed to fetch" errors during sign-out
  const pathname = req.nextUrl.pathname;
  if (pathname.includes('clerk') || pathname.includes('__clerk')) {
    return NextResponse.next();
  }

  // --- Subdomain routing ---
  // Detect user subdomains: username.follio.me → rewrite to /u/username
  const rewriteUrl = getSubdomainRewriteUrl(req);
  if (rewriteUrl) {
    return NextResponse.rewrite(rewriteUrl);
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
