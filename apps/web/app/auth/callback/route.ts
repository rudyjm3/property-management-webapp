import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const token = searchParams.get('token');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'invite' | 'recovery' | 'email' | 'signup' | null;
  const next = searchParams.get('next') ?? '/reset-password';

  if (!code && !token_hash && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Build the redirect response first so we can attach cookies to it
  const response = NextResponse.redirect(new URL(next, request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Set cookies on the redirect response so they reach the browser
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  let error: { message: string } | null = null;

  const otpTokenHash = token_hash || token;

  if (otpTokenHash && type) {
    // Invite links and magic links use token_hash + type verification
    const result = await supabase.auth.verifyOtp({ token_hash: otpTokenHash, type });
    error = result.error;
  } else if (code) {
    // PKCE code exchange (password reset, OAuth)
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  }

  if (error) {
    console.error('Auth callback error:', error.message);
    return NextResponse.redirect(new URL('/login?error=link_expired', request.url));
  }

  return response;
}
