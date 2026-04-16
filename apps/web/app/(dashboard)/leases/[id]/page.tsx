'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import DocumentPanel from '@/components/DocumentPanel';

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface LeaseDetail {
  id: string;
  rentAmount: string;
  depositAmount: string;
  startDate: string;
  endDate: string;
  status: string;
  type: string | null;
  moveInDate: string | null;
  moveOutDate: string | null;
  rentDueDay: number;
  noticePeriodDays: number;
  lateFeeAmount: string;
  lateFeeGraceDays: number;
  securityDepositStatus: string;
  utilitiesIncluded: string[];
  hasPetAddendum: boolean;
  petDepositAmount: string | null;
  hasParkingAddendum: boolean;
  parkingFee: string | null;
  documentUrl: string | null;
  notes: string | null;
  renewalOfLeaseId: string | null;
  createdLeaseId?: string;
  previousLeaseStatus?: string;
  createdAt: string;
  renewalOf: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
  } | null;
  renewals: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string;
  }>;
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
    case 'expired': return 'badge-muted';
    case 'draft': return 'badge-neutral';
    case 'terminated': return 'badge-muted';
    default: return 'badge-muted';
  }
}

function paymentStatusClass(status: string): string {
  switch (status) {
    case 'completed': return 'badge-occupied';
    case 'pending': return 'badge-maintenance';
    case 'failed': return 'badge-danger';
    case 'waived': return 'badge-vacant';
    case 'refunded': return 'badge-danger';
    default: return 'badge-vacant';
  }
}

const SECURITY_DEPOSIT_STATUS_LABELS: Record<string, string> = {
  held: 'Held',
  partial_return: 'Partial Return',
  full_return: 'Full Return',
  applied_to_balance: 'Applied to Balance',
};

