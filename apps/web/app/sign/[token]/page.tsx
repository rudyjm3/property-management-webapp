'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SigningContext {
  leaseId: string;
  esignatureStatus: string;
  tenantAlreadySigned: boolean;
  startDate: string;
  endDate: string;
  rentAmount: number;
  depositAmount: number;
  utilitiesIncluded: string[];
  hasPetAddendum: boolean;
  petDepositAmount: number | null;
  hasParkingAddendum: boolean;
  parkingFee: number | null;
  noticePeriodDays: number;
  unit: { unitNumber: string; propertyName: string; address: string; city: string; state: string };
  organizationName: string;
  tenants: { name: string; email: string; isPrimary: boolean }[];
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function SignLeasePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [context, setContext] = useState<SigningContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/v1/sign/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setError(json.error.message); return; }
        setContext(json.data);
      })
      .catch(() => setError('Failed to load lease. Please check the link and try again.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSign() {
    if (!signatureName.trim()) { setSubmitError('Please type your full legal name to sign.'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`${API_URL}/api/v1/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureName }),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json.error?.message || 'Signing failed. Please try again.'); return; }
      router.push(`/sign/${token}/signed`);
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7' }}>
      <p style={{ color: '#6b7280' }}>Loading lease…</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7' }}>
      <div style={{ maxWidth: '500px', background: '#fff', padding: '32px', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: '8px' }}>Link not found</p>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>{error}</p>
      </div>
    </div>
  );

  if (!context) return null;

  if (context.tenantAlreadySigned) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7' }}>
      <div style={{ maxWidth: '500px', background: '#fff', padding: '32px', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700 }}>Already signed</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
          {context.esignatureStatus === 'completed'
            ? 'This lease has been signed by all parties.'
            : 'Your signature has been recorded. The property manager will countersign shortly.'}
        </p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7', padding: '24px 16px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700 }}>Lease Agreement</h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            {context.unit.propertyName} — Unit {context.unit.unitNumber}, {context.unit.city}, {context.unit.state}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>{context.organizationName}</p>
        </div>

        {/* Lease Summary */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Lease Summary</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
            <div>
              <p style={{ margin: '0 0 2px', color: '#6b7280', fontSize: '12px' }}>LEASE TERM</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{fmt(context.startDate)} – {fmt(context.endDate)}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 2px', color: '#6b7280', fontSize: '12px' }}>MONTHLY RENT</p>
              <p style={{ margin: 0, fontWeight: 500 }}>${context.rentAmount.toLocaleString()}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 2px', color: '#6b7280', fontSize: '12px' }}>SECURITY DEPOSIT</p>
              <p style={{ margin: 0, fontWeight: 500 }}>${context.depositAmount.toLocaleString()}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 2px', color: '#6b7280', fontSize: '12px' }}>NOTICE PERIOD</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{context.noticePeriodDays} days</p>
            </div>
            {context.utilitiesIncluded.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ margin: '0 0 2px', color: '#6b7280', fontSize: '12px' }}>UTILITIES INCLUDED</p>
                <p style={{ margin: 0, fontWeight: 500, textTransform: 'capitalize' }}>{context.utilitiesIncluded.join(', ')}</p>
              </div>
            )}
            {context.hasPetAddendum && (
              <div>
                <p style={{ margin: '0 0 2px', color: '#6b7280', fontSize: '12px' }}>PET ADDENDUM</p>
                <p style={{ margin: 0, fontWeight: 500 }}>Pet deposit: ${context.petDepositAmount?.toLocaleString() ?? '—'}</p>
              </div>
            )}
            {context.hasParkingAddendum && (
              <div>
                <p style={{ margin: '0 0 2px', color: '#6b7280', fontSize: '12px' }}>PARKING ADDENDUM</p>
                <p style={{ margin: 0, fontWeight: 500 }}>Parking fee: ${context.parkingFee?.toLocaleString() ?? '—'}/mo</p>
              </div>
            )}
          </div>

          {context.tenants.length > 0 && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: '12px' }}>TENANT(S)</p>
              {context.tenants.map((t) => (
                <p key={t.email} style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 500 }}>
                  {t.name} {t.isPrimary && <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 400 }}>(Primary)</span>}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* ESIGN Disclosure */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600 }}>Electronic Signature Disclosure</h2>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#374151' }}>
            By typing your full legal name below and clicking "Sign Lease Agreement," you agree that your electronic signature is the legal equivalent of your manual signature on this lease agreement. This signature is binding under the Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA). Your signature, timestamp, and IP address will be recorded.
          </p>
        </div>

        {/* Signature */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px 24px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontWeight: 600 }}>Type your full legal name to sign *</label>
            <input
              className="form-control"
              placeholder="Full legal name"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              style={{ marginTop: '8px', fontSize: '16px' }}
            />
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#6b7280' }}>
              Your typed name constitutes your electronic signature.
            </p>
          </div>
          {submitError && (
            <p style={{ color: '#dc2626', fontSize: '14px', margin: '12px 0 0' }}>{submitError}</p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '16px', width: '100%' }}
            onClick={handleSign}
            disabled={submitting}
          >
            {submitting ? 'Signing…' : 'Sign Lease Agreement'}
          </button>
        </div>
      </div>
    </div>
  );
}
