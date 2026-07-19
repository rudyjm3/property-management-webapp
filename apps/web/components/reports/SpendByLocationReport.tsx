'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { exportCsv } from '@/lib/exportCsv';
import { useEffect, useState } from 'react';

interface Props {
  periodStart: string;
  periodEnd: string;
  propertyId?: string;
}

interface LocationSpend {
  locationType: string;
  workOrderCount: number;
  laborCost: number;
  partsCost: number;
  capitalSpend: number;
  routineSpend: number;
  totalSpend: number;
}

interface SpendReport {
  periodStart: string;
  periodEnd: string;
  locations: LocationSpend[];
  totals: {
    workOrderCount: number;
    laborCost: number;
    partsCost: number;
    capitalSpend: number;
    routineSpend: number;
    totalSpend: number;
  };
}

const LOCATION_LABELS: Record<string, string> = {
  exterior: 'Exterior',
  parking: 'Parking lot',
  roof: 'Roof',
  landscaping: 'Landscaping',
  common_interior: 'Common interior',
  amenity: 'Amenity',
  unit_interior: 'Unit interior',
  unspecified: 'Unspecified',
};

// Palette validated for CVD separation (routine indigo / capital amber)
const ROUTINE_COLOR = '#6366f1';
const CAPITAL_COLOR = '#f59e0b';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function SpendByLocationReport({ periodStart, periodEnd, propertyId }: Props) {
  const [report, setReport] = useState<SpendReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.reports
      .spendByLocation({ periodStart, periodEnd, propertyId })
      .then((res: SpendReport) => setReport(res))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [periodStart, periodEnd, propertyId]);

  if (loading) return <div className="h-64 flex items-center justify-center text-sm text-gray-500">Loading spend…</div>;
  if (error) return <div className="h-64 flex items-center justify-center text-sm text-red-500">{error}</div>;

  const rows = (report?.locations ?? []).filter((loc) => loc.workOrderCount > 0);

  if (!report || rows.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-400">
        No completed work orders with costs in the selected period.
      </div>
    );
  }

  const chartData = rows.map((loc) => ({
    ...loc,
    label: LOCATION_LABELS[loc.locationType] ?? loc.locationType,
  }));

  function handleExport() {
    if (!report) return;
    const headers = ['Location', 'Work Orders', 'Labor', 'Parts', 'Routine', 'Capital', 'Total'];
    const csvRows = rows.map((loc) => [
      LOCATION_LABELS[loc.locationType] ?? loc.locationType,
      loc.workOrderCount,
      loc.laborCost,
      loc.partsCost,
      loc.routineSpend,
      loc.capitalSpend,
      loc.totalSpend,
    ]);
    csvRows.push([
      'Total',
      report.totals.workOrderCount,
      report.totals.laborCost,
      report.totals.partsCost,
      report.totals.routineSpend,
      report.totals.capitalSpend,
      report.totals.totalSpend,
    ]);
    exportCsv(`spend-by-location-${report.periodStart}-to-${report.periodEnd}.csv`, headers, csvRows);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
          Maintenance Spend by Location
        </h2>
        <button className="btn btn-sm btn-secondary" onClick={handleExport}>
          Export CSV
        </button>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => fmt(Number(value ?? 0))} />
          <Legend />
          <Bar
            dataKey="routineSpend"
            name="Routine"
            stackId="spend"
            fill={ROUTINE_COLOR}
            stroke="#fff"
            strokeWidth={1}
          />
          <Bar
            dataKey="capitalSpend"
            name="Capital"
            stackId="spend"
            fill={CAPITAL_COLOR}
            stroke="#fff"
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="table-container" style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th style={{ textAlign: 'right' }}>Work Orders</th>
              <th style={{ textAlign: 'right' }}>Labor</th>
              <th style={{ textAlign: 'right' }}>Parts</th>
              <th style={{ textAlign: 'right' }}>Routine</th>
              <th style={{ textAlign: 'right' }}>Capital</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((loc) => (
              <tr key={loc.locationType}>
                <td>{LOCATION_LABELS[loc.locationType] ?? loc.locationType}</td>
                <td style={{ textAlign: 'right' }}>{loc.workOrderCount}</td>
                <td style={{ textAlign: 'right' }}>{fmt(loc.laborCost)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(loc.partsCost)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(loc.routineSpend)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(loc.capitalSpend)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(loc.totalSpend)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td>Total</td>
              <td style={{ textAlign: 'right' }}>{report.totals.workOrderCount}</td>
              <td style={{ textAlign: 'right' }}>{fmt(report.totals.laborCost)}</td>
              <td style={{ textAlign: 'right' }}>{fmt(report.totals.partsCost)}</td>
              <td style={{ textAlign: 'right' }}>{fmt(report.totals.routineSpend)}</td>
              <td style={{ textAlign: 'right' }}>{fmt(report.totals.capitalSpend)}</td>
              <td style={{ textAlign: 'right' }}>{fmt(report.totals.totalSpend)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
