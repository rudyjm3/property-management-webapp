'use client';

import { useEffect, useState } from 'react';
import { ownerApi, OwnerStatement, OwnerProperty } from '@/lib/ownerApi';

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function OwnerPortalStatementsPage() {
  const [statements, setStatements] = useState<OwnerStatement[]>([]);
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [propertyFilter, setPropertyFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ownerApi
      .properties()
      .then(setProperties)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    ownerApi
      .statements(propertyFilter || undefined)
      .then(setStatements)
      .catch((err) => setError(err.message || 'Failed to load statements.'))
      .finally(() => setLoading(false));
  }, [propertyFilter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Owner Statements</h1>
        <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.propertyId} value={p.propertyId}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: '16px' }}>{error}</div>}
      {loading ? (
        <div className="loading">Loading…</div>
      ) : statements.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No statements available yet.</p>
      ) : (
        <div className="card" style={{ padding: '0' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Period</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>NOI</th>
                <th>Distribution</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.id}>
                  <td>{s.property.name}</td>
                  <td>
                    {new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}
                  </td>
                  <td>{money(Number(s.totalIncome))}</td>
                  <td>{money(Number(s.totalExpenses))}</td>
                  <td>{money(Number(s.netOperatingIncome))}</td>
                  <td>{money(Number(s.distributionAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
