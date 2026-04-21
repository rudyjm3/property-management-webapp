'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Payment {
  id: string;
  amount: string;
  type: string;
  status: string;
  method: string;
  checkNumber: string | null;
  referenceNote: string | null;
  stripePaymentIntentId: string | null;
  dueDate: string;
  paidAt: string | null;
  notes: string | null;
  isLate: boolean;
  lateFeeApplied: boolean;
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

interface LedgerEntry {
  id: string;
  type: 'credit' | 'debit';
  amount: string;
  balanceAfter: string;
  description: string;
  createdAt: string;
}

interface LeaseOption {
  id: string;
  label: string;
  rentAmount: number;
  tenants: Array<{ id: string; name: string; email: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'badge-occupied',
  pending: 'badge-notice',
  failed: 'badge-danger',
  waived: 'badge-vacant',
  refunded: 'badge-danger',
};

const TYPE_LABELS: Record<string, string> = {
  rent: 'Rent',
  deposit: 'Deposit',
  late_fee: 'Late Fee',
  pet_deposit: 'Pet Deposit',
  parking: 'Parking',
  credit: 'Credit',
  other: 'Other',
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  money_order: 'Money Order',
  ach: 'ACH',
  card: 'Card',
  other: 'Other',
};

const FILTER_STATUSES = ['', 'pending', 'completed', 'failed', 'waived', 'refunded'];
const FILTER_TYPES = [
  '',
  'rent',
  'deposit',
  'late_fee',
  'pet_deposit',
  'parking',
  'credit',
  'other',
];

/** Format a @db.Date string (UTC midnight) as a date without timezone shift. */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { timeZone: 'UTC' });
}

