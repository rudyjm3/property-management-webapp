'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Lease {
  id: string;
  rentAmount: string;
  depositAmount: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  unit: {
    id: string;
    unitNumber: string;
    propertyId: string;
    property: { id: string; name: string; address: string };
  };
  participants: Array<{
    isPrimary: boolean;
    tenant: { id: string; name: string; email: string };
  }>;
}

function daysUntilExpiry(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryColorClass(endDate: string, status: string): string {
  if (status === 'expired') return 'lease-expiry-expired';
  const days = daysUntilExpiry(endDate);
  if (days < 0) return 'lease-expiry-expired';
  if (days <= 60) return 'lease-expiry-red';
  if (days <= 90) return 'lease-expiry-yellow';
  return 'lease-expiry-green';
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active': return 'badge-occupied';
    case 'month_to_month': return 'badge-maintenance';
    case 'notice_given': return 'badge-notice';
    case 'expired': return 'badge-vacant';
    case 'draft': return 'badge-neutral';
    case 'terminated': return 'badge-vacant';
    default: return 'badge-vacant';
  }
}

interface UnitOption {
  id: string;
  label: string;
  rentAmount: number;
  depositAmount: number;
}

interface TenantOption {
  id: string;
  name: string;
  email: string;
  activeLease: { unitNumber: string; propertyName: string; status: string } | null;
}

