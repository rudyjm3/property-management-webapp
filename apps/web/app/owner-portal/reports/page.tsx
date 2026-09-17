'use client';

import { useEffect, useState } from 'react';
import { ownerApi, OwnerStatement, OwnerProperty } from '@/lib/ownerApi';

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function OwnerPortalReportsPage() {
  const [statements, setStatements] = useState<OwnerStatement[]>([]);
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([ownerApi.statements(), ownerApi.properties()])
      .then(([s, p]) => {
        setStatements(s);
        setProperties(p);
      })
      .catch((err) => setError(err.message || 'Failed to load reports.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div style={{ color: '#dc2626' }}>{error}</div>;

  // NOI trend, oldest to newest, for a simple sparkline-style bar chart.
  const trend = [...statements].sort(
    (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
  );
  const maxNoi = Math.max(1, ...trend.map((s) => Number(s.netOperatingIncome)));

  const totalIncome = statements.reduce((sum, s) => sum + Number(s.totalIncome), 0);
  const totalExpenses = statements.reduce((sum, s) => sum + Number(s.totalExpenses), 0);
  const totalNoi = statements.reduce((sum, s) => sum + Number(s.netOperatingIncome), 0);

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Reports</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Total Income (all statements)</div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>{money(totalIncome)}</div>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Total Expenses</div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>{money(totalExpenses)}</div>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Net Operating Income</div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>{money(totalNoi)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>NOI by Period</h3>
        {trend.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>No statement history yet.</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '160px' }}>
            {trend.map((s) => {
              const noi = Number(s.netOperatingIncome);
              const heightPct = Math.max(4, (noi / maxNoi) * 100);
              return (
                <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  <div
                    title={`${s.property.name}: ${money(noi)}`}
                    style={{
                      width: '100%',
                      height: `${heightPct}%`,
                      background: 'var(--color-primary, #6366f1)',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '6px', textAlign: 'center' }}>
                    {new Date(s.periodStart).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '20px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Occupancy by Property</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Units</th>
              <th>Occupied</th>
              <th>Occupancy Rate</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.propertyId}>
                <td>{p.name}</td>
                <td>{p.unitCount}</td>
                <td>{p.occupiedUnits}</td>
                <td>{p.occupancyPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