export default function PaymentsPage() {
  const searchParams = useSearchParams();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') ?? '');
  const [filterType, setFilterType] = useState(searchParams.get('type') ?? '');
  const [filterPropertyId, setFilterPropertyId] = useState('');
  const [filterTenantId, setFilterTenantId] = useState('');
  const [searchPayment, setSearchPayment] = useState('');
  const [propertiesForFilter, setPropertiesForFilter] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [tenantsForFilter, setTenantsForFilter] = useState<Array<{ id: string; name: string }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [runningLateFeeJob, setRunningLateFeeJob] = useState(false);
  const [lateFeeJobResult, setLateFeeJobResult] = useState<string | null>(null);
  const [runningRentReminders, setRunningRentReminders] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'payments' | 'ledger'>('payments');
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Connect status (for ACH initiation eligibility)
  const [connectStatus, setConnectStatus] = useState<
    'not_connected' | 'pending' | 'active' | 'restricted'
  >('not_connected');

  // ACH modal state
  const [achPayment, setAchPayment] = useState<Payment | null>(null);
  const [achLoading, setAchLoading] = useState(false);
  const [achError, setAchError] = useState('');
  const [achResult, setAchResult] = useState<{
    clientSecret: string;
    paymentIntentId: string;
    status: string;
  } | null>(null);

  // Mark Paid modal state
  const [markPaidPayment, setMarkPaidPayment] = useState<Payment | null>(null);
  const [markPaidMethod, setMarkPaidMethod] = useState('other');
  const [markPaidCheckNumber, setMarkPaidCheckNumber] = useState('');
  const [markPaidReferenceNote, setMarkPaidReferenceNote] = useState('');
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false);
  const [markPaidError, setMarkPaidError] = useState('');

  // Edit modal state
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editMethod, setEditMethod] = useState('other');
  const [editCheckNumber, setEditCheckNumber] = useState('');
  const [editReferenceNote, setEditReferenceNote] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // Log Payment form options
  const [leaseOptions, setLeaseOptions] = useState<LeaseOption[]>([]);
  const [formLoading, setFormLoading] = useState(false);

  // Log Payment form state
  const [leaseId, setLeaseId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('rent');
  const [status, setStatus] = useState('completed');
  const [method, setMethod] = useState('other');
  const [checkNumber, setCheckNumber] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
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
      setPayments(result);
    } catch (err) {
      console.error('Failed to load payments:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    api.connect
      .getStatus()
      .then((s) => setConnectStatus(s.stripeAccountStatus))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([api.properties.list(), api.tenants.list()])
      .then(([props, tenants]) => {
        setPropertiesForFilter(props.map((p: any) => ({ id: p.id, name: p.name })));
        setTenantsForFilter(tenants.map((t: any) => ({ id: t.id, name: t.name })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab !== 'ledger') return;
    setLedgerLoading(true);
    api.ledger
      .list({ limit: 50 })
      .then((entries) => setLedgerEntries(entries as LedgerEntry[]))
      .catch(console.error)
      .finally(() => setLedgerLoading(false));
  }, [activeTab]);

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
        method,
        checkNumber: checkNumber || null,
        referenceNote: referenceNote || null,
        periodStart: periodStart || null,
        periodEnd: periodEnd || null,
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
    setMethod('other');
    setCheckNumber('');
    setReferenceNote('');
    setPeriodStart('');
    setPeriodEnd('');
    setDueDate('');
    setNotes('');
  }

  function openAchModal(payment: Payment) {
    setAchPayment(payment);
    setAchError('');
    setAchResult(null);
  }

  async function handleInitiateACH() {
    if (!achPayment) return;
    setAchLoading(true);
    setAchError('');
    try {
      const result = await api.payments.initiateACH(achPayment.id);
      setAchResult(result);
      await loadPayments();
    } catch (err: any) {
      setAchError(err.message || 'Failed to initiate ACH');
    } finally {
      setAchLoading(false);
    }
  }

  async function handleCancelACH(payment: Payment) {
    if (!confirm(`Cancel the ACH PaymentIntent for ${payment.tenant.name}?`)) return;
    try {
      await api.payments.cancelACH(payment.id);
      await loadPayments();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel ACH');
    }
  }

  async function handleRunLateFeeJob() {
    setRunningLateFeeJob(true);
    setLateFeeJobResult(null);
    try {
      const result = await api.notifications.triggerLateFees();
      setLateFeeJobResult(
        `Applied ${result.lateFees.applied} late fee(s) — ${result.lateFees.skipped} skipped`
      );
      await loadPayments();
    } catch (err: any) {
      setLateFeeJobResult(`Error: ${err.message}`);
    } finally {
      setRunningLateFeeJob(false);
    }
  }

  // ── Mark Paid modal ──────────────────────────────────────────────────────────

  function openMarkPaid(payment: Payment) {
    setMarkPaidPayment(payment);
    setMarkPaidMethod('other');
    setMarkPaidCheckNumber('');
    setMarkPaidReferenceNote('');
    setMarkPaidError('');
  }

  function closeMarkPaid() {
    setMarkPaidPayment(null);
    setMarkPaidError('');
  }

  async function handleMarkPaid() {
    if (!markPaidPayment) return;
    setMarkPaidSubmitting(true);
    setMarkPaidError('');
    try {
      await api.payments.update(markPaidPayment.id, {
        status: 'completed',
        method: markPaidMethod,
        checkNumber: markPaidCheckNumber || null,
        referenceNote: markPaidReferenceNote || null,
      });
      closeMarkPaid();
      loadPayments();
    } catch (err: any) {
      setMarkPaidError(err.message || 'Failed to mark payment as paid');
    } finally {
      setMarkPaidSubmitting(false);
    }
  }

  // ── Edit modal ───────────────────────────────────────────────────────────────

  function openEditModal(payment: Payment) {
    setEditPayment(payment);
    setEditMethod(payment.method || 'other');
    setEditCheckNumber(payment.checkNumber || '');
    setEditReferenceNote(payment.referenceNote || '');
    setEditNotes(payment.notes || '');
    setEditAmount(String(Number(payment.amount)));
    // dueDate comes as ISO UTC string; extract the date part for the input
    setEditDueDate(payment.dueDate.split('T')[0]);
    setEditError('');
  }

  function closeEditModal() {
    setEditPayment(null);
    setEditError('');
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editPayment) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      await api.payments.update(editPayment.id, {
        method: editMethod,
        checkNumber: editCheckNumber || null,
        referenceNote: editReferenceNote || null,
        notes: editNotes || null,
        amount: parseFloat(editAmount),
        dueDate: editDueDate,
      });
      closeEditModal();
      loadPayments();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update payment');
    } finally {
      setEditSubmitting(false);
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
  const visiblePayments = payments.filter((payment) => {
    if (searchPayment) {
      const query = searchPayment.toLowerCase();
      const matchesSearch =
        payment.tenant.name.toLowerCase().includes(query) ||
        payment.tenant.email.toLowerCase().includes(query) ||
        payment.lease.unit.unitNumber.toLowerCase().includes(query) ||
        payment.lease.unit.property.name.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    if (filterPropertyId && payment.lease.unit.property.id !== filterPropertyId) return false;
    if (filterTenantId && payment.tenant.id !== filterTenantId) return false;

    return true;
  });
  const hasActivePaymentFilters = Boolean(
    searchPayment || filterStatus || filterType || filterPropertyId || filterTenantId
  );

  const selectedLeaseForForm = leaseOptions.find((l) => l.id === leaseId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            {payments.length} records &middot; ${totalCollected.toLocaleString()} collected &middot;
            ${totalPending.toLocaleString()} pending
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {lateFeeJobResult && (
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              {lateFeeJobResult}
            </span>
          )}
          <button
            className="btn btn-secondary"
            onClick={async () => {
              setRunningRentReminders(true);
              try {
                await api.notifications.triggerRentReminders();
                alert('Rent reminders sent.');
              } catch (err: any) {
                alert(err.message || 'Failed to send reminders.');
              } finally {
                setRunningRentReminders(false);
              }
            }}
            disabled={runningRentReminders}
          >
            {runningRentReminders ? 'Sending…' : 'Send Rent Reminders'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleRunLateFeeJob}
            disabled={runningLateFeeJob}
          >
            {runningLateFeeJob ? 'Running…' : 'Run Late Fee Job'}
          </button>
          <button className="btn btn-primary" onClick={openForm}>
            + Log Payment
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0',
          marginBottom: '24px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {(['payments', 'ledger'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px',
              fontSize: '14px',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottomStyle: 'solid',
              borderBottomWidth: '2px',
              borderBottomColor: activeTab === tab ? 'var(--color-primary)' : 'transparent',
              background: 'none',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Payments tab */}
      {activeTab === 'payments' && (
        <>
          <div className="filter-bar">
            <div className="filter-search">
              <label className="filter-label" htmlFor="payment-search">
                Search
              </label>
              <div className="filter-search-input-wrap">
                <svg
                  className="filter-search-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  id="payment-search"
                  type="text"
                  placeholder="Tenant, email, unit or property..."
                  value={searchPayment}
                  onChange={(e) => setSearchPayment(e.target.value)}
                  className={`filter-search-input${searchPayment ? ' has-clear' : ''}`}
                />
                {searchPayment && (
                  <button
                    type="button"
                    aria-label="Clear payment search"
                    onClick={() => setSearchPayment('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-text-muted)',
                      fontSize: '16px',
                      lineHeight: 1,
                      padding: '0 2px',
                    }}
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            <div className="filter-divider" />

            <div className="filter-group">
              <label className="filter-label" htmlFor="payment-status-filter">
                Status
              </label>
              <select
                id="payment-status-filter"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={`filter-select${filterStatus ? ' filter-select-active-primary' : ''}`}
              >
                <option value="">All Statuses</option>
                {FILTER_STATUSES.filter(Boolean).map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label" htmlFor="payment-type-filter">
                Type
              </label>
              <select
                id="payment-type-filter"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className={`filter-select${filterType ? ' filter-select-active-primary' : ''}`}
              >
                <option value="">All Types</option>
                {FILTER_TYPES.filter(Boolean).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group filter-group-wide">
              <label className="filter-label" htmlFor="payment-property-filter">
                Property
              </label>
              <select
                id="payment-property-filter"
                value={filterPropertyId}
                onChange={(e) => setFilterPropertyId(e.target.value)}
                className={`filter-select${filterPropertyId ? ' filter-select-active-primary' : ''}`}
              >
                <option value="">All Properties</option>
                {propertiesForFilter.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group filter-group-wide">
              <label className="filter-label" htmlFor="payment-tenant-filter">
                Tenant
              </label>
              <select
                id="payment-tenant-filter"
                value={filterTenantId}
                onChange={(e) => setFilterTenantId(e.target.value)}
                className={`filter-select${filterTenantId ? ' filter-select-active-primary' : ''}`}
              >
                <option value="">All Tenants</option>
                {tenantsForFilter.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {hasActivePaymentFilters && (
              <div className="filter-summary">
                <span className="filter-label">Results</span>
                <div className="filter-summary-row">
                  <span className="filter-count">{visiblePayments.length}</span>
                  <button
                    type="button"
                    className="filter-clear-button"
                    onClick={() => {
                      setSearchPayment('');
                      setFilterStatus('');
                      setFilterType('');
                      setFilterPropertyId('');
                      setFilterTenantId('');
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="loading">Loading payments...</div>
          ) : visiblePayments.length === 0 ? (
            <div className="empty-state">
              <h3>No payments found</h3>
              <p>
                {hasActivePaymentFilters
                  ? 'Try adjusting your filters.'
                  : 'Log the first payment to get started.'}
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Unit / Property</th>
                    <th>Type</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                    <th>Paid On</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <Link href={`/tenants/${payment.tenant.id}`} style={{ fontWeight: 500 }}>
                          {payment.tenant.name}
                        </Link>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          {payment.tenant.email}
                        </div>
                      </td>
                      <td>
                        <Link
                          href={`/properties/${payment.lease.unit.property.id}/units/${payment.lease.unit.id}`}
                        >
                          Unit {payment.lease.unit.unitNumber}
                        </Link>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          {payment.lease.unit.property.name}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {TYPE_LABELS[payment.type] ?? payment.type}
                          {payment.type === 'late_fee' && (
                            <span
                              style={{
                                background: '#f59e0b',
                                color: '#fff',
                                borderRadius: '4px',
                                fontSize: '10px',
                                padding: '1px 5px',
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                              }}
                            >
                              LATE FEE
                            </span>
                          )}
                          {payment.isLate && payment.type !== 'late_fee' && (
                            <span
                              style={{
                                background: 'var(--color-danger)',
                                color: '#fff',
                                borderRadius: '4px',
                                fontSize: '10px',
                                padding: '1px 5px',
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                              }}
                            >
                              LATE
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div>{METHOD_LABELS[payment.method] ?? payment.method}</div>
                        {payment.checkNumber && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            #{payment.checkNumber}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        ${Number(payment.amount).toLocaleString()}
                      </td>
                      <td>{formatDate(payment.dueDate)}</td>
                      <td>
                        {payment.paidAt ? (
                          new Date(payment.paidAt).toLocaleDateString()
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            alignItems: 'flex-start',
                          }}
                        >
                          <span
                            className={`badge ${STATUS_COLORS[payment.status] ?? 'badge-vacant'}`}
                          >
                            {payment.status}
                          </span>
                          {payment.status === 'pending' && payment.stripePaymentIntentId && (
                            <span
                              style={{
                                background: '#e0f2fe',
                                color: '#0369a1',
                                borderRadius: '4px',
                                fontSize: '10px',
                                padding: '1px 5px',
                                fontWeight: 600,
                              }}
                            >
                              PROCESSING
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {payment.status === 'pending' && !payment.stripePaymentIntentId && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => openMarkPaid(payment)}
                            >
                              Mark Paid
                            </button>
                          )}
                          {payment.status === 'pending' &&
                            connectStatus === 'active' &&
                            !payment.stripePaymentIntentId && (
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => openAchModal(payment)}
                              >
                                Initiate ACH
                              </button>
                            )}
                          {payment.status === 'pending' && payment.stripePaymentIntentId && (
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{ color: 'var(--color-danger)' }}
                              onClick={() => handleCancelACH(payment)}
                            >
                              Cancel ACH
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openEditModal(payment)}
                          >
                            Edit
                          </button>
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
        </>
      )}

      {/* Ledger tab */}
      {activeTab === 'ledger' &&
        (ledgerLoading ? (
          <div className="loading">Loading ledger…</div>
        ) : ledgerEntries.length === 0 ? (
          <div className="empty-state">
            <h3>No ledger entries yet</h3>
            <p>
              Ledger entries are created automatically when ACH payments settle via Stripe webhooks.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Balance After</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <span
                        style={{
                          color:
                            entry.type === 'credit'
                              ? 'var(--color-success, #16a34a)'
                              : 'var(--color-danger)',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          fontSize: '11px',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {entry.type}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {entry.description}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      <span
                        style={{
                          color:
                            entry.type === 'credit'
                              ? 'var(--color-success, #16a34a)'
                              : 'var(--color-danger)',
                        }}
                      >
                        {entry.type === 'credit' ? '+' : '-'}$
                        {Number(entry.amount).toLocaleString()}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      ${Number(entry.balanceAfter).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* ACH Initiation Modal */}
      {achPayment && (
        <div className="modal-overlay" onClick={() => setAchPayment(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h2>Initiate ACH Payment</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setAchPayment(null)}>
                X
              </button>
            </div>
            <div className="modal-body">
              {achError && (
                <div
                  style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}
                >
                  {achError}
                </div>
              )}
              {achResult ? (
                <div>
                  <p
                    style={{
                      color: 'var(--color-success, #16a34a)',
                      marginBottom: '8px',
                      fontWeight: 600,
                    }}
                  >
                    PaymentIntent created successfully
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    Status: <strong>{achResult.status}</strong>
                  </p>
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-text-muted)',
                      marginTop: '4px',
                      wordBreak: 'break-all',
                    }}
                  >
                    Intent ID: {achResult.paymentIntentId}
                  </p>
                  <p style={{ fontSize: '13px', marginTop: '12px' }}>
                    The ACH debit has been submitted. Payment status will update automatically via
                    webhook when the transfer settles (typically 3–5 business days).
                  </p>
                </div>
              ) : (
                <div>
                  <p>This will create an ACH debit PaymentIntent for:</p>
                  <ul
                    style={{
                      margin: '12px 0',
                      paddingLeft: '20px',
                      fontSize: '14px',
                      lineHeight: '1.8',
                    }}
                  >
                    <li>
                      <strong>{achPayment.tenant.name}</strong>
                    </li>
                    <li>
                      Amount: <strong>${Number(achPayment.amount).toLocaleString()}</strong>
                    </li>
                    <li>
                      Type: <strong>{TYPE_LABELS[achPayment.type] ?? achPayment.type}</strong>
                    </li>
                  </ul>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    Funds will be transferred to your connected Stripe bank account after the ACH
                    debit settles.
                  </p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAchPayment(null)}
              >
                {achResult ? 'Close' : 'Cancel'}
              </button>
              {!achResult && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={achLoading}
                  onClick={handleInitiateACH}
                >
                  {achLoading ? 'Creating…' : 'Confirm ACH'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {markPaidPayment && (
        <div className="modal-overlay" onClick={closeMarkPaid}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2>Mark as Paid</h2>
              <button className="btn btn-sm btn-secondary" onClick={closeMarkPaid}>
                X
              </button>
            </div>
            <div className="modal-body">
              {markPaidError && (
                <div
                  style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}
                >
                  {markPaidError}
                </div>
              )}
              <p style={{ marginBottom: '16px', fontSize: '14px' }}>
                Recording payment of{' '}
                <strong>${Number(markPaidPayment.amount).toLocaleString()}</strong> for{' '}
                <strong>{markPaidPayment.tenant.name}</strong>
              </p>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Method</label>
                  <select
                    value={markPaidMethod}
                    onChange={(e) => setMarkPaidMethod(e.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="money_order">Money Order</option>
                    <option value="ach">ACH</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {(markPaidMethod === 'check' || markPaidMethod === 'money_order') && (
                  <div className="form-group">
                    <label>{markPaidMethod === 'check' ? 'Check #' : 'Money Order #'}</label>
                    <input
                      type="text"
                      placeholder="e.g. 1042"
                      value={markPaidCheckNumber}
                      onChange={(e) => setMarkPaidCheckNumber(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Reference / Note (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. dropped off at office"
                  value={markPaidReferenceNote}
                  onChange={(e) => setMarkPaidReferenceNote(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeMarkPaid}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={markPaidSubmitting}
                onClick={handleMarkPaid}
              >
                {markPaidSubmitting ? 'Saving…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editPayment && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Edit Payment</h2>
              <button className="btn btn-sm btn-secondary" onClick={closeEditModal}>
                X
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                {editError && (
                  <div
                    style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}
                  >
                    {editError}
                  </div>
                )}
                <div
                  style={{
                    marginBottom: '12px',
                    fontSize: '13px',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {editPayment.tenant.name} — {TYPE_LABELS[editPayment.type] ?? editPayment.type}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount ($)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Due Date</label>
                    <input
                      type="date"
                      required
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Payment Method</label>
                    <select value={editMethod} onChange={(e) => setEditMethod(e.target.value)}>
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="money_order">Money Order</option>
                      <option value="ach">ACH</option>
                      <option value="card">Card</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {(editMethod === 'check' || editMethod === 'money_order') && (
                    <div className="form-group">
                      <label>{editMethod === 'check' ? 'Check #' : 'Money Order #'}</label>
                      <input
                        type="text"
                        placeholder="e.g. 1042"
                        value={editCheckNumber}
                        onChange={(e) => setEditCheckNumber(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Reference / Note</label>
                  <input
                    type="text"
                    placeholder="e.g. ACH confirmation #, memo line"
                    value={editReferenceNote}
                    onChange={(e) => setEditReferenceNote(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Notes (optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Additional notes..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeEditModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={editSubmitting}>
                  {editSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Payment Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2>Log Payment</h2>
              <button className="btn btn-sm btn-secondary" onClick={closeForm}>
                X
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div
                    style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}
                  >
                    {formError}
                  </div>
                )}
                {formLoading ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#6b7280' }}>
                    Loading…
                  </div>
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
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
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
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.email})
                            </option>
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
                          <option value="pet_deposit">Pet Deposit</option>
                          <option value="parking">Parking</option>
                          <option value="credit">Credit</option>
                          <option value="other">Other</option>
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
                        <label>Payment Method</label>
                        <select value={method} onChange={(e) => setMethod(e.target.value)}>
                          <option value="cash">Cash</option>
                          <option value="check">Check</option>
                          <option value="money_order">Money Order</option>
                          <option value="ach">ACH</option>
                          <option value="card">Card</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      {(method === 'check' || method === 'money_order') && (
                        <div className="form-group">
                          <label>{method === 'check' ? 'Check #' : 'Money Order #'}</label>
                          <input
                            type="text"
                            placeholder="e.g. 1234"
                            value={checkNumber}
                            onChange={(e) => setCheckNumber(e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Reference / Note</label>
                      <input
                        type="text"
                        placeholder="e.g. ACH confirmation #, memo line"
                        value={referenceNote}
                        onChange={(e) => setReferenceNote(e.target.value)}
                      />
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

                    <div className="form-row">
                      <div className="form-group">
                        <label>Period Start</label>
                        <input
                          type="date"
                          value={periodStart}
                          onChange={(e) => setPeriodStart(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Period End</label>
                        <input
                          type="date"
                          value={periodEnd}
                          onChange={(e) => setPeriodEnd(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Notes (optional)</label>
                      <textarea
                        rows={2}
                        placeholder="Additional notes..."
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
