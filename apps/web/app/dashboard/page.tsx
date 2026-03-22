'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface DashboardStats {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const properties = await api.properties.list();
        let totalUnits = 0;
        let occupiedUnits = 0;
        let vacantUnits = 0;

        for (const prop of properties) {
          const units = await api.units.list(prop.id);
          totalUnits += units.length;
          occupiedUnits += units.filter((u: any) => u.status === 'occupied').length;
          vacantUnits += units.filter((u: any) => u.status === 'vacant').length;
        }

        setStats({
          totalProperties: properties.length,
          totalUnits,
          occupiedUnits,
          vacantUnits,
        });
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;

  const occupancyRate = stats && stats.totalUnits > 0
    ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
    : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your portfolio</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Properties</div>
          <div className="stat-value">{stats?.totalProperties || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Units</div>
          <div className="stat-value">{stats?.totalUnits || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Occupied</div>
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            {stats?.occupiedUnits || 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vacant</div>
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>
            {stats?.vacantUnits || 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Occupancy Rate</div>
          <div className="stat-value">{occupancyRate}%</div>
        </div>
      </div>
    </>
  );
}
