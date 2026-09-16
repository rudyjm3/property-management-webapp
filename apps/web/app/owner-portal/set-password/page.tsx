'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function OwnerPortalSetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Supabase delivers recovery/invite sessions via URL hash fragments
    // (#access_token=...&refresh_token=...&type=recovery|invite).
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && refreshToken && (type === 'recovery' || type === 'invite')) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data: { session }, error }) => {
          if (error || !session) {
            setError('Invite link is invalid or expired. Ask your property manager to resend it.');
            return;
          }
          window.history.replaceState(null, '', window.location.pathname);
          setReady(true);
        });
      return;
    }

    // No hash tokens — fall back to existing session (e.g. came via /auth/callback)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true);
      } else {
        setError('Invite link is invalid or expired. Ask your property manager to resend it.');
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

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push('/owner-portal'), 1000);
  }

  return (
    <div className="card">
      <div className="card-body">
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '10px', textAlign: 'center' }}>
          Set your owner portal password
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginBottom: '24px', fontSize: '14px' }}>
          Choose a password to access your properties, statements, and reports.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--color-success)', marginBottom: '12px' }}>Password set successfully!</p>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Taking you to your dashboard…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="password">Password</label>
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

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={!ready || loading}>
              {loading ? 'Setting password…' : 'Set password & continue'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
          <Link href="/owner-portal/login" style={{ color: 'var(--color-primary)' }}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
