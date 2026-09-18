'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, type Eviction, type EvictionInput, type EvictionNoticeType, type EvictionDeliveryMethod, type StateEvictionRule } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { EVICTION_DEADLINE_WARNING_DAYS } from '@propflow/shared';

const NOTICE_TYPE_LABELS: Record<EvictionNoticeType, string> = {
  pay_or_quit: 'Pay or Quit',
  cure_or_quit: 'Cure or Quit',
  unconditional_quit: 'Unconditional Quit',
};

const DELIVERY_METHOD_LABELS: Record<EvictionDeliveryMethod, string> = {
  certified_mail: 'Certified Mail',
  personal_service: 'Personal Service',
  posting: 'Posting',
};

const STATUS_LABELS: Record<string, string> = {
  notice_served: 'Notice Served',
  cured: 'Cured',
  paid: 'Paid',
  expired: 'Expired',
  filed: 'Filed',
  court_date_set: 'Court Date Set',
  judgment: 'Judgment',
  writ_issued: 'Writ Issued',
  completed: 'Completed',
  dismissed: 'Dismissed',
};

const STATUS_BADGE: Record<string, string> = {
  notice_served: 'badge-notice',
  cured: 'badge-occupied',
  paid: 'badge-occupied',
  expired: 'badge-danger',
  filed: 'badge-maintenance',
  court_date_set: 'badge-maintenance',
  judgment: 'badge-accent',
  writ_issued: 'badge-danger',
  completed: 'badge-vacant',
  dismissed: 'badge-neutral',
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function deadlineFlag(days: number | null): { label: string; badge: string } | null {
  if (days === null) return null;
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, badge: 'badge-danger' };
  if (days <= EVICTION_DEADLINE_WARNING_DAYS.red) return { label: `${days}d left`, badge: 'badge-danger' };
  if (days <= EVICTION_DEADLINE_WARNING_DAYS.yellow) return { label: `${days}d left`, badge: 'badge-notice' };
  return { label: `${days}d left`, badge: 'badge-vacant' };
}

interface LeaseOption {
  id: string;
  status: string;
  unit: { unitNumber: string; propertyId: string; property: { id: string; name: string; state?: string } };
  participants: { isPrimary: boolean; tenant: { name: string } }[];
}

function emptyForm(leaseId = ''): EvictionInput {
  return {
    leaseId,
    noticeType: 'pay_or_quit',
    noticeDate: new Date().toISOString().slice(0, 10),
    deliveryMethod: 'personal_service',
    deliveryDate: '',
    servedByUserId: '',
    servedByName: '',
    noticePeriodDays: null,
    overrideReason: '',
    notes: '',
  };
}

