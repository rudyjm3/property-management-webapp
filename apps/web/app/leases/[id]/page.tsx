'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface LeaseDetail {
  id: string;
  rentAmount: string;
  depositAmount: string;
  startDate: string;
  endDate: string;
  status: string;
  lateFeeAmount: string;
  lateFeeGraceDays: number;
  documentUrl: string | null;
  notes: string | null;
  createdAt: string;
  unit: {
    id: string;
    unitNumber: string;
    propertyId: string;
    property: { id: string; name: string; address: string };
  };
  participants: Array<{
    id: string;
    isPrimary: boolean;
    tenant: { id: string; name: string; email: string; phone: string | null };
  }>;
  payments: Array<{
    id: string;
    amount: string;
    type: string;
    status: string;
    dueDate: string;
    paidAt: string | null;
    createdAt: string;
  }>;
}

interface TenantListItem {
  id: string;
  name: string;
  email: string;
  activeLease: { unitNumber: string; propertyName: string; status: string } | null;
}

function daysUntilExpiry(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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

function paymentStatusClass(status: string): string {
  switch (status) {
    case 'completed': return 'badge-occupied';
    case 'pending': return 'badge-maintenance';
    case 'failed': return 'badge-notice';
    case 'waived': return 'badge-vacant';
    default: return 'badge-vacant';
  }
}

export default function LeaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leaseId = params.id as string;

  const [lease, setLease] = useState<LeaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  const [error, setError] = useState('');

  // Add tenant state
  const [allTenants, setAllTenants] = useState<TenantListItem[]>([]);
  const [addTenantId, setAddTenantId] = useState('');
  const [addTenantLoading, setAddTenantLoading] = useState(false);
  const [addTenantError, setAddTenantError] = useState('');

  // Edit form state
  const [editStatus, setEditStatus] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editRentAmount, setEditRentAmount] = useState('');
  const [editLateFeeAmount, setEditLateFeeAmount] = useState('');
  const [editLateFeeGraceDays, setEditLateFeeGraceDays] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Renew form state
  const [renewStartDate, setRenewStartDate] = useState('');
  const [renewEndDate, setRenewEndDate] = useState('');
  const [renewRentAmount, setRenewRentAmount] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await api.leases.get(leaseId);
        setLease(data);
      } catch (err) {
        console.error('Failed to load lease:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leaseId]);

  function openEditModal() {
    if (!lease) return;
    setEditStatus(lease.status);
    setEditEndDate(lease.endDate.split('T')[0]);
    setEditRentAmount(String(Number(lease.rentAmount)));
    setEditLateFeeAmount(String(Number(lease.lateFeeAmount)));
    setEditLateFeeGraceDays(String(lease.lateFeeGraceDays));
    setEditNotes(lease.notes || '');
    setError('');
    setShowEditModal(true);
  }

  function openRenewModal() {
    if (!lease) return;
    // Default: next day after current end as start, +12 months as end
    const currentEnd = new Date(lease.endDate);
    const newStart = new Date(currentEnd);
    newStart.setDate(newStart.getDate() + 1);
    const newEnd = new Date(newStart);
    newEnd.setFullYear(newEnd.getFullYear() + 1);

    setRenewStartDate(newStart.toISOString().split('T')[0]);
    setRenewEndDate(newEnd.toISOString().split('T')[0]);
    setRenewRentAmount(String(Number(lease.rentAmount)));
    setError('');
    setShowRenewModal(true);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const updated = await api.leases.update(leaseId, {
        status: editStatus,
        endDate: editEndDate,
        rentAmount: parseFloat(editRentAmount),
        lateFeeAmount: parseFloat(editLateFeeAmount),
        lateFeeGraceDays: parseInt(editLateFeeGraceDays, 10),
        notes: editNotes || null,
      });
      setLease((prev) => (prev ? { ...prev, ...updated } : prev));
      setShowEditModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update lease');
    }
  }

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const newLease = await api.leases.renew(leaseId, {
        startDate: renewStartDate,
        endDate: renewEndDate,
        rentAmount: parseFloat(renewRentAmount),
      });
      // Navigate to the new lease
      router.push(`/leases/${newLease.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to renew lease');
    }
  }

  async function openAddTenantModal() {
    setAddTenantError('');
    setAddTenantId('');
    setAddTenantLoading(true);
    setShowAddTenantModal(true);
    try {
      const tenants = await api.tenants.list();
      const onLease = new Set(lease!.participants.map((p) => p.tenant.id));
      setAllTenants(
        tenants
          .filter((t: any) => !onLease.has(t.id))
          .map((t: any) => {
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
          })
      );
    } catch {
      setAddTenantError('Failed to load tenants.');
    } finally {
      setAddTenantLoading(false);
    }
  }

  async function handleAddTenant(e: React.FormEvent) {
    e.preventDefault();
    setAddTenantError('');

    const tenant = allTenants.find((t) => t.id === addTenantId);
    if (tenant?.activeLease) {
      const { unitNumber, propertyName, status } = tenant.activeLease;
      const confirmed = window.confirm(
        `${tenant.name} already has an active lease on Unit ${unitNumber} at ${propertyName} (${status.replace(/_/g, ' ')}).\n\nAdd them to this lease anyway?`
      );
      if (!confirmed) return;
    }

    try {
      const updated = await api.leases.addParticipant(leaseId, addTenantId);
      setLease(updated);
      setShowAddTenantModal(false);
    } catch (err: any) {
      setAddTenantError(err.message || 'Failed to add tenant');
    }
  }

  async function handleSetPrimary(participantId: string) {
    try {
      const updated = await api.leases.setPrimaryParticipant(leaseId, participantId);
      setLease(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to update primary tenant');
    }
  }

  async function handleRemoveTenant(participantId: string, tenantName: string) {
    if (!confirm(`Remove ${tenantName} from this lease?`)) return;
    try {
      const updated = await api.leases.removeParticipant(leaseId, participantId);
      setLease(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to remove tenant');
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this lease? This cannot be undone.')) return;
    try {
      await api.leases.delete(leaseId);
      router.push('/leases');
    } catch (err: any) {
      alert(err.message || 'Failed to delete lease');
    }
  }

  if (loading) return <div className="loading">Loading lease...</div>;
  if (!lease) return <div className="loading">Lease not found</div>;

  const days = daysUntilExpiry(lease.endDate);
  const isActive = lease.status === 'active' || lease.status === 'month_to_month' || lease.status === 'notice_given';
  const canRenew = isActive;

  let expiryNote = '';
  if (lease.status !== 'expired') {
    if (days < 0) expiryNote = 'Lease has expired';
    else if (days === 0) expiryNote = 'Expires today';
    else if (days <= 60) expiryNote = `Expires in ${days} days`;
    else if (days <= 90) expiryNote = `Expires in ${days} days`;
  }

  return (
    <>
      <div className="breadcrumb">
        <Link href="/leases">Leases</Link>
        <span>/</span>
        <span>
          Unit {lease.unit.unitNumber} &mdash; {lease.unit.property.name}
        </span>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">
            Lease &mdash; Unit {lease.unit.unitNumber}
          </h1>
          <p className="page-subtitle">
            {lease.unit.property.name} &middot; Created {new Date(lease.createdAt).toLocaleDateString()}
            {expiryNote && <span style={{ color: days <= 60 ? 'var(--color-danger)' : days <= 90 ? '#ca8a04' : undefined }}> &middot; {expiryNote}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canRenew && (
            <button className="btn btn-primary" onClick={openRenewModal}>
              Renew Lease
            </button>
          )}
          <button className="btn btn-secondary" onClick={openEditModal}>
            Edit
          </button>
          {lease.status === 'expired' && (
            <button
              className="btn btn-secondary"
              style={{ color: 'var(--color-danger)' }}
              onClick={handleDelete}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Lease Terms */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>Lease Terms</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Status</label>
                <span className={`badge ${statusBadgeClass(lease.status)}`}>
                  {lease.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="detail-item">
                <label>Monthly Rent</label>
                <span>${Number(lease.rentAmount).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Security Deposit</label>
                <span>${Number(lease.depositAmount).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Start Date</label>
                <span>{new Date(lease.startDate).toLocaleDateString()}</span>
              </div>
              <div className="detail-item">
                <label>End Date</label>
                <span>{new Date(lease.endDate).toLocaleDateString()}</span>
              </div>
              <div className="detail-item">
                <label>Late Fee</label>
                <span>
                  ${Number(lease.lateFeeAmount).toLocaleString()} after {lease.lateFeeGraceDays} days
                </span>
              </div>
            </div>
            {lease.notes && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Notes</label>
                <p style={{ fontSize: '14px', margin: 0 }}>{lease.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Unit & Tenants */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>Unit & Parties</h3>
            <div className="detail-grid" style={{ marginBottom: '16px' }}>
              <div className="detail-item">
                <label>Property</label>
                <Link
                  href={`/properties/${lease.unit.property.id}`}
                  style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                >
                  {lease.unit.property.name}
                </Link>
              </div>
              <div className="detail-item">
                <label>Unit</label>
                <Link
                  href={`/properties/${lease.unit.property.id}/units/${lease.unit.id}`}
                  style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                >
                  Unit {lease.unit.unitNumber}
                </Link>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                Tenants ({lease.participants.length})
              </h4>
              <button className="btn btn-sm btn-secondary" onClick={openAddTenantModal}>
                + Add Tenant
              </button>
            </div>
            {lease.participants.length === 0 ? (
              <p style={{ fontSize: '14px', color: '#6b7280' }}>No tenants on this lease</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[...lease.participants].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)).map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--color-bg)',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div>
                      <Link
                        href={`/tenants/${p.tenant.id}`}
                        style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {p.tenant.name}
                      </Link>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{p.tenant.email}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {p.isPrimary && (
                        <span className="badge badge-occupied" style={{ fontSize: '11px' }}>Primary</span>
                      )}
                      {lease.participants.length > 1 && !p.isPrimary && (
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ fontSize: '12px', padding: '2px 8px' }}
                          onClick={() => handleSetPrimary(p.id)}
                        >
                          Make Primary
                        </button>
                      )}
                      {lease.participants.length > 1 && (
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ color: 'var(--color-danger)', fontSize: '12px', padding: '2px 8px' }}
                          onClick={() => handleRemoveTenant(p.id, p.tenant.name)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Schedule */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-body">
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
            Payment History ({lease.payments.length})
          </h3>
          {lease.payments.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px' }}>
              <p>No payments recorded for this lease.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Due Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Paid On</th>
                  </tr>
                </thead>
                <tbody>
                  {lease.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{new Date(payment.dueDate).toLocaleDateString()}</td>
                      <td style={{ textTransform: 'capitalize' }}>{payment.type.replace(/_/g, ' ')}</td>
                      <td>${Number(payment.amount).toLocaleString()}</td>
                      <td>
                        <span className={`badge ${paymentStatusClass(payment.status)}`}>
                          {payment.status}
                        </span>
                      </td>
                      <td>{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Lease</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowEditModal(false)}>X</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                {error && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>{error}</div>
                )}
                <div className="form-group">
                  <label>Status</label>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    <option value="active">Active</option>
                    <option value="month_to_month">Month to Month</option>
                    <option value="notice_given">Notice Given</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Monthly Rent ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={editRentAmount}
                      onChange={(e) => setEditRentAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>End Date</label>
                    <input
                      type="date"
                      required
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
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
                      value={editLateFeeAmount}
                      onChange={(e) => setEditLateFeeAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Grace Period (days)</label>
                    <input
                      type="number"
                      min="0"
                      value={editLateFeeGraceDays}
                      onChange={(e) => setEditLateFeeGraceDays(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Tenant Modal */}
      {showAddTenantModal && (
        <div className="modal-overlay" onClick={() => setShowAddTenantModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2>Add Tenant</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowAddTenantModal(false)}>X</button>
            </div>
            <form onSubmit={handleAddTenant}>
              <div className="modal-body">
                {addTenantError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>{addTenantError}</div>
                )}
                {addTenantLoading ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#6b7280' }}>Loading…</div>
                ) : allTenants.length === 0 ? (
                  <p style={{ fontSize: '14px', color: '#6b7280' }}>No other tenants available to add.</p>
                ) : (
                  <div className="form-group">
                    <label>Tenant</label>
                    <select required value={addTenantId} onChange={(e) => setAddTenantId(e.target.value)}>
                      <option value="">— Select a tenant —</option>
                      {allTenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.activeLease
                            ? `⚠ ${t.name} (${t.email}) — Unit ${t.activeLease.unitNumber}, ${t.activeLease.propertyName}`
                            : `${t.name} (${t.email})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddTenantModal(false)}>Cancel</button>
                {!addTenantLoading && allTenants.length > 0 && (
                  <button type="submit" className="btn btn-primary">Add to Lease</button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Renew Modal */}
      {showRenewModal && (
        <div className="modal-overlay" onClick={() => setShowRenewModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Renew Lease</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowRenewModal(false)}>X</button>
            </div>
            <form onSubmit={handleRenew}>
              <div className="modal-body">
                {error && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>{error}</div>
                )}
                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                  This will expire the current lease and create a new one with the same tenants and unit.
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label>New Start Date</label>
                    <input
                      type="date"
                      required
                      value={renewStartDate}
                      onChange={(e) => setRenewStartDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>New End Date</label>
                    <input
                      type="date"
                      required
                      value={renewEndDate}
                      onChange={(e) => setRenewEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Monthly Rent ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={renewRentAmount}
                    onChange={(e) => setRenewRentAmount(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRenewModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Renew Lease</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
