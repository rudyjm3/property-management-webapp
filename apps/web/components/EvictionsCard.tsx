'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Eviction } from '@/lib/api';
import ModuleGate from '@/components/ModuleGate';
import { MODULE_KEYS } from '@propflow/shared';

interface Props {
  leaseId: string;
}

const NOTICE_TYPE_LABELS: Record<string, string> = {
  pay_or_quit: 'Pay or Quit',
  cure_or_quit: 'Cure or Quit',
  unconditional_quit: 'Unconditional Quit',
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

/**
 * Eviction Management (Module 8) — lists any eviction notices on file for
 * this lease and links out to /evictions to start a new one. The eviction
 * dashboard/detail pages live at their own route (not folded into the lease
 * page) since the module spec calls for a portfolio-wide timeline view,
 * unlike most other modules in this series which had no standalone page.
 */
export default function EvictionsCard({ leaseId }: Props) {
  const [evictions, setEvictions] = useState<Eviction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.evictions
      .list({ leaseId })
      .then(setEvictions)
      .catch(() => setEvictions([]))
      .finally(() => setLoading(false));
  }, [leaseId]);

  return (
    <ModuleGate module={MODULE_KEYS.EVICTION_MANAGEMENT}>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>Evictions</h3>
            <Link href={`/evictions?newForLease=${leaseId}`} className="btn btn-sm btn-secondary">
              + Start Eviction
            </Link>
          </div>
          {loading ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Loading...</p>
          ) : evictions.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No eviction notices on file for this lease.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {evictions.map((e) => (
                <Link
                  key={e.id}
                  href={`/evictions/${e.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: 'inherit',
                    fontSize: '13px',
                  }}
                >
                  <span>
                    {NOTICE_TYPE_LABELS[e.noticeType]} &middot; served {new Date(e.noticeDate).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                  </span>
                  <span className={`badge ${STATUS_BADGE[e.status] ?? 'badge-neutral'}`}>{STATUS_LABELS[e.status] ?? e.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModuleGate>
  );
}
