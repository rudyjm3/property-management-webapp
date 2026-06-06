'use client';

import { useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/signup-initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Failed to create account.');
        setLoading(false);
        return;
      }
    } catch {
      setError('Failed to create account. Please try again.');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✉️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
            Check your email
          </h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your
            account and set up your organization.
          </p>
          <Link href="/login" style={{ color: 'var(--color-primary)' }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body">
        <h2
          style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', textAlign: 'center' }}
        >
          Create your account
        </h2>

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '16px',
              color: '#dc2626',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              required
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px', display: 'flex', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p
          style={{
            textAlign: 'center',
            marginTop: '20px',
            fontSize: '14px',
            color: 'var(--color-text-muted)',
          }}
        >
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>

        <p
          style={{
            textAlign: 'center',
            marginTop: '12px',
            fontSize: '12px',
            color: 'var(--color-text-muted)',
          }}
        >
          By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
