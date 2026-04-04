'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import SettingsShell from '@/components/settings/SettingsShell';

interface BillingOrg {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  planTier: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeAccountId: string | null;
  stripeAccountStatus: string;
}

function labelValue(label: string, value: string | null) {
  return (
    <div className="detail-item">
      <label>{label}</label>
      <span>{value || '--'}</span>
    </div>
  );
}

export default function BillingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<BillingOrg | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await api.organizations.get();
        setOrg(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load billing settings.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <SettingsShell activeHref="/settings/billing">
      <div className="card">
        <div className="card-body">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Billing</h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
            Read-only subscription and Stripe account details for this organization.
          </p>

          {loading && <div className="loading">Loading billing data...</div>}

          {!loading && error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', color: '#dc2626', fontSize: '14px' }}>
              {error}
            </div>
          )}

          {!loading && org && (
            <>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Subscription
              </h3>
              <div className="detail-grid" style={{ marginBottom: '20px' }}>
                {labelValue('Plan Tier', org.planTier)}
                {labelValue('Subscription Status', org.subscriptionStatus)}
                {labelValue('Trial Ends', org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString() : null)}
                {labelValue('Stripe Customer ID', org.stripeCustomerId)}
                {labelValue('Stripe Subscription ID', org.stripeSubscriptionId)}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0 0 20px 0' }} />

              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Payout Account
              </h3>
              <div className="detail-grid" style={{ marginBottom: '20px' }}>
                {labelValue('Stripe Account Status', org.stripeAccountStatus)}
                {labelValue('Stripe Account ID', org.stripeAccountId)}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0 0 20px 0' }} />

              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Billing Contact
              </h3>
              <div className="detail-grid">
                {labelValue('Organization', org.name)}
                {labelValue('Email', org.email)}
                {labelValue('Phone', org.phone)}
              </div>
            </>
          )}
        </div>
      </div>
    </SettingsShell>
  );
}
