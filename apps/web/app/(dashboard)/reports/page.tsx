'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { exportCsv } from '@/lib/exportCsv';
import { RevenueTrendChart } from '@/components/reports/RevenueTrendChart';
import { RentRollTable } from '@/components/reports/RentRollTable';
import { VacancyReport } from '@/components/reports/VacancyReport';
import { OwnerStatements } from '@/components/reports/OwnerStatements';

interface OwnerShare {
  ownerId: string;
  ownerName: string;
  ownershipPct: number;
  ownerShare: number;
}

interface IncomeBreakdown {
  rent: number;
  lateFees: number;
  deposits: number;
  other: number;
}

interface PropertySummary {
  propertyId: string;
  propertyName: string;
  address: string;
  totalIncome: number;
  totalExpenses: number;
  netOperatingIncome: number;
  incomeBreakdown: IncomeBreakdown;
  owners: OwnerShare[];
}

interface FinancialReport {
  periodStart: string;
  periodEnd: string;
  properties: PropertySummary[];
  totals: {
    totalIncome: number;
    totalExpenses: number;
    netOperatingIncome: number;
  };
}

interface PropertyOption {
  id: string;
  name: string;
}

type Tab = 'financial' | 'trend' | 'rentroll' | 'vacancy' | 'statements';

