'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

type Step = 'unit' | 'tenant' | 'lease' | 'done';

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
}

interface Unit {
  id: string;
  unitNumber: string;
  status: string;
  rentAmount: string;
  depositAmount: string;
}

export default function TenantInvitePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('unit');

  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [loadingProps, setLoadingProps] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);

  const [tenantName, setTenantName] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');

  const [leaseType, setLeaseType] = useState('fixed_term');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [lateFeeAmount, setLateFeeAmount] = useState('50');
  const [lateFeeGraceDays, setLateFeeGraceDays] = useState('5');
  const [rentDueDay, setRentDueDay] = useState('1');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  useEffect(() => {
    api.properties.list().then((props) => {
      setProperties(props);
      setLoadingProps(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedPropertyId) { setUnits([]); return; }
    setLoadingUnits(true);
    api.units.list(selectedPropertyId).then((u) => {
      setUnits(u.filter((unit: Unit) => unit.status === 'vacant'));
      setLoadingUnits(false);
    });
  }, [selectedPropertyId]);

  useEffect(() => {
    const selectedUnit = units.find((u) => u.id === selectedUnitId);
    if (selectedUnit) {
      setRentAmount(selectedUnit.rentAmount);
      setDepositAmount(selectedUnit.depositAmount);
    }
  }, [selectedUnitId, units]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      let tenantId = '';
      const normalizedEmail = tenantEmail.trim().toLowerCase();

      // 1. Create tenant (or reuse existing tenant if previous attempt already created them)
      try {
        const tenant = await api.tenants.create({
          name: tenantName,
          email: normalizedEmail,
          phone: tenantPhone || null,
        });
        tenantId = tenant.id;
      } catch (err: any) {
        const message = String(err?.message || '');
        if (!message.toLowerCase().includes('already exists')) {
          throw err;
        }

        const existingTenants = await api.tenants.list();
        const existing = existingTenants.find(
          (t: any) => String(t.email || '').trim().toLowerCase() === normalizedEmail
        );

        if (!existing) {
          throw err;
        }

        tenantId = existing.id;
      }

      const leaseEndDate =
        leaseType === 'fixed_term'
          ? endDate
          : (() => {
              if (!startDate) return '';
              const d = new Date(`${startDate}T00:00:00`);
              d.setMonth(d.getMonth() + 1);
              return d.toISOString().slice(0, 10);
            })();

      // 2. Create lease
      await api.leases.create({
        unitId: selectedUnitId,
        type: leaseType,
        startDate,
        endDate: leaseEndDate,
        rentAmount: parseFloat(rentAmount),
        depositAmount: parseFloat(depositAmount || '0'),
        lateFeeAmount: parseFloat(lateFeeAmount || '50'),
        lateFeeGraceDays: parseInt(lateFeeGraceDays || '5', 10),
        rentDueDay: parseInt(rentDueDay || '1', 10),
        tenantIds: [tenantId],
      });

      setCreatedTenantId(tenantId);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Failed to create tenant and lease.');
    } finally {
      setSubmitting(false);
    }
  }

  const steps = [
    { key: 'unit', label: 'Select unit' },
    { key: 'tenant', label: 'Tenant info' },
    { key: 'lease', label: 'Lease terms' },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);

  if (step === 'done') {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Tenant Invited</h1>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '48px' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ marginBottom: '8px' }}>Tenant added successfully!</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px' }}>
              <strong>{tenantName}</strong> has been created with a lease in{' '}
              {properties.find((p) => p.id === selectedPropertyId)?.name} — Unit{' '}
              {units.find((u) => u.id === selectedUnitId)?.unitNumber}.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              {createdTenantId && (
                <Link href={`/tenants/${createdTenantId}`} className="btn btn-primary">
                  View tenant profile
                </Link>
              )}
              <Link href="/tenants" className="btn btn-secondary">
                Back to tenants
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invite Tenant</h1>
          <p className="page-subtitle">Add a new tenant and create their lease</p>
        </div>
        <Link href="/tenants" className="btn btn-secondary">Cancel</Link>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {steps.map((s, i) => (
          <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{
              height: '4px', borderRadius: '2px',
              background: i <= currentStepIndex ? 'var(--color-primary, #6366f1)' : 'var(--color-border)',
            }} />
            <span style={{ fontSize: '12px', color: i <= currentStepIndex ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
              {i + 1}. {s.label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Step 1: Select unit */}
      {step === 'unit' && (
        <div className="card">
          <div className="card-body">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>
              Which unit is this tenant moving into?
            </h2>
            <div className="form-row">
              <div className="form-group">
                <label>Property *</label>
                {loadingProps ? (
                  <div className="loading">Loading properties…</div>
                ) : (
                  <select value={selectedPropertyId} onChange={(e) => { setSelectedPropertyId(e.target.value); setSelectedUnitId(''); }}>
                    <option value="">Select a property…</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.address}, {p.city}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label>Vacant unit *</label>
                {loadingUnits ? (
                  <div className="loading">Loading units…</div>
                ) : (
                  <select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} disabled={!selectedPropertyId}>
                    <option value="">Select a unit…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit {u.unitNumber} — ${Number(u.rentAmount).toLocaleString()}/mo
                      </option>
                    ))}
                    {units.length === 0 && selectedPropertyId && (
                      <option disabled>No vacant units</option>
                    )}
                  </select>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                className="btn btn-primary"
                disabled={!selectedPropertyId || !selectedUnitId}
                onClick={() => setStep('tenant')}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Tenant info */}
      {step === 'tenant' && (
        <div className="card">
          <div className="card-body">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Tenant information</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Full name *</label>
                <input type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Jane Smith" required />
              </div>
              <div className="form-group">
                <label>Email address *</label>
                <input type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} placeholder="jane@example.com" required />
              </div>
            </div>
            <div className="form-group" style={{ maxWidth: '300px' }}>
              <label>Phone number</label>
              <input type="tel" value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} placeholder="(555) 000-0000" />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setStep('unit')}>Back</button>
              <button
                className="btn btn-primary"
                disabled={!tenantName || !tenantEmail}
                onClick={() => setStep('lease')}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Lease terms */}
      {step === 'lease' && (
        <div className="card">
          <div className="card-body">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Lease terms</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Lease type *</label>
                <select value={leaseType} onChange={(e) => setLeaseType(e.target.value)}>
                  <option value="fixed_term">Fixed term</option>
                  <option value="month_to_month">Month-to-month</option>
                </select>
              </div>
              <div className="form-group">
                <label>Rent due day</label>
                <input type="number" min="1" max="28" value={rentDueDay} onChange={(e) => setRentDueDay(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Start date *</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              {leaseType === 'fixed_term' && (
                <div className="form-group">
                  <label>End date *</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Monthly rent *</label>
                <input type="number" step="0.01" min="0" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} placeholder="1500.00" required />
              </div>
              <div className="form-group">
                <label>Security deposit</label>
                <input type="number" step="0.01" min="0" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="1500.00" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Late fee amount ($)</label>
                <input type="number" step="0.01" min="0" value={lateFeeAmount} onChange={(e) => setLateFeeAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Grace period (days)</label>
                <input type="number" min="0" value={lateFeeGraceDays} onChange={(e) => setLateFeeGraceDays(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setStep('tenant')} disabled={submitting}>Back</button>
              <button
                className="btn btn-primary"
                disabled={!startDate || !rentAmount || (leaseType === 'fixed_term' && !endDate) || submitting}
                onClick={handleSubmit}
              >
                {submitting ? 'Creating…' : 'Create tenant & lease'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
