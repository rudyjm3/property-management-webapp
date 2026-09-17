'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import ModuleGate from '@/components/ModuleGate';
import { MODULE_KEYS } from '@propflow/shared';

interface Props {
  leaseId: string;
  /** Only terminated leases with a completed move-out can be reconciled. */
  canReconcile: boolean;
}

interface Disposition {
  id: string;
  depositAmount: string;
  totalDeductions: string;
  returnAmount: string;
  status: string;
  moveInConditionNotes: string | null;
  moveOutConditionNotes: string | null;
  reconciledAt: string;
}

function fmt(n: number) {
  return `$${n.toLocaleString()}`;
}

/**
 * Advanced Payments & Accounting (Module 4) — formalizes the deposit-vs-
 * deductions math the move-out workflow already computed into a persisted
 * disposition record. Reconciles against itemized deductions captured at
 * move-out, not against move-in/move-out inspection records (Module 6,
 * Inspections & Compliance, doesn't exist yet) — hence the free-text notes.
 */
export default function SecurityDepositDisposition({ leaseId, canReconcile }: Props) {
  const [disposition, setDisposition] = useState<Disposition | null>(null);
  const [loading, setLoading] = useState(true);
  const [moveInNotes, setMoveInNotes] = useState('');
  const [moveOutNotes, setMoveOutNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.leases
      .getSecurityDepositDisposition(leaseId)
      .then(setDisposition)
      .catch(() => setDisposition(null))
      .finally(() => setLoading(false));
  }, [leaseId]);

  async function handleReconcile() {
    setSubmitting(true);
    setError('');
    try {
      const result = await api.leases.reconcileSecurityDeposit(leaseId, {
        moveInConditionNotes: moveInNotes || null,
        moveOutConditionNotes: moveOutNotes || null,
      });
      setDisposition(result);
    } catch (err: any) {
      setError(err.message || 'Failed to reconcile security deposit.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!canReconcile && !disposition) return null;
  if (loading) return null;

  return (
    <ModuleGate module={MODULE_KEYS.ADVANCED_PAYMENTS_ACCOUNTING}>
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-body">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
            Security Deposit Disposition
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
            Reconciles the deposit against the itemized deductions recorded during move-out.
            Not reconciled against move-in/move-out inspection records — that requires the
            Inspections &amp; Compliance module, which hasn&apos;t shipped yet.
          </p>

          {error && (
            <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>
              {error}
            </div>
          )}

          {disposition ? (
            <div className="detail-grid">
              <div className="detail-item">
                <label>Deposit Amount</label>
                <span>{fmt(Number(disposition.depositAmount))}</span>
              </div>
              <div className="detail-item">
                <label>Total Deductions</label>
                <span>{fmt(Number(disposition.totalDeductions))}</span>
              </div>
              <div className="detail-item">
                <label>Return Amount</label>
                <span>{fmt(Number(disposition.returnAmount))}</span>
              </div>
              <div className="detail-item">
                <label>Status</label>
                <span>{disposition.status.replace(/_/g, ' ')}</span>
              </div>
              {disposition.moveInConditionNotes && (
                <div className="detail-item">
                  <label>Move-In Condition Notes</label>
                  <span>{disposition.moveInConditionNotes}</span>
                </div>
              )}
              {disposition.moveOutConditionNotes && (
                <div className="detail-item">
                  <label>Move-Out Condition Notes</label>
                  <span>{disposition.moveOutConditionNotes}</span>
                </div>
              )}
              <div className="detail-item">
                <label>Reconciled At</label>
                <span>{new Date(disposition.reconciledAt).toLocaleDateString()}</span>
              </div>
            </div>
          ) : (
            <div>
              <div className="form-group">
                <label>Move-In Condition Notes (optional)</label>
                <textarea rows={2} value={moveInNotes} onChange={(e) => setMoveInNotes(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Move-Out Condition Notes (optional)</label>
                <textarea rows={2} value={moveOutNotes} onChange={(e) => setMoveOutNotes(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleReconcile} disabled={submitting}>
                  {submitting ? 'Reconciling…' : 'Reconcile Deposit'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModuleGate>
  );
}
