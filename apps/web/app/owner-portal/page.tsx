'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ownerApi, OwnerDashboard } from '@/lib/ownerApi';

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function OwnerPortalDashboardPage() {
  const [dashboard, setDashboard] = useState<OwnerDashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ownerApi
      .dashboard()
      .then(setDashboard)
      .catch((err) => setError(err.message || 'Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div style={{ color: '#dc2626' }}>{error}</div>;
  if (!dashboard) return null;

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Owner Dashboard</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Properties</div>
          <div style={{ fontSize: '28px', fontWeight: 700 }}>{dashboard.propertyCount}</div>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Total Units</div>
          <div style={{ fontSize: '28px', fontWeight: 700 }}>{dashboard.totalUnits}</div>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Portfolio Occupancy</div>
          <div style={{ fontSize: '28px', fontWeight: 700 }}>{dashboard.portfolioOccupancyPct}%</div>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>YTD Distributions</div>
          <div style={{ fontSize: '28px', fontWeight: 700 }}>{money(dashboard.ytdDistributions)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Recent Statements</h3>
          <Link href="/owner-portal/statements" style={{ fontSize: '13px', color: 'var(--color-primary)' }}>
            View all
          </Link>
        </div>
        {dashboard.recentStatements.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>No statements yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Period</th>
                <th>NOI</th>
                <th>Distribution</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentStatements.map((s) => (
                <tr key={s.id}>
                  <td>{s.property.name}</td>
                  <td>
                    {new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}
                  </td>
                  <td>{money(Number(s.netOperatingIncome))}</td>
                  <td>{money(Number(s.distributionAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: '20px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Your Properties</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Ownership %</th>
              <th>Occupancy</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.properties.map((p) => (
              <tr key={p.propertyId}>
                <td>{p.name}</td>
                <td>{p.ownershipPct}%</td>
                <td>{p.occupiedUnits}/{p.unitCount} ({p.occupancyPct}%)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