const TABS: { id: Tab; label: string }[] = [
  { id: 'financial', label: 'Financial Summary' },
  { id: 'trend', label: 'Revenue Trend' },
  { id: 'rentroll', label: 'Rent Roll' },
  { id: 'vacancy', label: 'Vacancy' },
  { id: 'statements', label: 'Owner Statements' },
];

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('financial');
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  const { start, end } = currentMonthRange();
  const [periodStart, setPeriodStart] = useState(start);
  const [periodEnd, setPeriodEnd] = useState(end);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');

  useEffect(() => {
    api.properties.list()
      .then(setProperties)
      .catch(() => {})
      .finally(() => setPropertiesLoading(false));
  }, []);

  async function loadReport() {
    if (!periodStart || !periodEnd) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.reports.financialSummary({
        periodStart,
        periodEnd,
        propertyId: selectedPropertyId || undefined,
      });
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleExportFinancial() {
    if (!report) return;
    const headers = ['Property', 'Address', 'Rent', 'Late Fees', 'Deposits', 'Other Income', 'Total Income', 'Expenses', 'NOI'];
    const rows = report.properties.map((p) => [
      p.propertyName, p.address,
      p.incomeBreakdown.rent, p.incomeBreakdown.lateFees, p.incomeBreakdown.deposits, p.incomeBreakdown.other,
      p.totalIncome, p.totalExpenses, p.netOperatingIncome,
    ]);
    exportCsv(`financial-summary-${report.periodStart}-to-${report.periodEnd}.csv`, headers, rows);
  }

  const noiColor = (noi: number) =>
    noi >= 0 ? 'var(--color-success, #16a34a)' : 'var(--color-danger, #dc2626)';

  // Tabs that use the date-range filter vs those that are always fresh
  const showDateFilter = activeTab === 'financial' || activeTab === 'trend';

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">Financial performance, occupancy, and owner reporting</p>
        </div>
      </div>

      {/* Filters (shown for date-dependent tabs) */}
      {showDateFilter && (
        <div className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Period Start</label>
              <input
                className="form-input"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                style={{ width: '160px' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Period End</label>
              <input
                className="form-input"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                style={{ width: '160px' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Property</label>
              <select
                className="form-input"
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                disabled={propertiesLoading}
                style={{ width: '200px' }}
              >
                <option value="">All Properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {activeTab === 'financial' && (
              <button className="btn btn-primary" onClick={loadReport} disabled={loading}>
                {loading ? 'Loading…' : 'Run Report'}
              </button>
            )}
          </div>

          {/* Quick date range presets */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            {[
              { label: 'This Month', fn: () => {
                const { start, end } = currentMonthRange();
                setPeriodStart(start); setPeriodEnd(end);
              }},
              { label: 'Last Month', fn: () => {
                const now = new Date();
                const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const e = new Date(now.getFullYear(), now.getMonth(), 0);
                setPeriodStart(s.toISOString().slice(0, 10));
                setPeriodEnd(e.toISOString().slice(0, 10));
              }},
              { label: 'This Quarter', fn: () => {
                const now = new Date();
                const q = Math.floor(now.getMonth() / 3);
                const s = new Date(now.getFullYear(), q * 3, 1);
                const e = new Date(now.getFullYear(), q * 3 + 3, 0);
                setPeriodStart(s.toISOString().slice(0, 10));
                setPeriodEnd(e.toISOString().slice(0, 10));
              }},
              { label: 'This Year', fn: () => {
                const y = new Date().getFullYear();
                setPeriodStart(`${y}-01-01`);
                setPeriodEnd(`${y}-12-31`);
              }},
            ].map(({ label, fn }) => (
              <button
                key={label}
                className="btn btn-sm btn-secondary"
                onClick={fn}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Property filter for non-date tabs */}
      {!showDateFilter && (
        <div className="card" style={{ padding: '1rem 1.25rem', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Filter by Property</label>
            <select
              className="form-input"
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              disabled={propertiesLoading}
              style={{ width: '200px' }}
            >
              <option value="">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginTop: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--color-primary, #6366f1)' : 'var(--color-text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary, #6366f1)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              borderBottomWidth: '2px',
              borderBottomStyle: 'solid',
              borderBottomColor: activeTab === tab.id ? 'var(--color-primary, #6366f1)' : 'transparent',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ marginTop: '1.5rem' }}>

        {/* ─── Financial Summary ─────────────────────────────────── */}
        {activeTab === 'financial' && report && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div className="stat-card">
                <div className="stat-label">Total Income</div>
                <div className="stat-value" style={{ color: 'var(--color-success, #16a34a)' }}>
                  {fmt(report.totals.totalIncome)}
                </div>
                <div className="stat-sub">{report.periodStart} → {report.periodEnd}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Expenses</div>
                <div className="stat-value" style={{ color: 'var(--color-danger, #dc2626)' }}>
                  {fmt(report.totals.totalExpenses)}
                </div>
                <div className="stat-sub">Work order costs</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Net Operating Income</div>
                <div className="stat-value" style={{ color: noiColor(report.totals.netOperatingIncome) }}>
                  {fmt(report.totals.netOperatingIncome)}
                </div>
                <div className="stat-sub">Income minus expenses</div>
              </div>
            </div>

            {/* Per-property table */}
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                  By Property ({report.properties.length})
                </h2>
                <button className="btn btn-sm btn-secondary" onClick={handleExportFinancial}>
                  Export CSV
                </button>
              </div>

              {report.properties.length === 0 ? (
                <div className="empty-state">
                  <p>No properties found for this period.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Property</th>
                        <th style={{ textAlign: 'right' }}>Income</th>
                        <th style={{ textAlign: 'right' }}>Expenses</th>
                        <th style={{ textAlign: 'right' }}>NOI</th>
                        <th>Owners</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.properties.map((property) => (
                        <>
                          <tr
                            key={property.propertyId}
                            style={{ cursor: 'pointer' }}
                            onClick={() =>
                              setExpandedProperty(
                                expandedProperty === property.propertyId ? null : property.propertyId
                              )
                            }
                          >
                            <td>
                              <div style={{ fontWeight: 500 }}>{property.propertyName}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                {property.address}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--color-success, #16a34a)', fontWeight: 500 }}>
                              {fmt(property.totalIncome)}
                            </td>
                            <td style={{ textAlign: 'right', color: property.totalExpenses > 0 ? 'var(--color-danger, #dc2626)' : undefined }}>
                              {fmt(property.totalExpenses)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: noiColor(property.netOperatingIncome) }}>
                              {fmt(property.netOperatingIncome)}
                            </td>
                            <td>
                              {property.owners.length > 0 ? (
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                  {property.owners.map((o) => `${o.ownerName} (${o.ownershipPct}%)`).join(', ')}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Unassigned</span>
                              )}
                            </td>
                            <td>
                              <span style={{ color: 'var(--color-text-muted)', fontSize: '1rem' }}>
                                {expandedProperty === property.propertyId ? '▲' : '▼'}
                              </span>
                            </td>
                          </tr>

                          {expandedProperty === property.propertyId && (
                            <tr key={`${property.propertyId}-detail`}>
                              <td colSpan={6} style={{ padding: '1rem 1.5rem', background: 'var(--color-surface)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                  {/* Income breakdown */}
                                  <div>
                                    <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>
                                      Income Breakdown
                                    </h4>
                                    <table style={{ width: '100%', fontSize: '0.875rem' }}>
                                      <tbody>
                                        {[
                                          ['Rent', property.incomeBreakdown.rent],
                                          ['Late Fees', property.incomeBreakdown.lateFees],
                                          ['Deposits', property.incomeBreakdown.deposits],
                                          ['Other', property.incomeBreakdown.other],
                                        ].map(([label, value]) => (
                                          <tr key={label as string}>
                                            <td style={{ padding: '0.25rem 0', color: 'var(--color-text-muted)' }}>{label}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(value as number)}</td>
                                          </tr>
                                        ))}
                                        <tr style={{ borderTop: '1px solid var(--color-border)' }}>
                                          <td style={{ padding: '0.5rem 0 0', fontWeight: 600 }}>Total</td>
                                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-success, #16a34a)' }}>
                                            {fmt(property.totalIncome)}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Owner distributions */}
                                  {property.owners.length > 0 && (
                                    <div>
                                      <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>
                                        Owner Distributions (NOI-based)
                                      </h4>
                                      <table style={{ width: '100%', fontSize: '0.875rem' }}>
                                        <tbody>
                                          {property.owners.map((o) => (
                                            <tr key={o.ownerId}>
                                              <td style={{ padding: '0.25rem 0' }}>
                                                {o.ownerName}
                                                <span style={{ color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                                                  {o.ownershipPct}%
                                                </span>
                                              </td>
                                              <td style={{ textAlign: 'right', fontWeight: 500, color: noiColor(o.ownerShare) }}>
                                                {fmt(o.ownerShare)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 700, borderTop: '2px solid var(--color-border)' }}>
                        <td>Portfolio Total</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-success, #16a34a)' }}>
                          {fmt(report.totals.totalIncome)}
                        </td>
                        <td style={{ textAlign: 'right', color: report.totals.totalExpenses > 0 ? 'var(--color-danger, #dc2626)' : undefined }}>
                          {fmt(report.totals.totalExpenses)}
                        </td>
                        <td style={{ textAlign: 'right', color: noiColor(report.totals.netOperatingIncome) }}>
                          {fmt(report.totals.netOperatingIncome)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── Revenue Trend ─────────────────────────────────────── */}
        {activeTab === 'trend' && (
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              Monthly Revenue Trend
            </h2>
            <RevenueTrendChart
              periodStart={periodStart}
              periodEnd={periodEnd}
              propertyId={selectedPropertyId || undefined}
            />
          </div>
        )}

        {/* ─── Rent Roll ─────────────────────────────────────────── */}
        {activeTab === 'rentroll' && (
          <RentRollTable propertyId={selectedPropertyId || undefined} />
        )}

        {/* ─── Vacancy ───────────────────────────────────────────── */}
        {activeTab === 'vacancy' && (
          <VacancyReport propertyId={selectedPropertyId || undefined} />
        )}

        {/* ─── Owner Statements ──────────────────────────────────── */}
        {activeTab === 'statements' && (
          <OwnerStatements propertyId={selectedPropertyId || undefined} />
        )}
      </div>
    </div>
  );
}
