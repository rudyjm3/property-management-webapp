'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import SettingsShell from '@/components/settings/SettingsShell';

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
  const [logoSaving, setLogoSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [orgId, setOrgId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoImageSrc, setLogoImageSrc] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('America/Chicago');
  const [rentDueDay, setRentDueDay] = useState(1);
  const [gracePeriodDays, setGracePeriodDays] = useState(5);
  const [lateFeeAmount, setLateFeeAmount] = useState(50);

  useEffect(() => {
    async function load() {
      try {
        const org = await api.organizations.get();
        setOrgId(org.id ?? '');
        setName(org.name ?? '');
        setPhone(org.phone ?? '');
        setEmail(org.email ?? '');
        setLogoUrl(org.logoUrl ?? null);
        setTimezone(org.timezone ?? 'America/Chicago');
        setRentDueDay(org.rentDueDay ?? 1);
        setGracePeriodDays(org.gracePeriodDays ?? 5);
        setLateFeeAmount(Number(org.lateFeeAmount) ?? 50);

        if (org.logoUrl) {
          if (typeof org.logoUrl === 'string' && /^https?:\/\//i.test(org.logoUrl)) {
            setLogoImageSrc(org.logoUrl);
          } else {
            const docs = await api.documents.list({ entityType: 'organization', entityId: org.id });
            const matchedDoc = docs.find((doc: any) => doc.s3Key === org.logoUrl);
            if (matchedDoc?.id) {
              const { downloadUrl } = await api.documents.getDownloadUrl(matchedDoc.id);
              setLogoImageSrc(downloadUrl);
            } else {
              setLogoImageSrc(null);
            }
          }
        } else {
          setLogoImageSrc(null);
        }
      } catch (err) {
        console.error('Failed to load org settings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

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

  async function handleLogoUpload() {
    if (!logoFile) return;

    setLogoSaving(true);
    setLogoError(null);
    setSaved(false);

    try {
      const entityId = orgId || profile?.orgId;
      if (!entityId) {
        throw new Error('Organization context not ready. Please reload and try again.');
      }

      const resolvedMimeType = logoFile.type || 'image/png';
      const { uploadUrl, s3Key } = await api.documents.requestUploadUrl({
        entityType: 'organization',
        entityId,
        fileName: logoFile.name,
        mimeType: resolvedMimeType,
        sizeBytes: logoFile.size,
        docCategory: 'photo',
        label: 'Organization logo',
        visibleToTenant: false,
      });

      await api.documents.uploadToS3(uploadUrl, logoFile, resolvedMimeType);
      const confirmedDoc = await api.documents.confirmUpload({
        s3Key,
        entityType: 'organization',
        entityId,
        fileName: logoFile.name,
        mimeType: resolvedMimeType,
        sizeBytes: logoFile.size,
        docCategory: 'photo',
        label: 'Organization logo',
        visibleToTenant: false,
      });

      await api.organizations.update({ logoUrl: s3Key });
      await refreshProfile();
      setLogoUrl(s3Key);
      if (confirmedDoc?.id) {
        const { downloadUrl } = await api.documents.getDownloadUrl(confirmedDoc.id);
        setLogoImageSrc(downloadUrl);
      }
      setLogoFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setLogoError(err.message || 'Failed to upload logo.');
    } finally {
      setLogoSaving(false);
    }
  }

  if (loading) return <div className="loading">Loading settings...</div>;

  return (
    <SettingsShell activeHref="/settings/organization">
      <div className="card">
        <div className="card-body">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>
            Organization Settings
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
          {logoError && (
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
              {logoError}
            </div>
          )}
          {saved && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '16px',
                color: '#16a34a',
                fontSize: '14px',
              }}
            >
              Settings saved successfully.
            </div>
          )}

          <h3
            style={{
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '12px',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Logo
          </h3>

          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
              background: 'var(--color-bg)',
            }}
          >
            <div
              style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--color-text-muted)' }}
            >
              Upload your organization logo for use across the app.
            </div>

            {(logoPreviewUrl || logoImageSrc) && (
              <div style={{ marginBottom: '12px', textAlign: 'center' }}>
                <img
                  src={logoPreviewUrl || logoImageSrc || ''}
                  alt="Organization logo preview"
                  style={{ maxHeight: '120px', maxWidth: '100%' }}
                />
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Logo image</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!logoFile || logoSaving}
                onClick={handleLogoUpload}
              >
                {logoSaving ? 'Uploading...' : 'Upload logo'}
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <h3
              style={{
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '12px',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Company info
            </h3>

            <div className="form-row">
              <div className="form-group">
                <label>Company name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@company.com"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                />
              </div>
              <div className="form-group">
                <label>Timezone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <hr
              style={{
                border: 'none',
                borderTop: '1px solid var(--color-border)',
                margin: '24px 0',
              }}
            />

            <h3
              style={{
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '12px',
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Rent defaults
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              These apply org-wide. Individual leases can override them.
            </p>

            <div className="form-row">
              <div className="form-group">
                <label>Rent due day (1-28)</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={rentDueDay}
                  onChange={(e) => setRentDueDay(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label>Grace period (days)</label>
                <input
                  type="number"
                  min="0"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label>Default late fee ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={lateFeeAmount}
                  onChange={(e) => setLateFeeAmount(Number(e.target.value))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </SettingsShell>
  );
}
