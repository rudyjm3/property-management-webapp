'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isTenantAccount, setIsTenantAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Supabase delivers recovery sessions via URL hash fragments
    // (#access_token=...&refresh_token=...&type=recovery).
    // createBrowserClient does not auto-process hash params, so we do it manually.
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && refreshToken && (type === 'recovery' || type === 'invite')) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data: { session }, error }) => {
          if (error || !session) {
            setError('Reset link is invalid or expired. Request a new password reset email.');
            return;
          }
          // Clear tokens from the URL bar without a reload
          window.history.replaceState(null, '', window.location.pathname);
          setIsTenantAccount(!!session.user.user_metadata?.tenantId);
          setReady(true);
        });
      return;
    }

    // No hash tokens — fall back to existing session (e.g. came via /auth/callback)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsTenantAccount(!!session.user.user_metadata?.tenantId);
        setReady(true);
      } else {
        setError('Reset link is invalid or expired. Request a new password reset email.');
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push('/login'), 1200);
  }

  return (
    <div className="card">
      <div className="card-body">
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '10px', textAlign: 'center' }}>
          Set a new password
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginBottom: '24px', fontSize: '14px' }}>
          Enter your new password below.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {success ? (
          <div style={{ textAlign: 'center' }}>
            {isTenantAccount ? (
              <>
                <p style={{ color: 'var(--color-success)', marginBottom: '12px' }}>Password set successfully!</p>
                <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                  Open the <strong>PropFlow</strong> mobile app and sign in with your email and new password.
                </p>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--color-success)', marginBottom: '12px' }}>Password updated successfully.</p>
                <Link href="/login" style={{ color: 'var(--color-primary)' }}>Continue to sign in</Link>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                disabled={!ready || loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Re-enter password"
                disabled={!ready || loading}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px', textAlign: 'center' }} disabled={!ready || loading}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
          <Link href="/login" style={{ color: 'var(--color-primary)' }}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
