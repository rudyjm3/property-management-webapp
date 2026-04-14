'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import SettingsShell from '@/components/settings/SettingsShell';

type PlanTier = 'starter' | 'pro' | 'enterprise';

interface BillingSummary {
  organization: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    planTier: PlanTier;
    subscriptionStatus: string;
    trialEndsAt: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  };
  defaultPaymentMethod: {
    type: string;
    brand?: string;
    last4?: string;
    expMonth?: number;
    expYear?: number;
    bankName?: string | null;
    accountType?: string | null;
  } | null;
  invoices: Array<{
    id: string;
    number: string | null;
    status: string | null;
    amountPaid: number;
    amountDue: number;
    currency: string;
    created: number;
    dueDate: number | null;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
  }>;
}

const PLAN_OPTIONS: Array<{ value: PlanTier; label: string; subtitle: string }> = [
  { value: 'starter', label: 'Starter', subtitle: 'Best for smaller portfolios' },
  { value: 'pro', label: 'Pro', subtitle: 'Advanced workflows for growing teams' },
  { value: 'enterprise', label: 'Enterprise', subtitle: 'Large portfolios and custom operations' },
];

function formatCents(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((cents || 0) / 100);
}

function formatPaymentMethod(summary: BillingSummary['defaultPaymentMethod']) {
  if (!summary) return 'No default payment method on file';
  if (summary.type === 'card') {
    return `${summary.brand || 'Card'} •••• ${summary.last4 || '----'}${summary.expMonth && summary.expYear ? ` (exp ${summary.expMonth}/${summary.expYear})` : ''}`;
  }
  if (summary.type === 'us_bank_account') {
    return `${summary.bankName || 'Bank account'} •••• ${summary.last4 || '----'}${summary.accountType ? ` (${summary.accountType})` : ''}`;
  }
  return summary.type;
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
  const [savingPlan, setSavingPlan] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [planTier, setPlanTier] = useState<PlanTier>('starter');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await api.billing.summary();
        setSummary(data);
        setPlanTier(data.organization.planTier);
      } catch (err: any) {
        setError(err.message || 'Failed to load billing settings.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    setSavingPlan(true);
    setError('');
    setSaved(false);

    try {
      await api.organizations.update({ planTier });
      const refreshed = await api.billing.summary();
      setSummary(refreshed);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update plan.');
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleOpenBillingPortal() {
    setOpeningPortal(true);
    setError('');
    try {
      const { url } = await api.billing.createPortalSession();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'Failed to open billing portal.');
      setOpeningPortal(false);
    }
  }

  return (
    <SettingsShell activeHref="/settings/billing">
      <div className="card">
        <div className="card-body">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Billing</h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
            Manage plan tier, payment method, and invoice history.
          </p>

          {loading && <div className="loading">Loading billing data...</div>}

          {!loading && error && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '12px',
                color: '#dc2626',
                fontSize: '14px',
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
          )}

          {!loading && saved && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '6px',
                padding: '12px',
                color: '#16a34a',
                fontSize: '14px',
                marginBottom: '16px',
              }}
            >
              Billing settings updated.
            </div>
          )}

          {!loading && summary && (
            <>
              <h3
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '12px',
                }}
              >
                Plan Management
              </h3>

              <form onSubmit={handleSavePlan}>
                <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
                  {PLAN_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                        border: `1px solid ${planTier === option.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: '8px',
                        padding: '12px',
                        background:
                          planTier === option.value
                            ? 'rgba(37, 99, 235, 0.05)'
                            : 'var(--color-surface)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="planTier"
                        value={option.value}
                        checked={planTier === option.value}
                        onChange={() => setPlanTier(option.value)}
                        style={{ marginTop: '2px' }}
                      />
                      <span>
                        <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>
                          {option.label}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          {option.subtitle}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    Current status:{' '}
                    <strong style={{ color: 'var(--color-text)' }}>
                      {summary.organization.subscriptionStatus}
                    </strong>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={savingPlan}>
                    {savingPlan ? 'Saving...' : 'Save plan'}
                  </button>
                </div>
              </form>

              <hr
                style={{
                  border: 'none',
                  borderTop: '1px solid var(--color-border)',
                  margin: '0 0 20px 0',
                }}
              />

              <h3
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '12px',
                }}
              >
                Payment Method
              </h3>

              <div className="detail-grid" style={{ marginBottom: '12px' }}>
                {labelValue('Default Method', formatPaymentMethod(summary.defaultPaymentMethod))}
                {labelValue('Stripe Customer ID', summary.organization.stripeCustomerId)}
                {labelValue('Stripe Subscription ID', summary.organization.stripeSubscriptionId)}
                {labelValue(
                  'Trial Ends',
                  summary.organization.trialEndsAt
                    ? new Date(summary.organization.trialEndsAt).toLocaleDateString()
                    : null
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={openingPortal}
                  onClick={handleOpenBillingPortal}
                >
                  {openingPortal ? 'Opening...' : 'Manage in Stripe'}
                </button>
              </div>

              <hr
                style={{
                  border: 'none',
                  borderTop: '1px solid var(--color-border)',
                  margin: '0 0 20px 0',
                }}
              />

              <h3
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '12px',
                }}
              >
                Invoice History
              </h3>

              {summary.invoices.length === 0 ? (
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)' }}>
                  No invoices available yet.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Status</th>
                        <th>Amount</th>
                        <th>Issued</th>
                        <th>Due</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td>{invoice.number || invoice.id}</td>
                          <td>{invoice.status || '--'}</td>
                          <td>
                            {formatCents(invoice.amountPaid || invoice.amountDue, invoice.currency)}
                          </td>
                          <td>{new Date(invoice.created * 1000).toLocaleDateString()}</td>
                          <td>
                            {invoice.dueDate
                              ? new Date(invoice.dueDate * 1000).toLocaleDateString()
                              : '--'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {invoice.hostedInvoiceUrl && (
                                <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                                  View
                                </a>
                              )}
                              {invoice.invoicePdf && (
                                <a href={invoice.invoicePdf} target="_blank" rel="noreferrer">
                                  PDF
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SettingsShell>
  );
}
