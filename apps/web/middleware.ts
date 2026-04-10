import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback'];
const ONBOARDING_PATH = '/onboarding';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Create a response we can modify (needed for Supabase cookie refresh)
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isOnboarding = pathname.startsWith(ONBOARDING_PATH);

  // Not logged in → redirect to login (except public paths)
  if (!user && !isPublicPath && !isOnboarding) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Logged in on a public auth page → redirect to dashboard
  // Exception: /reset-password and /auth/callback must stay accessible during recovery/invite flows
  if (user && isPublicPath && !pathname.startsWith('/reset-password') && !pathname.startsWith('/auth/callback')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - API routes
     * - Static files (/_next, /favicon, etc.)
     * - Image optimization
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
