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

interface WorkOrderSummary {
  open: number;
  slaBreaches: number;
  emergency: number;
  urgent: number;
}

interface LeaseSummary {
  expiring30: number;
  expiring60: number;
}

interface MessageThread {
  id: string;
  subject: string | null;
  updatedAt: string;
  unreadCount: number;
}

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);
  const [workOrderSummary, setWorkOrderSummary] = useState<WorkOrderSummary>({ open: 0, slaBreaches: 0, emergency: 0, urgent: 0 });
  const [leaseSummary, setLeaseSummary] = useState<LeaseSummary>({ expiring30: 0, expiring60: 0 });
  const [recentThreads, setRecentThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [properties, stats, workOrders, leases, threads] = await Promise.all([
          api.properties.list(),
          api.payments.stats(),
          api.workOrders.list(),
          api.leases.list(),
          api.messages.threads.list().catch(() => []),
        ]);

        // Portfolio stats
        let totalUnits = 0;
        let occupiedUnits = 0;
        let vacantUnits = 0;
        const unitLists = await Promise.all(properties.map((p: any) => api.units.list(p.id)));
        for (const units of unitLists) {
          totalUnits += units.length;
          occupiedUnits += units.filter((u: any) => u.status === 'occupied').length;
          vacantUnits += units.filter((u: any) => u.status === 'vacant').length;
        }

        setPortfolio({ totalProperties: properties.length, totalUnits, occupiedUnits, vacantUnits });
        setPaymentStats(stats);

        // Work order summary
        const openStatuses = ['new_order', 'assigned', 'in_progress', 'pending_parts'];
        const openOrders = workOrders.filter((wo: any) => openStatuses.includes(wo.status));
        const open = openOrders.length;
        const slaBreaches = workOrders.filter((wo: any) => wo.slaBreached).length;
        const emergency = openOrders.filter((wo: any) => wo.priority === 'emergency').length;
        const urgent = openOrders.filter((wo: any) => wo.priority === 'urgent').length;
        setWorkOrderSummary({ open, slaBreaches, emergency, urgent });

        // Lease expiry summary
        const now = new Date();
        const in30 = new Date(now); in30.setDate(now.getDate() + 30);
        const in60 = new Date(now); in60.setDate(now.getDate() + 60);
        const activeLeases = leases.filter((l: any) => l.status === 'active' && l.endDate);
        const expiring30 = activeLeases.filter((l: any) => new Date(l.endDate) <= in30).length;
        const expiring60 = activeLeases.filter((l: any) => new Date(l.endDate) <= in60).length;
        setLeaseSummary({ expiring30, expiring60 });

        // Recent message threads (last 3)
        setRecentThreads((threads || []).slice(0, 3));
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
        <Link href="/payments" style={{ textDecoration: 'none' }}>
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

      {/* Operations KPIs */}
      <div style={{ marginBottom: '8px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
          Operations
        </h2>
      </div>
      <div className="stats-grid" style={{ marginBottom: '32px' }}>
        <Link href="/work-orders" style={{ textDecoration: 'none' }}>
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: workOrderSummary.emergency > 0 ? 'var(--color-danger)' : undefined }}>
            <div className="stat-label">Open Work Orders</div>
            <div className="stat-value" style={{ color: workOrderSummary.open > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
              {workOrderSummary.open}
            </div>
            {(workOrderSummary.emergency > 0 || workOrderSummary.urgent > 0) && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {workOrderSummary.emergency > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#991b1b' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
                    {workOrderSummary.emergency} Emergency
                  </div>
                )}
                {workOrderSummary.urgent > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#92400e' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                    {workOrderSummary.urgent} Urgent
                  </div>
                )}
              </div>
            )}
          </div>
        </Link>
        <Link href="/work-orders" style={{ textDecoration: 'none' }}>
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: workOrderSummary.slaBreaches > 0 ? 'var(--color-danger)' : undefined }}>
            <div className="stat-label">SLA Breaches</div>
            <div className="stat-value" style={{ color: workOrderSummary.slaBreaches > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {workOrderSummary.slaBreaches}
            </div>
          </div>
        </Link>
        <Link href="/leases" style={{ textDecoration: 'none' }}>
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: leaseSummary.expiring30 > 0 ? 'var(--color-danger)' : undefined }}>
            <div className="stat-label">Leases Expiring (30d)</div>
            <div className="stat-value" style={{ color: leaseSummary.expiring30 > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {leaseSummary.expiring30}
            </div>
          </div>
        </Link>
        <Link href="/leases" style={{ textDecoration: 'none' }}>
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: leaseSummary.expiring60 > 0 ? 'var(--color-warning)' : undefined }}>
            <div className="stat-label">Leases Expiring (60d)</div>
            <div className="stat-value" style={{ color: leaseSummary.expiring60 > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
              {leaseSummary.expiring60}
            </div>
          </div>
        </Link>
        <Link href="/messages" style={{ textDecoration: 'none' }}>
          <div className="stat-card" style={{ cursor: 'pointer' }}>
            <div className="stat-label">Message Threads</div>
            <div className="stat-value">{recentThreads.length > 0 ? recentThreads.length + '+' : 0}</div>
          </div>
        </Link>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
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
                {paymentStats.overduePayments.map((p, index) => (
                  <div key={`${p.id}-${index}`} style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                {paymentStats.recentPayments.map((p, index) => (
                  <div key={`${p.id}-${index}`} style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      {/* Recent Messages */}
      <div className="card">
        <div className="card-body" style={{ padding: '0' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Recent Messages</h3>
            <Link href="/messages" style={{ fontSize: '13px' }}>View all</Link>
          </div>
          {recentThreads.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
              No messages yet
            </div>
          ) : (
            <div>
              {recentThreads.map((thread, index) => (
                <Link
                  key={`${thread.id}-${index}`}
                  href="/messages"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--color-border)', textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {thread.unreadCount > 0 && (
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block', flexShrink: 0 }} />
                    )}
                    <span style={{ fontWeight: thread.unreadCount > 0 ? 600 : 400, fontSize: '14px' }}>
                      {thread.subject || 'No subject'}
                    </span>
                    {thread.unreadCount > 0 && (
                      <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '12px', padding: '1px 7px', fontSize: '11px', fontWeight: 600 }}>
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {new Date(thread.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
