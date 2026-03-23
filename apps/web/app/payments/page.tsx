'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Payment {
  id: string;
  amount: string;
  type: string;
  status: string;
  dueDate: string;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  lease: {
    id: string;
    rentAmount: string;
    unit: {
      id: string;
      unitNumber: string;
      property: { id: string; name: string };
    };
  };
  tenant: { id: string; name: string; email: string };
}

interface LeaseOption {
  id: string;
  label: string;
  rentAmount: number;
  tenants: Array<{ id: string; name: string; email: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'badge-occupied',
  pending: 'badge-maintenance',
  failed: 'badge-notice',
  waived: 'badge-vacant',
};

const TYPE_LABELS: Record<string, string> = {
  rent: 'Rent',
  deposit: 'Deposit',
  late_fee: 'Late Fee',
  credit: 'Credit',
};

const FILTER_STATUSES = ['', 'pending', 'completed', 'failed', 'waived'];
const FILTER_TYPES = ['', 'rent', 'deposit', 'late_fee', 'credit'];

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form options
  const [leaseOptions, setLeaseOptions] = useState<LeaseOption[]>([]);
  const [formLoading, setFormLoading] = useState(false);

  // Form state
  const [leaseId, setLeaseId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('rent');
  const [status, setStatus] = useState('completed');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.payments.list({
        status: filterStatus || undefined,
        type: filterType || undefined,
        limit: 100,
      });
      setPayments(result.data);
    } catch (err) {
      console.error('Failed to load payments:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  async function openForm() {
    setShowForm(true);
    setFormLoading(true);
    try {
      const leases = await api.leases.list();
      setLeaseOptions(
        leases.map((l: any) => ({
          id: l.id,
          label: `Unit ${l.unit.unitNumber} — ${l.unit.property.name} (${l.status.replace(/_/g, ' ')})`,
          rentAmount: Number(l.rentAmount),
          tenants: l.participants.map((p: any) => p.tenant),
        }))
      );
      // Default date to today
      setDueDate(new Date().toISOString().split('T')[0]);
    } catch (err) {
      console.error('Failed to load form data:', err);
    } finally {
      setFormLoading(false);
    }
  }

  function handleLeaseChange(selectedLeaseId: string) {
    setLeaseId(selectedLeaseId);
    const lease = leaseOptions.find((l) => l.id === selectedLeaseId);
    if (lease) {
      setAmount(String(lease.rentAmount));
      setTenantId(lease.tenants[0]?.id || '');
    } else {
      setAmount('');
      setTenantId('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await api.payments.create({
        leaseId,
        tenantId,
        amount: parseFloat(amount),
        type,
        status,
        dueDate,
        notes: notes || null,
      });
      closeForm();
      loadPayments();
    } catch (err: any) {
      setFormError(err.message || 'Failed to log payment');
    } finally {
      setSubmitting(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setFormError('');
    setLeaseId('');
    setTenantId('');
    setAmount('');
    setType('rent');
    setStatus('completed');
    setDueDate('');
    setNotes('');
  }

  async function markAsPaid(paymentId: string) {
    try {
      await api.payments.update(paymentId, { status: 'completed' });
      loadPayments();
    } catch (err) {
      console.error('Failed to update payment:', err);
    }
  }

  async function handleDelete(paymentId: string) {
    if (!confirm('Delete this payment record?')) return;
    try {
      await api.payments.delete(paymentId);
      loadPayments();
    } catch (err) {
      console.error('Failed to delete payment:', err);
    }
  }

  const totalCollected = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const totalPending = payments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const selectedLeaseForForm = leaseOptions.find((l) => l.id === leaseId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            {payments.length} records &middot; ${totalCollected.toLocaleString()} collected &middot; ${totalPending.toLocaleString()} pending
          </p>
        </div>
        <button className="btn btn-primary" onClick={openForm}>
          + Log Payment
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'white' }}
        >
          <option value="">All Statuses</option>
          {FILTER_STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'white' }}
        >
          <option value="">All Types</option>
          {FILTER_TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        {(filterStatus || filterType) && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => { setFilterStatus(''); setFilterType(''); }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading payments...</div>
      ) : payments.length === 0 ? (
        <div className="empty-state">
          <h3>No payments found</h3>
          <p>{filterStatus || filterType ? 'Try adjusting your filters.' : 'Log the first payment to get started.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit / Property</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Paid On</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <Link href={`/tenants/${payment.tenant.id}`} style={{ fontWeight: 500 }}>
                      {payment.tenant.name}
                    </Link>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{payment.tenant.email}</div>
                  </td>
                  <td>
                    <Link href={`/properties/${payment.lease.unit.property.id}/units/${payment.lease.unit.id}`}>
                      Unit {payment.lease.unit.unitNumber}
                    </Link>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {payment.lease.unit.property.name}
                    </div>
                  </td>
                  <td>{TYPE_LABELS[payment.type] ?? payment.type}</td>
                  <td style={{ fontWeight: 600 }}>${Number(payment.amount).toLocaleString()}</td>
                  <td>{new Date(payment.dueDate).toLocaleDateString()}</td>
                  <td>
                    {payment.paidAt
                      ? new Date(payment.paidAt).toLocaleDateString()
                      : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[payment.status] ?? 'badge-vacant'}`}>
                      {payment.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {payment.status === 'pending' && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => markAsPaid(payment.id)}
                        >
                          Mark Paid
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-secondary"
                        style={{ color: 'var(--color-danger)' }}
                        onClick={() => handleDelete(payment.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Payment Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2>Log Payment</h2>
              <button className="btn btn-sm btn-secondary" onClick={closeForm}>X</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>
                    {formError}
                  </div>
                )}
                {formLoading ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#6b7280' }}>Loading…</div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Lease</label>
                      <select
                        required
                        value={leaseId}
                        onChange={(e) => handleLeaseChange(e.target.value)}
                      >
                        <option value="">— Select a lease —</option>
                        {leaseOptions.map((l) => (
                          <option key={l.id} value={l.id}>{l.label}</option>
                        ))}
                      </select>
                    </div>

                    {selectedLeaseForForm && selectedLeaseForForm.tenants.length > 0 && (
                      <div className="form-group">
                        <label>Tenant</label>
                        <select
                          required
                          value={tenantId}
                          onChange={(e) => setTenantId(e.target.value)}
                        >
                          <option value="">— Select a tenant —</option>
                          {selectedLeaseForForm.tenants.map((t) => (
                            <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-row">
                      <div className="form-group">
                        <label>Type</label>
                        <select value={type} onChange={(e) => setType(e.target.value)}>
                          <option value="rent">Rent</option>
                          <option value="deposit">Deposit</option>
                          <option value="late_fee">Late Fee</option>
                          <option value="credit">Credit</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Status</label>
                        <select value={status} onChange={(e) => setStatus(e.target.value)}>
                          <option value="completed">Completed</option>
                          <option value="pending">Pending</option>
                          <option value="failed">Failed</option>
                          <option value="waived">Waived</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Amount ($)</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          placeholder="1500.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Due Date</label>
                        <input
                          type="date"
                          required
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Notes (optional)</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Paid by check #1234"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Log Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
