'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import SettingsShell from '@/components/settings/SettingsShell';

type ConnectAccountStatus = 'not_connected' | 'pending' | 'active' | 'restricted';

interface ConnectStatus {
  stripeAccountId: string | null;
  stripeAccountStatus: ConnectAccountStatus;
  stripeAccountDetailsSubmitted: boolean;
}

const STATUS_BADGE: Record<ConnectAccountStatus, { label: string; className: string }> = {
  not_connected: { label: 'Not Connected',       className: 'badge-danger' },
  pending:       { label: 'Pending Verification', className: 'badge-notice' },
  active:        { label: 'Active',               className: 'badge-occupied' },
  restricted:    { label: 'Restricted',           className: 'badge-danger' },
};

export default function SettingsPage() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const data = await api.connect.getStatus();
      setStatus(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load account status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleConnect() {
    setConnecting(true);
    setError('');
    try {
      const data = await api.connect.createAccountLink();
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message || 'Failed to start bank account connection.');
      setConnecting(false);
    }
  }

  return (
    <SettingsShell activeHref="/settings">
      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-body">
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Payouts &amp; Bank Account</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
            Connect your bank account to receive rent payouts via ACH. Required before tenants can pay rent online.
          </p>

          {loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading…</p>}

          {!loading && status && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Status:</span>
                <span className={`badge ${STATUS_BADGE[status.stripeAccountStatus].className}`}>
                  {STATUS_BADGE[status.stripeAccountStatus].label}
                </span>
              </div>

              {status.stripeAccountStatus === 'active' ? (
                <button className="btn btn-secondary btn-sm" onClick={handleConnect} disabled={connecting}>
                  {connecting ? 'Redirecting…' : 'Manage Bank Account'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
                  {connecting ? 'Redirecting…' : 'Connect Bank Account'}
                </button>
              )}

              {status.stripeAccountStatus === 'pending' && status.stripeAccountId && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 12 }}>
                  Your account is under review. This usually takes 1–2 business days.
                </p>
              )}
            </>
          )}

          {error && (
            <p style={{ color: 'var(--color-danger)', fontSize: 14, marginTop: 12 }}>{error}</p>
          )}
        </div>
      </div>
    </SettingsShell>
  );
}