export default function LeasesPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  // Dropdown data for new lease form
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [formLoading, setFormLoading] = useState(false);

  // Form state for new lease
  const [unitId, setUnitId] = useState('');
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>(['']);
  const [leaseType, setLeaseType] = useState('fixed_term');
  const [rentAmount, setRentAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [moveInDate, setMoveInDate] = useState('');
  const [rentDueDay, setRentDueDay] = useState('1');
  const [noticePeriodDays, setNoticePeriodDays] = useState('30');
  const [lateFeeAmount, setLateFeeAmount] = useState('50');
  const [lateFeeGraceDays, setLateFeeGraceDays] = useState('5');
  const [utilitiesIncluded, setUtilitiesIncluded] = useState<string[]>([]);
  const [hasPetAddendum, setHasPetAddendum] = useState(false);
  const [petDepositAmount, setPetDepositAmount] = useState('');
  const [hasParkingAddendum, setHasParkingAddendum] = useState(false);
  const [parkingFee, setParkingFee] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadLeases();
  }, []);

  async function loadLeases() {
    try {
      const data = await api.leases.list();
      setLeases(data);
    } catch (err) {
      console.error('Failed to load leases:', err);
    } finally {
      setLoading(false);
    }
  }

  async function openForm() {
    setShowForm(true);
    setFormLoading(true);
    try {
      const [properties, allTenants] = await Promise.all([
        api.properties.list(),
        api.tenants.list(),
      ]);
      const unitLists = await Promise.all(
        properties.map((p: any) => api.units.list(p.id).then((units: any[]) =>
          units.map((u) => ({
            id: u.id,
            label: `Unit ${u.unitNumber} — ${p.name} (${u.status})`,
            rentAmount: Number(u.rentAmount),
            depositAmount: Number(u.depositAmount),
          }))
        ))
      );
      setUnitOptions(unitLists.flat());
      setTenantOptions(allTenants.map((t: any) => {
        const lp = t.leaseParticipants?.[0];
        return {
          id: t.id,
          name: t.name,
          email: t.email,
          activeLease: lp ? {
            unitNumber: lp.lease.unit.unitNumber,
            propertyName: lp.lease.unit.property.name,
            status: lp.lease.status,
          } : null,
        };
      }));
    } catch (err) {
      console.error('Failed to load form data:', err);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const filledIds = selectedTenantIds.filter((id) => id !== '');
    if (filledIds.length === 0) {
      setError('Select at least one tenant.');
      return;
    }

    const conflicts = filledIds
      .map((id) => tenantOptions.find((t) => t.id === id))
      .filter((t): t is TenantOption => !!t?.activeLease);

    if (conflicts.length > 0) {
      const lines = conflicts.map(
        (t) => `• ${t.name} — Unit ${t.activeLease!.unitNumber} at ${t.activeLease!.propertyName} (${t.activeLease!.status.replace(/_/g, ' ')})`
      );
      const confirmed = window.confirm(
        `The following tenant(s) already have an active lease:\n\n${lines.join('\n')}\n\nCreate this lease anyway?`
      );
      if (!confirmed) return;
    }

    try {
      await api.leases.create({
        unitId,
        tenantIds: filledIds,
        type: leaseType || null,
        rentAmount: parseFloat(rentAmount),
        depositAmount: parseFloat(depositAmount || '0'),
        startDate,
        endDate,
        moveInDate: moveInDate || null,
        rentDueDay: parseInt(rentDueDay || '1', 10),
        noticePeriodDays: parseInt(noticePeriodDays || '30', 10),
        lateFeeAmount: parseFloat(lateFeeAmount || '0'),
        lateFeeGraceDays: parseInt(lateFeeGraceDays || '5', 10),
        utilitiesIncluded,
        hasPetAddendum,
        petDepositAmount: hasPetAddendum && petDepositAmount ? parseFloat(petDepositAmount) : null,
        hasParkingAddendum,
        parkingFee: hasParkingAddendum && parkingFee ? parseFloat(parkingFee) : null,
        notes: notes || null,
      });
      setShowForm(false);
      resetForm();
      loadLeases();
    } catch (err: any) {
      setError(err.message || 'Failed to create lease');
    }
  }

  function resetForm() {
    setUnitId('');
    setSelectedTenantIds(['']);
    setLeaseType('fixed_term');
    setRentAmount('');
    setDepositAmount('');
    setStartDate('');
    setEndDate('');
    setMoveInDate('');
    setRentDueDay('1');
    setNoticePeriodDays('30');
    setLateFeeAmount('50');
    setLateFeeGraceDays('5');
    setUtilitiesIncluded([]);
    setHasPetAddendum(false);
    setPetDepositAmount('');
    setHasParkingAddendum(false);
    setParkingFee('');
    setNotes('');
    setError('');
  }

  function toggleUtility(utility: string) {
    setUtilitiesIncluded((prev) =>
      prev.includes(utility) ? prev.filter((u) => u !== utility) : [...prev, utility]
    );
  }

  function setTenantAtIndex(index: number, id: string) {
    setSelectedTenantIds((prev) => prev.map((v, i) => (i === index ? id : v)));
  }

  function addTenantSlot() {
    setSelectedTenantIds((prev) => [...prev, '']);
  }

  function removeTenantSlot(index: number) {
    setSelectedTenantIds((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) return <div className="loading">Loading leases...</div>;

  const activeCount = leases.filter((l) => l.status === 'active' || l.status === 'month_to_month').length;
  const expiringCount = leases.filter((l) => {
    if (l.status === 'expired') return false;
    const days = daysUntilExpiry(l.endDate);
    return days >= 0 && days <= 60;
  }).length;

  return (
    <>
      <style>{`
        .lease-expiry-green { color: var(--color-success, #16a34a); font-weight: 500; }
        .lease-expiry-yellow { color: #ca8a04; font-weight: 500; }
        .lease-expiry-red { color: var(--color-danger, #dc2626); font-weight: 600; }
        .lease-expiry-expired { color: #6b7280; }
      `}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Leases</h1>
          <p className="page-subtitle">
            {leases.length} total &middot; {activeCount} active &middot; {expiringCount} expiring within 60 days
          </p>
        </div>
        <button className="btn btn-primary" onClick={openForm}>
          + New Lease
        </button>
      </div>

      {leases.length === 0 ? (
        <div className="empty-state">
          <h3>No leases yet</h3>
          <p>Create your first lease to link a tenant to a unit.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Property</th>
                <th>Tenants</th>
                <th>Monthly Rent</th>
                <th>Start</th>
                <th>End / Expires</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leases.map((lease) => {
                const primaryTenant = lease.participants.find((p) => p.isPrimary) ?? lease.participants[0];
                const colorClass = expiryColorClass(lease.endDate, lease.status);
                return (
                  <tr key={lease.id}>
                    <td>
                      <Link
                        href={`/properties/${lease.unit.property.id}/units/${lease.unit.id}`}
                        style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                      >
                        Unit {lease.unit.unitNumber}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/properties/${lease.unit.property.id}`}
                        style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                      >
                        {lease.unit.property.name}
                      </Link>
                    </td>
                    <td>
                      {primaryTenant ? (
                        <Link
                          href={`/tenants/${primaryTenant.tenant.id}`}
                          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                        >
                          {primaryTenant.tenant.name}
                          {lease.participants.length > 1 && (
                            <span style={{ color: '#6b7280', fontSize: '12px' }}>
                              {' '}+{lease.participants.length - 1} more
                            </span>
                          )}
                        </Link>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td>${Number(lease.rentAmount).toLocaleString()}</td>
                    <td>{new Date(lease.startDate).toLocaleDateString()}</td>
                    <td className={colorClass}>{new Date(lease.endDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${statusBadgeClass(lease.status)}`}>
                        {lease.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/leases/${lease.id}`}
                        className="btn btn-sm btn-secondary"
                        style={{ textDecoration: 'none' }}
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); resetForm(); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h2>New Lease</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                X
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>
                    {error}
                  </div>
                )}
                {formLoading ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#6b7280' }}>Loading…</div>
                ) : (
                  <>
                <div className="form-group">
                  <label>Unit</label>
                  <select required value={unitId} onChange={(e) => {
                    const opt = unitOptions.find((u) => u.id === e.target.value);
                    setUnitId(e.target.value);
                    if (opt) { setRentAmount(String(opt.rentAmount)); setDepositAmount(String(opt.depositAmount)); }
                  }}>
                    <option value="">— Select a unit —</option>
                    {unitOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  {tenantOptions.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>No tenants found. Add tenants first.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedTenantIds.map((selectedId, index) => {
                        const takenIds = new Set(selectedTenantIds.filter((_, i) => i !== index));
                        const available = tenantOptions.filter((t) => !takenIds.has(t.id));
                        return (
                          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                                {index === 0 ? 'Primary Tenant' : `Additional Tenant ${index + 1}`}
                              </label>
                              <select
                                required={index === 0}
                                value={selectedId}
                                onChange={(e) => setTenantAtIndex(index, e.target.value)}
                              >
                                <option value="">— Select a tenant —</option>
                                {available.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.activeLease
                                      ? `⚠ ${t.name} (${t.email}) — Unit ${t.activeLease.unitNumber}, ${t.activeLease.propertyName}`
                                      : `${t.name} (${t.email})`}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {index > 0 && (
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                style={{ color: 'var(--color-danger)', marginTop: '20px', flexShrink: 0 }}
                                onClick={() => removeTenantSlot(index)}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {selectedTenantIds.length < tenantOptions.length && (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          style={{ alignSelf: 'flex-start' }}
                          onClick={addTenantSlot}
                        >
                          + Add Another Person
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Lease Type</label>
                    <select value={leaseType} onChange={(e) => setLeaseType(e.target.value)}>
                      <option value="fixed_term">Fixed Term</option>
                      <option value="month_to_month">Month-to-Month</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Move-In Date</label>
                    <input
                      type="date"
                      value={moveInDate}
                      onChange={(e) => setMoveInDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Monthly Rent ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="1500"
                      value={rentAmount}
                      onChange={(e) => setRentAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Deposit ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="1500"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Date</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>End Date</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Rent Due Day (1–28)</label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={rentDueDay}
                      onChange={(e) => setRentDueDay(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Notice Period (days)</label>
                    <input
                      type="number"
                      min="0"
                      value={noticePeriodDays}
                      onChange={(e) => setNoticePeriodDays(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Late Fee ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={lateFeeAmount}
                      onChange={(e) => setLateFeeAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Grace Period (days)</label>
                    <input
                      type="number"
                      min="0"
                      value={lateFeeGraceDays}
                      onChange={(e) => setLateFeeGraceDays(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Utilities Included</label>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {['Water', 'Gas', 'Electric', 'Trash'].map((util) => (
                      <label key={util} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 400, fontSize: '14px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={utilitiesIncluded.includes(util.toLowerCase())}
                          onChange={() => toggleUtility(util.toLowerCase())}
                        />
                        {util}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 400, fontSize: '14px', cursor: 'pointer', marginBottom: '8px' }}>
                    <input type="checkbox" checked={hasPetAddendum} onChange={(e) => setHasPetAddendum(e.target.checked)} />
                    Pet Addendum
                  </label>
                  {hasPetAddendum && (
                    <div className="form-group" style={{ marginLeft: '24px' }}>
                      <label>Pet Deposit ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="300"
                        value={petDepositAmount}
                        onChange={(e) => setPetDepositAmount(e.target.value)}
                      />
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 400, fontSize: '14px', cursor: 'pointer', marginBottom: '8px' }}>
                    <input type="checkbox" checked={hasParkingAddendum} onChange={(e) => setHasParkingAddendum(e.target.checked)} />
                    Parking Addendum
                  </label>
                  {hasParkingAddendum && (
                    <div className="form-group" style={{ marginLeft: '24px' }}>
                      <label>Parking Fee ($/mo)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="75"
                        value={parkingFee}
                        onChange={(e) => setParkingFee(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Optional notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Lease
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
