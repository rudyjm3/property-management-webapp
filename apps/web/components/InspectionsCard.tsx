'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { INSPECTION_TYPES } from '@propflow/shared';

interface Props {
  propertyId: string;
  unitId: string;
  /** Optional — lets the "Schedule Inspection" form default to a move-in/move-out tied to a lease. */
  leaseId?: string | null;
}

interface Inspection {
  id: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  inspector: { id: string; name: string } | null;
  leaseId: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  move_in: 'Move-In',
  move_out: 'Move-Out',
  scheduled: 'Ad Hoc',
  annual: 'Annual',
  semi_annual: 'Semi-Annual',
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : '—';
}

export default function InspectionsCard({ propertyId, unitId, leaseId }: Props) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ type: 'scheduled', scheduledAt: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.inspections.list(propertyId, unitId);
      setInspections(data);
    } catch {
      setInspections([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId, unitId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.inspections.create(propertyId, unitId, {
        type: form.type,
        leaseId: ['move_in', 'move_out'].includes(form.type) ? leaseId ?? null : null,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
        notes: form.notes || null,
      });
      setShowModal(false);
      setForm({ type: 'scheduled', scheduledAt: '', notes: '' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to schedule inspection.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '20px' }}>
      <div className="card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Inspections</h2>
          <button className="btn btn-secondary" onClick={() => setShowModal(true)}>
            Schedule Inspection
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        ) : inspections.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No inspections scheduled yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Completed</th>
                <th>Inspector</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inspections.map((insp) => (
                <tr key={insp.id}>
                  <td>{TYPE_LABELS[insp.type] ?? insp.type}</td>
                  <td>{insp.status.replace(/_/g, ' ')}</td>
                  <td>{fmt(insp.scheduledAt)}</td>
                  <td>{fmt(insp.completedAt)}</td>
                  <td>{insp.inspector?.name ?? '—'}</td>
                  <td>
                    <Link href={`/inspections/${insp.id}?propertyId=${propertyId}&unitId=${unitId}`}>
                      {insp.status === 'completed' ? 'View' : 'Open'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '12px' }}>Schedule Inspection</h3>
            {error && <div style={{ color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {INSPECTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t] ?? t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Scheduled Date/Time</label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Scheduling…' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