export default function LeaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leaseId = params.id as string;

  const [lease, setLease] = useState<LeaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  const [error, setError] = useState('');
  const [renewalSuccessMessage, setRenewalSuccessMessage] = useState('');

  // Add tenant state
  const [allTenants, setAllTenants] = useState<TenantListItem[]>([]);
  const [addTenantId, setAddTenantId] = useState('');
  const [addTenantLoading, setAddTenantLoading] = useState(false);
  const [addTenantError, setAddTenantError] = useState('');

  // Move-out state
  const [showMoveOut, setShowMoveOut] = useState(false);
  const [moveOutDate, setMoveOutDate] = useState('');
  const [moveOutNoticeDate, setMoveOutNoticeDate] = useState<string | null>(null);
  const [moveOutDepositAmount, setMoveOutDepositAmount] = useState(0);
  const [moveOutDeductions, setMoveOutDeductions] = useState<{ reason: string; amount: string }[]>([]);
  const [moveOutNotes, setMoveOutNotes] = useState('');
  const [moveOutSubmitting, setMoveOutSubmitting] = useState(false);
  const [moveOutError, setMoveOutError] = useState('');

  // Edit form state
  const [editStatus, setEditStatus] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editMoveOutDate, setEditMoveOutDate] = useState('');
  const [editRentAmount, setEditRentAmount] = useState('');
  const [editLateFeeAmount, setEditLateFeeAmount] = useState('');
  const [editLateFeeGraceDays, setEditLateFeeGraceDays] = useState('');
  const [editSecurityDepositStatus, setEditSecurityDepositStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Renew form state
  const [renewStartDate, setRenewStartDate] = useState('');
  const [renewEndDate, setRenewEndDate] = useState('');
  const [renewRentAmount, setRenewRentAmount] = useState('');
  const [renewLeaseType, setRenewLeaseType] = useState('');

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

  useEffect(() => {
    if (!lease) return;

    const renewedFrom = searchParams.get('renewedFrom');
    if (renewedFrom) {
      setRenewalSuccessMessage('Renewal created successfully. This is the new lease record.');
    }

    const shouldOpenRenew = searchParams.get('openRenew') === '1';
    if (shouldOpenRenew) {
      const isCurrent = ['active', 'month_to_month', 'notice_given'].includes(lease.status);
      if (isCurrent) {
        openRenewModal();
      }
    }
  }, [lease, searchParams]);

  function openEditModal() {
    if (!lease) return;
    setEditStatus(lease.status);
    setEditEndDate(lease.endDate.split('T')[0]);
    setEditMoveOutDate(lease.moveOutDate ? lease.moveOutDate.split('T')[0] : '');
    setEditRentAmount(String(Number(lease.rentAmount)));
    setEditLateFeeAmount(String(Number(lease.lateFeeAmount)));
    setEditLateFeeGraceDays(String(lease.lateFeeGraceDays));
    setEditSecurityDepositStatus(lease.securityDepositStatus || 'held');
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
    setRenewLeaseType(lease.type || 'fixed_term');
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
        moveOutDate: editMoveOutDate || null,
        rentAmount: parseFloat(editRentAmount),
        lateFeeAmount: parseFloat(editLateFeeAmount),
        lateFeeGraceDays: parseInt(editLateFeeGraceDays, 10),
        securityDepositStatus: editSecurityDepositStatus || undefined,
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
    if (!lease) return;

    const parsedRent = parseFloat(renewRentAmount);
    const start = new Date(renewStartDate);
    const end = new Date(renewEndDate);
    const currentEnd = new Date(lease.endDate);

    if (!renewLeaseType) {
      setError('Select a lease type before renewing.');
      return;
    }

    if (Number.isNaN(parsedRent) || parsedRent <= 0) {
      setError('Monthly rent must be greater than 0.');
      return;
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError('Start and end dates are required.');
      return;
    }

    if (end <= start) {
      setError('Renewal end date must be after the renewal start date.');
      return;
    }

    if (start <= currentEnd) {
      setError('Renewal start date must be after the current lease end date.');
      return;
    }

    try {
      const newLease = await api.leases.renew(leaseId, {
        startDate: renewStartDate,
        endDate: renewEndDate,
        rentAmount: parsedRent,
        type: renewLeaseType || null,
      });
      // Navigate to the new lease
      router.push(`/leases/${newLease.id}?renewedFrom=${leaseId}`);
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

  async function handleMoveOut(e: React.FormEvent) {
    e.preventDefault();
    if (!lease || !moveOutDate) return;
    const hasPartialRow = moveOutDeductions.some((d) => {
      const hasReason = d.reason.trim().length > 0;
      const hasAmount = d.amount.trim().length > 0;
      return hasReason !== hasAmount;
    });
    if (hasPartialRow) {
      setMoveOutError('Each deduction must have both a reason and an amount.');
      return;
    }
    setMoveOutSubmitting(true);
    setMoveOutError('');
    try {
      const parsedDeductions = moveOutDeductions
        .filter((d) => d.reason.trim() && d.amount)
        .map((d) => ({ reason: d.reason.trim(), amount: parseFloat(d.amount) }));
      const updated = await api.leases.moveOut(leaseId, {
        moveOutDate,
        deductions: parsedDeductions,
        notes: moveOutNotes.trim() || null,
      });
      setLease((prev) => (prev ? { ...prev, ...updated } : prev));
      setShowMoveOut(false);
    } catch (err: any) {
      setMoveOutError(err.message || 'Failed to process move-out.');
    } finally {
      setMoveOutSubmitting(false);
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

      {renewalSuccessMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '12px', color: '#166534', marginBottom: '16px' }}>
          {renewalSuccessMessage}
        </div>
      )}

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
              {lease.type && (
                <div className="detail-item">
                  <label>Lease Type</label>
                  <span>{lease.type === 'fixed_term' ? 'Fixed Term' : 'Month-to-Month'}</span>
                </div>
              )}
              <div className="detail-item">
                <label>Monthly Rent</label>
                <span>${Number(lease.rentAmount).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Security Deposit</label>
                <span>${Number(lease.depositAmount).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Deposit Status</label>
                <span>{SECURITY_DEPOSIT_STATUS_LABELS[lease.securityDepositStatus] ?? lease.securityDepositStatus}</span>
              </div>
              <div className="detail-item">
                <label>Start Date</label>
                <span>{new Date(lease.startDate).toLocaleDateString()}</span>
              </div>
              {lease.moveInDate && (
                <div className="detail-item">
                  <label>Move-In Date</label>
                  <span>{new Date(lease.moveInDate).toLocaleDateString()}</span>
                </div>
              )}
              <div className="detail-item">
                <label>End Date</label>
                <span>{new Date(lease.endDate).toLocaleDateString()}</span>
              </div>
              {lease.moveOutDate && (
                <div className="detail-item">
                  <label>Move-Out Date</label>
                  <span>{new Date(lease.moveOutDate).toLocaleDateString()}</span>
                </div>
              )}
              <div className="detail-item">
                <label>Rent Due Day</label>
                <span>Day {lease.rentDueDay} of month</span>
              </div>
              <div className="detail-item">
                <label>Notice Period</label>
                <span>{lease.noticePeriodDays} days</span>
              </div>
              <div className="detail-item">
                <label>Late Fee</label>
                <span>
                  ${Number(lease.lateFeeAmount).toLocaleString()} after {lease.lateFeeGraceDays} days
                </span>
              </div>
              {lease.utilitiesIncluded.length > 0 && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Utilities Included</label>
                  <span style={{ textTransform: 'capitalize' }}>{lease.utilitiesIncluded.join(', ')}</span>
                </div>
              )}
              {(lease.hasPetAddendum || lease.hasParkingAddendum) && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Addenda</label>
                  <span>
                    {lease.hasPetAddendum && (
                      <span>Pet{lease.petDepositAmount ? ` (deposit: $${Number(lease.petDepositAmount).toLocaleString()})` : ''}</span>
                    )}
                    {lease.hasPetAddendum && lease.hasParkingAddendum && ' · '}
                    {lease.hasParkingAddendum && (
                      <span>Parking{lease.parkingFee ? ` ($${Number(lease.parkingFee).toLocaleString()}/mo)` : ''}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
            {lease.notes && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Notes</label>
                <p style={{ fontSize: '14px', margin: 0 }}>{lease.notes}</p>
              </div>
            )}
            {(lease.renewalOf || lease.renewals.length > 0) && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)', display: 'grid', gap: '8px' }}>
                {lease.renewalOf && (
                  <div style={{ fontSize: '14px' }}>
                    <strong>Renewed from:</strong>{' '}
                    <Link href={`/leases/${lease.renewalOf.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                      Lease {new Date(lease.renewalOf.startDate).toLocaleDateString()} - {new Date(lease.renewalOf.endDate).toLocaleDateString()}
                    </Link>
                  </div>
                )}
                {lease.renewals[0] && (
                  <div style={{ fontSize: '14px' }}>
                    <strong>Renewed to:</strong>{' '}
                    <Link href={`/leases/${lease.renewals[0].id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                      Lease {new Date(lease.renewals[0].startDate).toLocaleDateString()} - {new Date(lease.renewals[0].endDate).toLocaleDateString()}
                    </Link>
                  </div>
                )}
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
            {lease.status === 'notice_given' && (
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    setMoveOutNoticeDate(lease.moveOutDate ? lease.moveOutDate.split('T')[0] : null);
                    setMoveOutDepositAmount(Number(lease.depositAmount));
                    setMoveOutDate('');
                    setMoveOutDeductions([]);
                    setMoveOutNotes('');
                    setMoveOutError('');
                    setShowMoveOut(true);
                  }}
                >
                  Move Out
                </button>
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
                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="month_to_month">Month to Month</option>
                      <option value="notice_given">Notice Given</option>
                      <option value="expired">Expired</option>
                      <option value="terminated">Terminated</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Security Deposit Status</label>
                    <select value={editSecurityDepositStatus} onChange={(e) => setEditSecurityDepositStatus(e.target.value)}>
                      <option value="held">Held</option>
                      <option value="partial_return">Partial Return</option>
                      <option value="full_return">Full Return</option>
                      <option value="applied_to_balance">Applied to Balance</option>
                    </select>
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
                <div className="form-group">
                  <label>Move-Out Date</label>
                  <input
                    type="date"
                    value={editMoveOutDate}
                    onChange={(e) => setEditMoveOutDate(e.target.value)}
                  />
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
                  This will terminate the current lease and create a new one with the same tenants and unit.
                </p>
                <div className="form-group">
                  <label>Lease Type</label>
                  <select value={renewLeaseType} onChange={(e) => setRenewLeaseType(e.target.value)}>
                    <option value="fixed_term">Fixed Term</option>
                    <option value="month_to_month">Month-to-Month</option>
                  </select>
                </div>
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

      {/* Move-Out Modal */}
      {showMoveOut && (
        <div className="modal-overlay" onClick={() => setShowMoveOut(false)}>
          <div className="modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Process Move-Out</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowMoveOut(false)}>✕</button>
            </div>
            <form onSubmit={handleMoveOut}>
              <div className="modal-body">
                {moveOutError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>
                    {moveOutError}
                  </div>
                )}

                {/* Notice move-out date reference */}
                {moveOutNoticeDate && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--color-surface)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    marginBottom: '16px',
                    fontSize: '13px',
                  }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Move-Out Date (from Notice)</span>
                    <span style={{ fontWeight: 600 }}>
                      {new Date(moveOutNoticeDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}

                {/* Actual move-out date */}
                <div className="form-group">
                  <label>Actual Move-Out Date <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <input
                    type="date"
                    required
                    max={localDateStr()}
                    value={moveOutDate}
                    onChange={(e) => setMoveOutDate(e.target.value)}
                  />
                </div>

                {/* Deposit summary */}
                <div style={{
                  background: 'var(--color-surface)',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Security Deposit</span>
                    <span>${moveOutDepositAmount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--color-danger)' }}>
                    <span>Total Deductions</span>
                    <span>-${moveOutDeductions.filter((d) => d.reason.trim() && d.amount).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0).toFixed(2)}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 600,
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: '4px',
                    marginTop: '4px',
                  }}>
                    <span>Return Amount</span>
                    <span style={{ color: 'var(--color-success)' }}>
                      ${Math.max(0, moveOutDepositAmount - moveOutDeductions.filter((d) => d.reason.trim() && d.amount).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Deduction line items */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontWeight: 500 }}>Deductions</label>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setMoveOutDeductions([...moveOutDeductions, { reason: '', amount: '' }])}
                    >
                      + Add Deduction
                    </button>
                  </div>
                  {moveOutDeductions.map((d, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                        <input
                          placeholder="Reason (e.g. Cleaning)"
                          value={d.reason}
                          onChange={(e) => {
                            const next = [...moveOutDeductions];
                            next[idx] = { ...next[idx], reason: e.target.value };
                            setMoveOutDeductions(next);
                          }}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Amount"
                          value={d.amount}
                          onChange={(e) => {
                            const next = [...moveOutDeductions];
                            next[idx] = { ...next[idx], amount: e.target.value };
                            setMoveOutDeductions(next);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => setMoveOutDeductions(moveOutDeductions.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {moveOutDeductions.length === 0 && (
                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      No deductions — full deposit will be returned.
                    </p>
                  )}
                </div>

                {/* Notes */}
                <div className="form-group">
                  <label>Notes (optional)</label>
                  <textarea
                    rows={3}
                    value={moveOutNotes}
                    onChange={(e) => setMoveOutNotes(e.target.value)}
                    placeholder="Any additional notes about the move-out..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowMoveOut(false)}
                  disabled={moveOutSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger" disabled={moveOutSubmitting}>
                  {moveOutSubmitting ? 'Processing...' : 'Confirm Move-Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DocumentPanel entityType="lease" entityId={leaseId} />
    </>
  );
}
