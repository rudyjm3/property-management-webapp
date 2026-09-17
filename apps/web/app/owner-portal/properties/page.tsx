'use client';

import { useEffect, useState } from 'react';
import { ownerApi, OwnerProperty } from '@/lib/ownerApi';

export default function OwnerPortalPropertiesPage() {
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ownerApi
      .properties()
      .then(setProperties)
      .catch((err) => setError(err.message || 'Failed to load properties.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div style={{ color: '#dc2626' }}>{error}</div>;

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Your Properties</h1>

      {properties.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No properties are assigned to you yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {properties.map((p) => (
            <div key={p.propertyId} className="card" style={{ padding: '18px' }}>
              <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>{p.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                {p.address}, {p.city}, {p.state} {p.zip}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Ownership</span>
                <strong>{p.ownershipPct}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Occupancy</span>
                <strong>{p.occupiedUnits}/{p.unitCount} ({p.occupancyPct}%)</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
