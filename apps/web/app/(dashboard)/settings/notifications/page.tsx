'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import SettingsShell from '@/components/settings/SettingsShell';

type NotifPref = 'email' | 'in_app' | 'both' | 'none';
type JobState = 'idle' | 'running' | 'done' | 'error';

interface NotifSettings {
  notifRentOverdue: NotifPref;
  notifWorkOrder: NotifPref;
  notifLeaseExpiry: NotifPref;
  notifNewMessage: NotifPref;
}

const PREF_OPTIONS: { value: NotifPref; label: string }[] = [
  { value: 'both', label: 'Email + In-app' },
  { value: 'email', label: 'Email only' },
  { value: 'in_app', label: 'In-app only' },
  { value: 'none', label: 'None' },
];

const NOTIF_TYPES = [
  { key: 'notifRentOverdue' as keyof NotifSettings, label: 'Rent overdue', description: 'When a tenant has not paid rent past the grace period' },
  { key: 'notifWorkOrder' as keyof NotifSettings, label: 'Work order updates', description: 'When a work order is created, assigned, or completed' },
  { key: 'notifLeaseExpiry' as keyof NotifSettings, label: 'Lease expiry', description: 'When a lease is expiring within 60 days' },
  { key: 'notifNewMessage' as keyof NotifSettings, label: 'New messages', description: 'When a tenant sends you a message' },
];

export default function NotificationSettingsPage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<NotifSettings>({
    notifRentOverdue: 'both',
    notifWorkOrder: 'in_app',
    notifLeaseExpiry: 'both',
    notifNewMessage: 'both',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaseExpiryJobState, setLeaseExpiryJobState] = useState<JobState>('idle');
  const [leaseExpiryJobResult, setLeaseExpiryJobResult] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.userId) return;
    api.staff.list({ includeInactive: true }).then((staff) => {
      const me = staff.find((s: any) => s.id === profile.userId);
      if (me) {
        setSettings({
          notifRentOverdue: (me.notifRentOverdue ?? 'both') as NotifPref,
          notifWorkOrder: (me.notifWorkOrder ?? 'in_app') as NotifPref,
          notifLeaseExpiry: (me.notifLeaseExpiry ?? 'both') as NotifPref,
          notifNewMessage: (me.notifNewMessage ?? 'both') as NotifPref,
        });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [profile?.userId]);

  async function handleSave() {
    if (!profile?.userId) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await api.staff.update(profile.userId, {
        notifRentOverdue: settings.notifRentOverdue,
        notifWorkOrder: settings.notifWorkOrder,
        notifLeaseExpiry: settings.notifLeaseExpiry,
        notifNewMessage: settings.notifNewMessage,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  }

  async function runLeaseExpiryJob() {
    setLeaseExpiryJobState('running');
    setLeaseExpiryJobResult(null);
    try {
      const result = await api.notifications.triggerLeaseExpiry();
      setLeaseExpiryJobState('done');
      setLeaseExpiryJobResult(`Processed ${result.processed} lease${result.processed !== 1 ? 's' : ''} — ${result.succeeded} notified, ${result.failed} failed.`);
    } catch (err: any) {
      setLeaseExpiryJobState('error');
      setLeaseExpiryJobResult(err.message || 'Job failed.');
    }
  }

  return (
    <SettingsShell activeHref="/settings/notifications">
      <div className="card">
        <div className="card-body">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Notification Preferences</h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
            Choose how you want to be notified for each event type.
          </p>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
              {error}
            </div>
          )}
          {saved && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#16a34a', fontSize: '14px' }}>
              Preferences saved.
            </div>
          )}

          {loading ? (
            <div className="loading">Loading preferences...</div>
          ) : (
            <div>
              {NOTIF_TYPES.map((type) => (
                <div
                  key={type.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '14px' }}>{type.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{type.description}</div>
                  </div>
                  <select
                    value={settings[type.key]}
                    onChange={(e) => setSettings((prev) => ({ ...prev, [type.key]: e.target.value as NotifPref }))}
                    style={{ minWidth: '160px' }}
                  >
                    {PREF_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save preferences'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-body">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Notification Jobs</h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
            Manually trigger scheduled notification jobs. In production these run automatically on a daily cron schedule.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '14px' }}>Lease Expiry Alerts</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Sends expiry alerts for leases reaching the 90, 60, 30, and 14-day thresholds today
              </div>
              {leaseExpiryJobResult && (
                <div style={{ fontSize: '12px', marginTop: '6px', color: leaseExpiryJobState === 'error' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {leaseExpiryJobResult}
                </div>
              )}
            </div>
            <button
              className="btn btn-secondary"
              onClick={runLeaseExpiryJob}
              disabled={leaseExpiryJobState === 'running'}
              style={{ flexShrink: 0 }}
            >
              {leaseExpiryJobState === 'running' ? 'Running…' : 'Run Now'}
            </button>
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}
