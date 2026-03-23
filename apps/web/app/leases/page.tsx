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
    default: return 'badge-vacant';
  }
}

export default function LeasesPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  // Form state for new lease
  const [unitId, setUnitId] = useState('');
  const [tenantIdsInput, setTenantIdsInput] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lateFeeAmount, setLateFeeAmount] = useState('50');
  const [lateFeeGraceDays, setLateFeeGraceDays] = useState('5');
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const tenantIds = tenantIdsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (tenantIds.length === 0) {
      setError('Enter at least one Tenant ID.');
      return;
    }

    try {
      await api.leases.create({
        unitId,
        tenantIds,
        rentAmount: parseFloat(rentAmount),
        depositAmount: parseFloat(depositAmount || '0'),
        startDate,
        endDate,
        lateFeeAmount: parseFloat(lateFeeAmount || '0'),
        lateFeeGraceDays: parseInt(lateFeeGraceDays || '5', 10),
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
    setTenantIdsInput('');
    setRentAmount('');
    setDepositAmount('');
    setStartDate('');
    setEndDate('');
    setLateFeeAmount('50');
    setLateFeeGraceDays('5');
    setNotes('');
    setError('');
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
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
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
                    <td>
                      <Link href={`/leases/${lease.id}`} className={colorClass} style={{ textDecoration: 'none' }}>
                        {new Date(lease.endDate).toLocaleDateString()}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(lease.status)}`}>
                        {lease.status.replace(/_/g, ' ')}
                      </span>
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
                <div className="form-group">
                  <label>Unit ID</label>
                  <input
                    required
                    placeholder="Unit UUID"
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Tenant IDs (comma-separated)</label>
                  <input
                    required
                    placeholder="UUID1, UUID2"
                    value={tenantIdsInput}
                    onChange={(e) => setTenantIdsInput(e.target.value)}
                  />
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
                  <label>Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Optional notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
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
