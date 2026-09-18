'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import ModuleGate from '@/components/ModuleGate';
import { MODULE_KEYS } from '@propflow/shared';

interface Props {
  leaseId: string;
  propertyId: string;
  unitId: string;
}

interface ComparisonItem {
  section: string;
  item: string;
  moveIn: { condition?: string | null; notes?: string | null } | null;
  moveOut: { condition?: string | null; notes?: string | null } | null;
  conditionChanged: boolean;
}

interface Comparison {
  moveInInspection: { id: string; completedAt: string | null } | null;
  moveOutInspection: { id: string; completedAt: string | null } | null;
  items: ComparisonItem[];
}

/**
 * Inspections & Compliance (Module 6) — move-in vs. move-out comparison, the
 * basis for deposit disposition. Shown near SecurityDepositDisposition on the
 * lease detail page.
 */
export default function InspectionComparison({ leaseId, propertyId, unitId }: Props) {
  return (
    <ModuleGate module={MODULE_KEYS.INSPECTIONS_COMPLIANCE}>
      <InspectionComparisonInner leaseId={leaseId} propertyId={propertyId} unitId={unitId} />
    </ModuleGate>
  );
}

function InspectionComparisonInner({ leaseId, propertyId, unitId }: Props) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.leases
      .compareInspections(leaseId)
      .then(setComparison)
      .catch(() => setComparison(null))
      .finally(() => setLoading(false));
  }, [leaseId]);

  if (loading) return null;
  if (!comparison) return null;

  const { moveInInspection, moveOutInspection, items } = comparison;

  return (
    <div className="card" style={{ marginTop: '20px' }}>
      <div className="card-body">
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
          Move-In vs. Move-Out Inspection Comparison
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          Basis for the security deposit disposition above, when both inspections are on file.
        </p>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '13px' }}>
          <span>
            Move-In:{' '}
            {moveInInspection ? (
              <Link href={`/inspections/${moveInInspection.id}?propertyId=${propertyId}&unitId=${unitId}`}>
                {moveInInspection.completedAt ? new Date(moveInInspection.completedAt).toLocaleDateString() : 'View'}
              </Link>
            ) : (
              'Not on file'
            )}
          </span>
          <span>
            Move-Out:{' '}
            {moveOutInspection ? (
              <Link href={`/inspections/${moveOutInspection.id}?propertyId=${propertyId}&unitId=${unitId}`}>
                {moveOutInspection.completedAt ? new Date(moveOutInspection.completedAt).toLocaleDateString() : 'View'}
              </Link>
            ) : (
              'Not on file'
            )}
          </span>
        </div>

        {!moveInInspection && !moveOutInspection ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            No completed move-in or move-out inspection found for this lease yet.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Item</th>
                <th>Move-In</th>
                <th>Move-Out</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={`${it.section}-${it.item}-${idx}`} style={it.conditionChanged ? { background: 'var(--color-warning-bg, #fff8e1)' } : undefined}>
                  <td>{it.section}</td>
                  <td>{it.item}</td>
                  <td>{it.moveIn?.condition ?? '—'}</td>
                  <td>{it.moveOut?.condition ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
