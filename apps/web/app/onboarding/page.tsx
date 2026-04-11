'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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

const PROPERTY_TYPES = [
  { value: 'multifamily', label: 'Multifamily (apartments)' },
  { value: 'single_family', label: 'Single family home' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed_use', label: 'Mixed use' },
];

const PLAN_OPTIONS: Array<{
  value: 'starter' | 'pro' | 'enterprise';
  label: string;
  subtitle: string;
}> = [
  { value: 'starter', label: 'Starter', subtitle: 'Best for smaller portfolios' },
  { value: 'pro', label: 'Pro', subtitle: 'Advanced workflows for growing teams' },
  { value: 'enterprise', label: 'Enterprise', subtitle: 'Large portfolios and custom operations' },
];

type Step = 'org' | 'logo' | 'billing' | 'property';

export default function OnboardingPage() {
  const router = useRouter();
  const { profile, session, loading, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>('org');

  // Org step
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Logo step
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  // Billing step
  const [planTier, setPlanTier] = useState<'starter' | 'pro' | 'enterprise'>('starter');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  // Property step
  const [propName, setPropName] = useState('');
  const [propAddress, setPropAddress] = useState('');
  const [propCity, setPropCity] = useState('');
  const [propState, setPropState] = useState('');
  const [propZip, setPropZip] = useState('');
  const [propType, setPropType] = useState('multifamily');
  const [propLoading, setPropLoading] = useState(false);
  const [propError, setPropError] = useState<string | null>(null);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
    }
  }, [loading, router, session]);

  useEffect(() => {
    if (!profile) return;
    setName((prev) => prev || profile.name || '');
    setOrgName((prev) => prev || profile.organization?.name || '');
    setTimezone((prev) =>
      prev === 'America/Chicago' ? profile.organization?.timezone || prev : prev
    );
  }, [profile]);

  async function handleOrgSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOrgLoading(true);
    setOrgError(null);

    try {
      if (profile?.orgId) {
        await api.organizations.update({
          name: orgName,
          phone: orgPhone || undefined,
          timezone,
        });
        await refreshProfile();
        setStep('logo');
        return;
      }

      await api.auth.register({ name, orgName, orgPhone: orgPhone || undefined, timezone });
      await refreshProfile();
      setStep('logo');
    } catch (err: any) {
      if (
        typeof err?.message === 'string' &&
        err.message.toLowerCase().includes('already registered')
      ) {
        try {
          await refreshProfile();
          await api.organizations.update({
            name: orgName,
            phone: orgPhone || undefined,
            timezone,
          });
          await refreshProfile();
          setStep('logo');
          return;
        } catch {
          // Fall through to the standard error message below if hydration/update fails.
        }
      }
      setOrgError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setOrgLoading(false);
    }
  }

  async function handleLogoContinue(skip = false) {
    setLogoLoading(true);
    setLogoError(null);

    try {
      if (skip || !logoFile) {
        setStep('billing');
        return;
      }

      const org = await api.organizations.get();
      const entityId = org?.id || profile?.orgId;
      if (!entityId) {
        throw new Error('Organization context not ready. Please try again.');
      }

      const { uploadUrl, s3Key } = await api.documents.requestUploadUrl({
        entityType: 'organization',
        entityId,
        fileName: logoFile.name,
        mimeType: logoFile.type || 'image/png',
        sizeBytes: logoFile.size,
        docCategory: 'photo',
        label: 'Organization logo',
        visibleToTenant: false,
      });

      await api.documents.uploadToS3(uploadUrl, logoFile, logoFile.type || 'image/png');
      await api.documents.confirmUpload({
        s3Key,
        entityType: 'organization',
        entityId,
        fileName: logoFile.name,
        mimeType: logoFile.type || 'image/png',
        sizeBytes: logoFile.size,
        docCategory: 'photo',
        label: 'Organization logo',
        visibleToTenant: false,
      });

      await api.organizations.update({ logoUrl: s3Key });
      setStep('billing');
    } catch (err: any) {
      setLogoError(err.message || 'Failed to upload logo. You can skip and add it later.');
    } finally {
      setLogoLoading(false);
    }
  }

  async function handleBillingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBillingLoading(true);
    setBillingError(null);

    try {
      await api.organizations.update({ planTier });
      setStep('property');
    } catch (err: any) {
      setBillingError(err.message || 'Failed to save plan. Please try again.');
    } finally {
      setBillingLoading(false);
    }
  }

  async function handlePropertySubmit(e: React.FormEvent) {
    e.preventDefault();
    setPropLoading(true);
    setPropError(null);

    try {
      await api.properties.create({
        name: propName,
        address: propAddress,
        city: propCity,
        state: propState,
        zip: propZip,
        type: propType,
      });
      router.push('/dashboard');
    } catch (err: any) {
      setPropError(err.message || 'Failed to create property. You can add it later.');
    } finally {
      setPropLoading(false);
    }
  }

  const steps: { key: Step; label: string }[] = useMemo(
    () => [
      { key: 'org', label: 'Your account' },
      { key: 'logo', label: 'Branding' },
      { key: 'billing', label: 'Billing plan' },
      { key: 'property', label: 'First property' },
    ],
    []
  );

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg, #f8fafc)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '620px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary, #2563eb)' }}>
            PropFlow
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>Let's get you set up</p>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            {steps.map((s, i) => (
              <div
                key={s.key}
                style={{
                  flex: 1,
                  height: '4px',
                  borderRadius: '2px',
                  background:
                    i <= currentStepIndex ? 'var(--color-primary, #2563eb)' : 'var(--color-border)',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Step {currentStepIndex + 1} of {steps.length}: {steps[currentStepIndex]?.label}
          </p>
        </div>

        {step === 'org' && (
          <div className="card">
            <div className="card-body">
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>
                Tell us about yourself
              </h2>

              {orgError && (
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
                  {orgError}
                </div>
              )}

              <form onSubmit={handleOrgSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Your full name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Company or organization name *</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Smith Property Management"
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Phone number</label>
                    <input
                      type="tel"
                      value={orgPhone}
                      onChange={(e) => setOrgPhone(e.target.value)}
                      placeholder="(555) 000-0000"
                    />
                  </div>
                  <div className="form-group">
                    <label>Timezone</label>
                    <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz.replace('America/', '').replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
                  disabled={orgLoading}
                >
                  {orgLoading ? 'Setting up...' : 'Continue'}
                </button>
              </form>
            </div>
          </div>
        )}

        {step === 'logo' && (
          <div className="card">
            <div className="card-body">
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                Add your company logo
              </h2>
              <p
                style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}
              >
                Optional. You can upload this now or do it later from organization settings.
              </p>

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

              <div className="form-group">
                <label>Logo image</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {logoPreviewUrl && (
                <div
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px',
                    background: 'var(--color-bg)',
                    textAlign: 'center',
                  }}
                >
                  <img
                    src={logoPreviewUrl}
                    alt="Logo preview"
                    style={{ maxHeight: '120px', maxWidth: '100%' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                  onClick={() => setStep('org')}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                  onClick={() => handleLogoContinue(true)}
                  disabled={logoLoading}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                  onClick={() => handleLogoContinue(false)}
                  disabled={logoLoading}
                >
                  {logoLoading ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'billing' && (
          <div className="card">
            <div className="card-body">
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                Choose your billing plan
              </h2>
              <p
                style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}
              >
                This sets your current plan tier. Payment method can be configured later.
              </p>

              {billingError && (
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
                  {billingError}
                </div>
              )}

              <form onSubmit={handleBillingSubmit}>
                <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
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

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                    onClick={() => setStep('logo')}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                    disabled={billingLoading}
                  >
                    {billingLoading ? 'Saving...' : 'Continue'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {step === 'property' && (
          <div className="card">
            <div className="card-body">
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                Add your first property
              </h2>
              <p
                style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}
              >
                You can add more properties anytime from the Properties page.
              </p>

              {propError && (
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
                  {propError}
                </div>
              )}

              <form onSubmit={handlePropertySubmit}>
                <div className="form-group">
                  <label>Property name *</label>
                  <input
                    type="text"
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    placeholder="Elm Street Apartments"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Property type *</label>
                  <select value={propType} onChange={(e) => setPropType(e.target.value)}>
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Street address *</label>
                  <input
                    type="text"
                    value={propAddress}
                    onChange={(e) => setPropAddress(e.target.value)}
                    placeholder="123 Main St"
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>City *</label>
                    <input
                      type="text"
                      value={propCity}
                      onChange={(e) => setPropCity(e.target.value)}
                      placeholder="Chicago"
                      required
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>State *</label>
                    <input
                      type="text"
                      value={propState}
                      onChange={(e) => setPropState(e.target.value.toUpperCase())}
                      placeholder="IL"
                      maxLength={2}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>ZIP *</label>
                    <input
                      type="text"
                      value={propZip}
                      onChange={(e) => setPropZip(e.target.value)}
                      placeholder="60601"
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                    onClick={() => setStep('billing')}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                    onClick={() => router.push('/dashboard')}
                  >
                    Skip for now
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                    disabled={propLoading}
                  >
                    {propLoading ? 'Saving...' : 'Go to dashboard'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
