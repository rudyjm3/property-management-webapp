'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Eviction, type EvictionJudgmentOutcome } from '@/lib/api';
import { EVICTION_DEADLINE_WARNING_DAYS } from '@propflow/shared';

const NOTICE_TYPE_LABELS: Record<string, string> = {
  pay_or_quit: 'Pay or Quit',
  cure_or_quit: 'Cure or Quit',
  unconditional_quit: 'Unconditional Quit',
};

const DELIVERY_METHOD_LABELS: Record<string, string> = {
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

const JUDGMENT_LABELS: Record<string, string> = {
  possession_landlord: 'Possession to Landlord',
  possession_tenant: 'Possession to Tenant',
  dismissed: 'Dismissed',
  settled: 'Settled',
};

function fmtDate(d: string | null, utc = true): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', utc ? { timeZone: 'UTC' } : undefined);
}

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

type ModalKind = 'resolve' | 'file' | 'court-date' | 'judgment' | 'writ' | 'complete' | 'dismiss' | null;

export default function EvictionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const evictionId = params.id as string;

  const [eviction, setEviction] = useState<Eviction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalKind>(null);
  const [submitting, setSubmitting] = useState(false);

  // Per-modal form state
  const [resolveOutcome, setResolveOutcome] = useState<'cured' | 'paid' | 'expired'>('expired');
  const [courtCaseNumber, setCourtCaseNumber] = useState('');
  const [courtName, setCourtName] = useState('');
  const [courtDate, setCourtDate] = useState('');
  const [judgmentOutcome, setJudgmentOutcome] = useState<EvictionJudgmentOutcome>('possession_landlord');
  const [dismissedReason, setDismissedReason] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await api.evictions.get(evictionId);
      setEviction(data);
    } catch (err) {
      console.error('Failed to load eviction:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evictionId]);

  function openModal(kind: ModalKind) {
    setError('');
    if (kind === 'resolve') {
      setResolveOutcome(eviction?.noticeType === 'cure_or_quit' ? 'cured' : eviction?.noticeType === 'pay_or_quit' ? 'paid' : 'expired');
    }
    setModal(kind);
  }

  async function runAction(fn: () => Promise<Eviction>) {
    setError('');
    setSubmitting(true);
    try {
      const updated = await fn();
      setEviction(updated);
      setModal(null);
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this eviction record? This cannot be undone.')) return;
    try {
      await api.evictions.delete(evictionId);
      router.push('/evictions');
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    }
  }

  if (loading) return <div className="loading">Loading eviction...</div>;
  if (!eviction) return <div className="empty-state">Eviction not found.</div>;

  const tenant = eviction.lease.participants[0]?.tenant;
  const dDays = eviction.status === 'notice_served' ? daysUntil(eviction.deadlineDate) : null;
  const dFlag = deadlineFlag(dDays);
  const cDays = eviction.status === 'court_date_set' ? daysUntil(eviction.courtDate) : null;
  const cFlag = deadlineFlag(cDays);

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/evictions" style={{ fontSize: '13px', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
            &larr; Back to Evictions
          </Link>
          <h1 className="page-title" style={{ marginTop: '4px' }}>
            {tenant?.name ?? 'Unknown Tenant'} — {eviction.lease.unit.property.name} Unit {eviction.lease.unit.unitNumber}
          </h1>
          <p className="page-subtitle">
            <span className={`badge ${STATUS_BADGE[eviction.status] ?? 'badge-neutral'}`}>{STATUS_LABELS[eviction.status] ?? eviction.status}</span>{' '}
            &middot; {NOTICE_TYPE_LABELS[eviction.noticeType]}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href={`/leases/${eviction.leaseId}`} className="btn btn-secondary">
            View Lease
          </Link>
          <button className="btn btn-danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--color-danger)', marginBottom: '16px', fontSize: '14px' }}>{error}</div>
      )}

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
        <strong>Not legal advice.</strong> This is a tracking tool, not a substitute for counsel — confirm every
        deadline and required step against current local law and your court&apos;s rules.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Notice Details</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Notice Type</label>
                <span>{NOTICE_TYPE_LABELS[eviction.noticeType]}</span>
              </div>
              <div className="detail-item">
                <label>Notice Date</label>
                <span>{fmtDate(eviction.noticeDate)}</span>
              </div>
              <div className="detail-item">
                <label>Notice Period</label>
                <span>{eviction.noticePeriodDays} days</span>
              </div>
              <div className="detail-item">
                <label>Cure/Pay Deadline</label>
                <span>
                  {fmtDate(eviction.deadlineDate)}
                  {dFlag && (
                    <span className={`badge ${dFlag.badge}`} style={{ marginLeft: '6px' }}>
                      {dFlag.label}
                    </span>
                  )}
                </span>
              </div>
              <div className="detail-item">
                <label>Delivery Method</label>
                <span>{DELIVERY_METHOD_LABELS[eviction.deliveryMethod]}</span>
              </div>
              <div className="detail-item">
                <label>Delivery Date</label>
                <span>{fmtDate(eviction.deliveryDate)}</span>
              </div>
              <div className="detail-item">
                <label>Served By</label>
                <span>{eviction.servedBy?.name ?? eviction.servedByName ?? '—'}</span>
              </div>
              {eviction.overrideReason && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Override Reason</label>
                  <span>{eviction.overrideReason}</span>
                </div>
              )}
              {eviction.notes && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Notes</label>
                  <span>{eviction.notes}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Jurisdiction Reference</h3>
            {eviction.stateRule ? (
              <div className="detail-grid">
                <div className="detail-item">
                  <label>State</label>
                  <span>{eviction.stateRule.state}</span>
                </div>
                <div className="detail-item">
                  <label>Rule Notice Period</label>
                  <span>{eviction.stateRule.noticePeriodDays} days</span>
                </div>
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Allowed Delivery Methods</label>
                  <span>{eviction.stateRule.allowedDeliveryMethods.map((m) => DELIVERY_METHOD_LABELS[m]).join(', ')}</span>
                </div>
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Source</label>
                  <span>{eviction.stateRule.source}</span>
                </div>
                <div className="detail-item">
                  <label>Last Verified</label>
                  <span>{fmtDate(eviction.stateRule.lastVerifiedAt)}</span>
                </div>
                {eviction.stateRule.notes && (
                  <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <span>{eviction.stateRule.notes}</span>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                No jurisdiction rule was on file for this state/notice type when this notice was created — the
                notice period was entered manually.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-body">
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Court &amp; Judgment</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <label>Case Number</label>
              <span>{eviction.courtCaseNumber ?? '—'}</span>
            </div>
            <div className="detail-item">
              <label>Court</label>
              <span>{eviction.courtName ?? '—'}</span>
            </div>
            <div className="detail-item">
              <label>Filed</label>
              <span>{eviction.filedAt ? fmtDate(eviction.filedAt, false) : '—'}</span>
            </div>
            <div className="detail-item">
              <label>Court Date</label>
              <span>
                {eviction.courtDate ? fmtDate(eviction.courtDate, false) : '—'}
                {cFlag && (
                  <span className={`badge ${cFlag.badge}`} style={{ marginLeft: '6px' }}>
                    {cFlag.label}
                  </span>
                )}
              </span>
            </div>
            <div className="detail-item">
              <label>Judgment</label>
              <span>{eviction.judgmentOutcome ? JUDGMENT_LABELS[eviction.judgmentOutcome] : '—'}</span>
            </div>
            <div className="detail-item">
              <label>Writ Issued</label>
              <span>{eviction.writIssuedAt ? fmtDate(eviction.writIssuedAt, false) : '—'}</span>
            </div>
            <div className="detail-item">
              <label>Completed</label>
              <span>{eviction.completedAt ? fmtDate(eviction.completedAt, false) : '—'}</span>
            </div>
            {eviction.status === 'dismissed' && (
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                <label>Dismissed</label>
                <span>
                  {fmtDate(eviction.dismissedAt, false)} — {eviction.dismissedReason}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
        <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Next Steps</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {eviction.status === 'notice_served' && (
            <button className="btn btn-primary" onClick={() => openModal('resolve')}>
              Resolve Notice
            </button>
          )}
          {eviction.status === 'expired' && (
            <>
              <button className="btn btn-primary" onClick={() => openModal('file')}>
                File with Court
              </button>
              <button className="btn btn-secondary" onClick={() => openModal('complete')}>
                Mark Completed (voluntary vacate)
              </button>
            </>
          )}
          {eviction.status === 'filed' && (
            <button className="btn btn-primary" onClick={() => openModal('court-date')}>
              Set Court Date
            </button>
          )}
          {eviction.status === 'court_date_set' && (
            <>
              <button className="btn btn-secondary" onClick={() => openModal('court-date')}>
                Reschedule Court Date
              </button>
              <button className="btn btn-primary" onClick={() => openModal('judgment')}>
                Record Judgment
              </button>
            </>
          )}
          {eviction.status === 'judgment' && eviction.judgmentOutcome === 'possession_landlord' && (
            <>
              <button className="btn btn-primary" onClick={() => openModal('writ')}>
                Issue Writ of Possession
              </button>
              <button className="btn btn-secondary" onClick={() => openModal('complete')}>
                Mark Completed
              </button>
            </>
          )}
          {eviction.status === 'writ_issued' && (
            <button className="btn btn-primary" onClick={() => openModal('complete')}>
              Mark Completed
            </button>
          )}
          {['filed', 'court_date_set', 'judgment'].includes(eviction.status) && (
            <button className="btn btn-secondary" onClick={() => openModal('dismiss')}>
              Dismiss Case
            </button>
          )}
          {['completed', 'dismissed', 'cured', 'paid'].includes(eviction.status) && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', alignSelf: 'center' }}>
              This eviction has reached a final status.
            </span>
          )}
        </div>
        </div>
      </div>

      {modal === 'resolve' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Resolve Notice</h2>
            </div>
            <div className="modal-body">
              {error && <div style={{ color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</div>}
              <div className="form-group">
                <label>Outcome</label>
                <select value={resolveOutcome} onChange={(e) => setResolveOutcome(e.target.value as any)}>
                  {eviction.noticeType === 'cure_or_quit' && <option value="cured">Cured — tenant fixed the violation</option>}
                  {eviction.noticeType === 'pay_or_quit' && <option value="paid">Paid — tenant paid in full</option>}
                  <option value="expired">Expired — notice period lapsed uncured</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => runAction(() => api.evictions.resolve(evictionId, { outcome: resolveOutcome }))}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'file' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>File with Court</h2>
            </div>
            <div className="modal-body">
              {error && <div style={{ color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</div>}
              <div className="form-group">
                <label>Case Number</label>
                <input required value={courtCaseNumber} onChange={(e) => setCourtCaseNumber(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Court Name</label>
                <input value={courtName} onChange={(e) => setCourtName(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={submitting || !courtCaseNumber}
                onClick={() => runAction(() => api.evictions.file(evictionId, { courtCaseNumber, courtName: courtName || null }))}
              >
                File
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'court-date' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Set Court Date</h2>
            </div>
            <div className="modal-body">
              {error && <div style={{ color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</div>}
              <div className="form-group">
                <label>Court Date</label>
                <input type="datetime-local" required value={courtDate} onChange={(e) => setCourtDate(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={submitting || !courtDate}
                onClick={() => runAction(() => api.evictions.setCourtDate(evictionId, new Date(courtDate).toISOString()))}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'judgment' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Record Judgment</h2>
            </div>
            <div className="modal-body">
              {error && <div style={{ color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</div>}
              <div className="form-group">
                <label>Outcome</label>
                <select value={judgmentOutcome} onChange={(e) => setJudgmentOutcome(e.target.value as EvictionJudgmentOutcome)}>
                  {Object.entries(JUDGMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => runAction(() => api.evictions.recordJudgment(evictionId, { judgmentOutcome }))}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'writ' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Issue Writ of Possession</h2>
            </div>
            <div className="modal-body">
              {error && <div style={{ color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</div>}
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Confirm the writ of possession has been issued.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={submitting} onClick={() => runAction(() => api.evictions.recordWrit(evictionId))}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'complete' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Mark Completed</h2>
            </div>
            <div className="modal-body">
              {error && <div style={{ color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</div>}
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Confirm possession has been recovered.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={submitting} onClick={() => runAction(() => api.evictions.complete(evictionId))}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'dismiss' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Dismiss Case</h2>
            </div>
            <div className="modal-body">
              {error && <div style={{ color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</div>}
              <div className="form-group">
                <label>Reason</label>
                <textarea required value={dismissedReason} onChange={(e) => setDismissedReason(e.target.value)} rows={3} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={submitting || !dismissedReason}
                onClick={() => runAction(() => api.evictions.dismiss(evictionId, dismissedReason))}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