export default function EvictionsPage() {
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const [evictions, setEvictions] = useState<Eviction[]>([]);
  const [leases, setLeases] = useState<LeaseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EvictionInput>(emptyForm());
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggestedRule, setSuggestedRule] = useState<StateEvictionRule | null>(null);
  const [ruleLookupState, setRuleLookupState] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [evictionData, leaseData] = await Promise.all([
        api.evictions.list(),
        api.leases.list() as Promise<LeaseOption[]>,
      ]);
      setEvictions(evictionData);
      setLeases(leaseData.filter((l) => ['active', 'month_to_month', 'notice_given'].includes(l.status)));
    } catch (err) {
      console.error('Failed to load evictions:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const preselectLeaseId = searchParams.get('newForLease');
    if (preselectLeaseId) {
      setForm(emptyForm(preselectLeaseId));
      setShowForm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Looks up the jurisdiction reference rule for the selected lease's
  // property state + notice type, so the manager sees a suggested notice
  // period/delivery methods before submitting — a UX convenience only; the
  // API performs the authoritative lookup + override validation itself.
  useEffect(() => {
    async function lookup() {
      setSuggestedRule(null);
      if (!form.leaseId || !form.noticeType) return;
      const lease = leases.find((l) => l.id === form.leaseId);
      if (!lease) return;
      try {
        const property = await api.properties.get(lease.unit.propertyId);
        const state = property.state as string;
        setRuleLookupState(state);
        const rules = await api.stateEvictionRules.list(state);
        const match = rules.find((r) => r.noticeType === form.noticeType) ?? null;
        setSuggestedRule(match);
        if (match && (form.noticePeriodDays === null || form.noticePeriodDays === undefined)) {
          setForm((f) => ({ ...f, noticePeriodDays: match.noticePeriodDays }));
        }
      } catch (err) {
        console.error('Jurisdiction rule lookup failed:', err);
      }
    }
    lookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.leaseId, form.noticeType]);

  function openForm() {
    setForm(emptyForm());
    setFormError('');
    setSuggestedRule(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
  }

  const overrideDiffers =
    suggestedRule &&
    ((form.noticePeriodDays != null && form.noticePeriodDays !== suggestedRule.noticePeriodDays) ||
      !suggestedRule.allowedDeliveryMethods.includes(form.deliveryMethod));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.leaseId) {
      setFormError('Select a lease.');
      return;
    }
    if (!suggestedRule && (form.noticePeriodDays == null || form.noticePeriodDays === undefined)) {
      setFormError('No jurisdiction rule was found for this state/notice type — enter a notice period manually.');
      return;
    }
    if (overrideDiffers && !form.overrideReason) {
      setFormError('Notice period or delivery method differs from the jurisdiction rule — an override reason is required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.evictions.create({
        ...form,
        deliveryDate: form.deliveryDate || null,
        servedByUserId: form.servedByUserId || null,
        servedByName: form.servedByName || null,
        overrideReason: form.overrideReason || null,
        notes: form.notes || null,
      });
      closeForm();
      loadAll();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create eviction notice');
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = useMemo(() => {
    return evictions.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const tenant = e.lease.participants[0]?.tenant.name.toLowerCase() ?? '';
        const property = e.lease.unit.property.name.toLowerCase();
        const unit = e.lease.unit.unitNumber.toLowerCase();
        if (!tenant.includes(q) && !property.includes(q) && !unit.includes(q)) return false;
      }
      return true;
    });
  }, [evictions, statusFilter, search]);

  const flaggedCount = evictions.filter((e) => {
    const dDays = e.status === 'notice_served' ? daysUntil(e.deadlineDate) : null;
    const cDays = e.status === 'court_date_set' ? daysUntil(e.courtDate) : null;
    return (dDays !== null && dDays <= EVICTION_DEADLINE_WARNING_DAYS.yellow) || (cDays !== null && cDays <= EVICTION_DEADLINE_WARNING_DAYS.yellow);
  }).length;

  if (loading) return <div className="loading">Loading evictions...</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Evictions</h1>
          <p className="page-subtitle">
            {evictions.length} total{flaggedCount > 0 ? ` · ${flaggedCount} with an upcoming deadline` : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openForm}>
          + New Eviction Notice
        </button>
      </div>

      <div
        style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#92400e',
        }}
      >
        <strong>Not legal advice.</strong> Notice periods and delivery methods shown here are reference data
        compiled for this app, not a verified compliance database — confirm current requirements with local
        counsel or your court before relying on any date computed here. See the disclosure on each notice for
        its source and last-verified date.
      </div>

      {evictions.length > 0 && (
        <div className="filter-bar">
          <div className="filter-search">
            <label className="filter-label" htmlFor="eviction-search">
              Search
            </label>
            <input
              id="eviction-search"
              type="text"
              placeholder="Tenant, property or unit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-search-input"
            />
          </div>
          <div className="filter-divider" />
          <div className="filter-group">
            <label className="filter-label" htmlFor="eviction-status-filter">
              Status
            </label>
            <select
              id="eviction-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`filter-select${statusFilter ? ' filter-select-active-primary' : ''}`}
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {evictions.length === 0 ? (
        <div className="empty-state">
          <h3>No evictions on file</h3>
          <p>Create a notice when a lease needs to move into the eviction process.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No evictions match your filters</h3>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Property / Unit</th>
                <th>Notice Type</th>
                <th>Status</th>
                <th>Cure/Pay Deadline</th>
                <th>Court Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const dDays = e.status === 'notice_served' ? daysUntil(e.deadlineDate) : null;
                const dFlag = deadlineFlag(dDays);
                const cDays = e.status === 'court_date_set' ? daysUntil(e.courtDate) : null;
                const cFlag = deadlineFlag(cDays);
                return (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/evictions/${e.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        {e.lease.participants[0]?.tenant.name ?? 'Unknown Tenant'}
                      </Link>
                    </td>
                    <td>
                      {e.lease.unit.property.name} &middot; Unit {e.lease.unit.unitNumber}
                    </td>
                    <td>{NOTICE_TYPE_LABELS[e.noticeType]}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[e.status] ?? 'badge-neutral'}`}>{STATUS_LABELS[e.status] ?? e.status}</span>
                    </td>
                    <td>
                      {new Date(e.deadlineDate).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                      {dFlag && (
                        <span className={`badge ${dFlag.badge}`} style={{ marginLeft: '6px' }}>
                          {dFlag.label}
                        </span>
                      )}
                    </td>
                    <td>
                      {e.courtDate ? new Date(e.courtDate).toLocaleDateString('en-US') : '—'}
                      {cFlag && (
                        <span className={`badge ${cFlag.badge}`} style={{ marginLeft: '6px' }}>
                          {cFlag.label}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Eviction Notice</h2>
              <button className="btn btn-sm btn-secondary" onClick={closeForm}>
                X
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>{formError}</div>
                )}
                <div className="form-group">
                  <label>Lease</label>
                  <select
                    required
                    value={form.leaseId}
                    onChange={(e) => setForm({ ...form, leaseId: e.target.value })}
                  >
                    <option value="">Select a lease...</option>
                    {leases.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.participants.find((p) => p.isPrimary)?.tenant.name ?? 'Unknown'} — {l.unit.property.name} Unit {l.unit.unitNumber}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Notice Type</label>
                    <select
                      value={form.noticeType}
                      onChange={(e) => setForm({ ...form, noticeType: e.target.value as EvictionNoticeType, noticePeriodDays: null })}
                    >
                      {Object.entries(NOTICE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Notice Date</label>
                    <input
                      type="date"
                      required
                      value={form.noticeDate}
                      onChange={(e) => setForm({ ...form, noticeDate: e.target.value })}
                    />
                  </div>
                </div>

                <div
                  style={{
                    background: '#f0f4ff',
                    border: '1px solid #dbeafe',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    marginBottom: '16px',
                    fontSize: '13px',
                  }}
                >
                  {suggestedRule ? (
                    <>
                      <div>
                        <strong>
                          {ruleLookupState} jurisdiction rule: {suggestedRule.noticePeriodDays} days
                        </strong>{' '}
                        · allowed methods: {suggestedRule.allowedDeliveryMethods.map((m) => DELIVERY_METHOD_LABELS[m]).join(', ')}
                      </div>
                      <div style={{ color: '#6b7280', marginTop: '4px' }}>
                        Last verified {new Date(suggestedRule.lastVerifiedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })} ·{' '}
                        {suggestedRule.source}
                      </div>
                      {suggestedRule.notes && <div style={{ color: '#6b7280', marginTop: '4px' }}>{suggestedRule.notes}</div>}
                      <div style={{ color: '#92400e', marginTop: '4px' }}>
                        Reference data, not verified legal advice — confirm with local counsel before relying on it.
                      </div>
                    </>
                  ) : form.leaseId ? (
                    <span>No jurisdiction rule found for this state/notice type yet — enter a notice period manually below.</span>
                  ) : (
                    <span>Select a lease to look up the suggested notice period for its property&apos;s state.</span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Notice Period (days)</label>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      required
                      value={form.noticePeriodDays ?? ''}
                      onChange={(e) => setForm({ ...form, noticePeriodDays: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Delivery Method</label>
                    <select
                      value={form.deliveryMethod}
                      onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value as EvictionDeliveryMethod })}
                    >
                      {Object.entries(DELIVERY_METHOD_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {overrideDiffers && (
                  <div className="form-group">
                    <label>Override Reason (required — differs from the jurisdiction rule)</label>
                    <input
                      required
                      value={form.overrideReason ?? ''}
                      onChange={(e) => setForm({ ...form, overrideReason: e.target.value })}
                      placeholder="Why does this differ from the jurisdiction rule?"
                    />
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label>Delivery Date</label>
                    <input
                      type="date"
                      value={form.deliveryDate ?? ''}
                      onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Served By (staff, optional)</label>
                    <select
                      value={form.servedByUserId ?? ''}
                      onChange={(e) => setForm({ ...form, servedByUserId: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {profile && <option value={profile.userId}>{profile.name} (me)</option>}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Served By (third party, e.g. process server)</label>
                  <input
                    value={form.servedByName ?? ''}
                    onChange={(e) => setForm({ ...form, servedByName: e.target.value })}
                    placeholder="Optional — process server or other name"
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
