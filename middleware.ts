import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/builder(.*)',
  '/onboarding(.*)',
  '/settings(.*)',
  '/me(.*)',
]);

// Define public routes that should never require auth
const isPublicRoute = createRouteMatcher([
  '/',
  '/u/(.*)',
  '/share/(.*)',
  '/api/export/(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow Clerk's internal sign-out requests without interference
  // This prevents "Failed to fetch" errors during sign-out
  const pathname = req.nextUrl.pathname;
  if (pathname.includes('clerk') || pathname.includes('__clerk')) {
    return NextResponse.next();
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
