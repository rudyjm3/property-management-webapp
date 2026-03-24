'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface PortfolioStats {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
}

interface PaymentStats {
  collectedThisMonth: number;
  expectedThisMonth: number;
  pendingThisMonth: number;
  collectionRate: number;
  overdueCount: number;
  overduePayments: Array<{
    id: string;
    amount: string;
    dueDate: string;
    tenant: { id: string; name: string };
    lease: { unit: { unitNumber: string; property: { name: string } } };
  }>;
  recentPayments: Array<{
    id: string;
    amount: string;
    paidAt: string | null;
    type: string;
    tenant: { id: string; name: string };
    lease: { unit: { unitNumber: string; property: { name: string } } };
  }>;
}

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [properties, stats] = await Promise.all([
          api.properties.list(),
          api.payments.stats(),
        ]);

        let totalUnits = 0;
        let occupiedUnits = 0;
        let vacantUnits = 0;

        const unitLists = await Promise.all(
          properties.map((p: any) => api.units.list(p.id))
        );

        for (const units of unitLists) {
          totalUnits += units.length;
          occupiedUnits += units.filter((u: any) => u.status === 'occupied').length;
          vacantUnits += units.filter((u: any) => u.status === 'vacant').length;
        }

        setPortfolio({
          totalProperties: properties.length,
          totalUnits,
          occupiedUnits,
          vacantUnits,
        });

        setPaymentStats(stats);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;

  const occupancyRate =
    portfolio && portfolio.totalUnits > 0
      ? Math.round((portfolio.occupiedUnits / portfolio.totalUnits) * 100)
      : 0;

  const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Portfolio overview — {currentMonth}</p>
        </div>
      </div>

      {/* Portfolio KPIs */}
      <div style={{ marginBottom: '8px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
          Portfolio
        </h2>
      </div>
      <div className="stats-grid" style={{ marginBottom: '32px' }}>
        <Link href="/properties" style={{ textDecoration: 'none' }}>
          <div className="stat-card" style={{ cursor: 'pointer' }}>
            <div className="stat-label">Properties</div>
            <div className="stat-value">{portfolio?.totalProperties ?? 0}</div>
          </div>
        </Link>
        <div className="stat-card">
          <div className="stat-label">Total Units</div>
          <div className="stat-value">{portfolio?.totalUnits ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Occupied</div>
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            {portfolio?.occupiedUnits ?? 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vacant</div>
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>
            {portfolio?.vacantUnits ?? 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Occupancy Rate</div>
          <div
            className="stat-value"
            style={{ color: occupancyRate >= 90 ? 'var(--color-success)' : occupancyRate >= 70 ? 'var(--color-warning)' : 'var(--color-danger)' }}
          >
            {occupancyRate}%
          </div>
        </div>
      </div>

      {/* Payment KPIs */}
      <div style={{ marginBottom: '8px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
          Rent Collection — This Month
        </h2>
      </div>
      <div className="stats-grid" style={{ marginBottom: '32px' }}>
        <Link href="/payments?status=completed" style={{ textDecoration: 'none' }}>
          <div className="stat-card" style={{ cursor: 'pointer' }}>
            <div className="stat-label">Collected</div>
            <div className="stat-value" style={{ color: 'var(--color-success)' }}>
              ${(paymentStats?.collectedThisMonth ?? 0).toLocaleString()}
            </div>
          </div>
        </Link>
        <div className="stat-card">
          <div className="stat-label">Expected</div>
          <div className="stat-value">
            ${(paymentStats?.expectedThisMonth ?? 0).toLocaleString()}
          </div>
        </div>
        <Link href="/payments?status=pending" style={{ textDecoration: 'none' }}>
          <div className="stat-card" style={{ cursor: 'pointer' }}>
            <div className="stat-label">Pending</div>
            <div className="stat-value" style={{ color: 'var(--color-warning)' }}>
              ${(paymentStats?.pendingThisMonth ?? 0).toLocaleString()}
            </div>
          </div>
        </Link>
        <div className="stat-card">
          <div className="stat-label">Collection Rate</div>
          <div
            className="stat-value"
            style={{
              color:
                (paymentStats?.collectionRate ?? 0) >= 90
                  ? 'var(--color-success)'
                  : (paymentStats?.collectionRate ?? 0) >= 70
                  ? 'var(--color-warning)'
                  : 'var(--color-danger)',
            }}
          >
            {paymentStats?.collectionRate ?? 0}%
          </div>
        </div>
        <Link href="/payments?status=pending" style={{ textDecoration: 'none' }}>
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: (paymentStats?.overdueCount ?? 0) > 0 ? 'var(--color-danger)' : undefined }}>
            <div className="stat-label">Overdue</div>
            <div
              className="stat-value"
              style={{ color: (paymentStats?.overdueCount ?? 0) > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
            >
              {paymentStats?.overdueCount ?? 0}
            </div>
          </div>
        </Link>
      </div>

      {/* Bottom row: overdue alerts + recent payments */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Overdue Payments */}
        <div className="card">
          <div className="card-body" style={{ padding: '0' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>
                Overdue Payments
                {(paymentStats?.overdueCount ?? 0) > 0 && (
                  <span style={{ marginLeft: '8px', background: '#fee2e2', color: '#991b1b', borderRadius: '12px', padding: '2px 8px', fontSize: '12px' }}>
                    {paymentStats?.overdueCount}
                  </span>
                )}
              </h3>
              <Link href="/payments" style={{ fontSize: '13px' }}>View all</Link>
            </div>
            {!paymentStats?.overduePayments?.length ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                No overdue payments
              </div>
            ) : (
              <div>
                {paymentStats.overduePayments.map((p) => (
                  <div
                    key={p.id}
                    style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <Link href={`/tenants/${p.tenant.id}`} style={{ fontWeight: 500, fontSize: '14px' }}>
                        {p.tenant.name}
                      </Link>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Unit {p.lease.unit.unitNumber} · {p.lease.unit.property.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-danger)' }}>
                        Due {new Date(p.dueDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: '15px' }}>
                      ${Number(p.amount).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="card">
          <div className="card-body" style={{ padding: '0' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Recent Payments</h3>
              <Link href="/payments" style={{ fontSize: '13px' }}>View all</Link>
            </div>
            {!paymentStats?.recentPayments?.length ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                No payments recorded yet
              </div>
            ) : (
              <div>
                {paymentStats.recentPayments.map((p) => (
                  <div
                    key={p.id}
                    style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <Link href={`/tenants/${p.tenant.id}`} style={{ fontWeight: 500, fontSize: '14px' }}>
                        {p.tenant.name}
                      </Link>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Unit {p.lease.unit.unitNumber} · {p.lease.unit.property.name}
                      </div>
                      {p.paidAt && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          Paid {new Date(p.paidAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: '15px' }}>
                      +${Number(p.amount).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
