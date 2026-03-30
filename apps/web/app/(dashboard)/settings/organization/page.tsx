'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
];

export default function OrganizationSettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [rentDueDay, setRentDueDay] = useState(1);
  const [gracePeriodDays, setGracePeriodDays] = useState(5);
  const [lateFeeAmount, setLateFeeAmount] = useState(50);

  useEffect(() => {
    async function load() {
      try {
        const org = await api.organizations.get();
        setName(org.name ?? '');
        setPhone(org.phone ?? '');
        setEmail(org.email ?? '');
        setTimezone(org.timezone ?? 'America/Chicago');
        setRentDueDay(org.rentDueDay ?? 1);
        setGracePeriodDays(org.gracePeriodDays ?? 5);
        setLateFeeAmount(Number(org.lateFeeAmount) ?? 50);
      } catch (err) {
        console.error('Failed to load org settings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await api.organizations.update({
        name,
        phone: phone || undefined,
        email: email || undefined,
        timezone,
        rentDueDay,
        gracePeriodDays,
        lateFeeAmount,
      });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  const settingsNav = [
    { href: '/settings/organization', label: 'Organization' },
    { href: '/settings/team', label: 'Team' },
    { href: '/settings/notifications', label: 'Notifications' },
    { href: '/settings', label: 'Stripe Connect' },
  ];

  if (loading) return <div className="loading">Loading settings…</div>;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Settings sub-nav */}
        <div className="card">
          <nav>
            {settingsNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'block',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: item.href === '/settings/organization' ? 600 : 400,
                  color: item.href === '/settings/organization' ? 'var(--color-primary)' : 'inherit',
                  borderLeft: item.href === '/settings/organization' ? '3px solid var(--color-primary)' : '3px solid transparent',
                  textDecoration: 'none',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div className="card">
          <div className="card-body">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Organization Settings</h2>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
                {error}
              </div>
            )}
            {saved && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#16a34a', fontSize: '14px' }}>
                Settings saved successfully.
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Company info
              </h3>

              <div className="form-row">
                <div className="form-group">
                  <label>Company name *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@company.com" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" />
                </div>
                <div className="form-group">
                  <label>Timezone</label>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '24px 0' }} />

              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Rent defaults
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                These apply org-wide. Individual leases can override them.
              </p>

              <div className="form-row">
                <div className="form-group">
                  <label>Rent due day (1–28)</label>
                  <input type="number" min="1" max="28" value={rentDueDay} onChange={(e) => setRentDueDay(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>Grace period (days)</label>
                  <input type="number" min="0" value={gracePeriodDays} onChange={(e) => setGracePeriodDays(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>Default late fee ($)</label>
                  <input type="number" step="0.01" min="0" value={lateFeeAmount} onChange={(e) => setLateFeeAmount(Number(e.target.value))} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
