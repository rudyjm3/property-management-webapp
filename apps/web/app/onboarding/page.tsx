'use client';

import { useState } from 'react';
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

type Step = 'org' | 'property' | 'done';

export default function OnboardingPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>('org');

  // Org step
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Property step
  const [propName, setPropName] = useState('');
  const [propAddress, setPropAddress] = useState('');
  const [propCity, setPropCity] = useState('');
  const [propState, setPropState] = useState('');
  const [propZip, setPropZip] = useState('');
  const [propType, setPropType] = useState('multifamily');
  const [propLoading, setPropLoading] = useState(false);
  const [propError, setPropError] = useState<string | null>(null);

  async function handleOrgSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOrgLoading(true);
    setOrgError(null);

    try {
      await api.auth.register({ name, orgName, orgPhone: orgPhone || undefined, timezone });
      await refreshProfile();
      setStep('property');
    } catch (err: any) {
      setOrgError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setOrgLoading(false);
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

  const steps: { key: Step; label: string }[] = [
    { key: 'org', label: 'Your account' },
    { key: 'property', label: 'First property' },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg, #f8fafc)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary, #6366f1)' }}>
            PropFlow
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Let&apos;s get you set up
          </p>
        </div>

        {/* Progress bar */}
        {step !== 'done' && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              {steps.map((s, i) => (
                <div
                  key={s.key}
                  style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '2px',
                    background: i <= currentStepIndex ? 'var(--color-primary, #6366f1)' : 'var(--color-border)',
                    transition: 'background 0.3s',
                  }}
                />
              ))}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Step {currentStepIndex + 1} of {steps.length}: {steps[currentStepIndex]?.label}
            </p>
          </div>
        )}

        {/* Step 1: Org setup */}
        {step === 'org' && (
          <div className="card">
            <div className="card-body">
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>
                Tell us about yourself
              </h2>

              {orgError && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px',
                  padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px',
                }}>
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
                        <option key={tz} value={tz}>{tz.replace('America/', '').replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={orgLoading}
                >
                  {orgLoading ? 'Setting up…' : 'Continue'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Step 2: First property */}
        {step === 'property' && (
          <div className="card">
            <div className="card-body">
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                Add your first property
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
                You can add more properties anytime from the Properties page.
              </p>

              {propError && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px',
                  padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px',
                }}>
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
                      <option key={t.value} value={t.value}>{t.label}</option>
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
                    style={{ flex: 1 }}
                    onClick={() => router.push('/dashboard')}
                  >
                    Skip for now
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={propLoading}
                  >
                    {propLoading ? 'Saving…' : 'Go to dashboard'}
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
