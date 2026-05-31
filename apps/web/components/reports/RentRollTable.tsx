'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { exportCsv } from '@/lib/exportCsv';

interface Props {
  propertyId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  occupied: 'bg-green-100 text-green-800',
  vacant: 'bg-red-100 text-red-800',
  notice: 'bg-yellow-100 text-yellow-800',
  maintenance: 'bg-orange-100 text-orange-800',
  unlisted: 'bg-gray-100 text-gray-600',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function RentRollTable({ propertyId }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.reports
      .rentRoll({ propertyId })
      .then((res: any) => setData(res))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [propertyId]);

  if (loading) return <div className="py-16 text-center text-sm text-gray-500">Loading rent roll…</div>;
  if (error) return <div className="py-16 text-center text-sm text-red-500">{error}</div>;
  if (!data) return null;

  const { rows, summary } = data;

  function handleExport() {
    const headers = ['Property', 'Unit', 'Status', 'Tenant', 'Email', 'Monthly Rent', 'Lease Start', 'Lease End', 'Days Vacant'];
    const csvRows = rows.map((r: any) => [
      r.propertyName, r.unitNumber, r.status, r.tenantName ?? '', r.tenantEmail ?? '',
      r.rentAmount, r.leaseStart ?? '', r.leaseEnd ?? '', r.daysVacant ?? '',
    ]);
    exportCsv(`rent-roll-${data.asOf}.csv`, headers, csvRows);
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Units', value: summary.totalUnits },
          { label: 'Occupied', value: summary.occupiedUnits },
          { label: 'Vacant', value: summary.vacantUnits },
          { label: 'Occupancy Rate', value: `${summary.occupancyRate}%` },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-xl font-semibold text-gray-900 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">Total Scheduled Rent (occupied units)</span>
        <span className="font-semibold text-gray-900">{fmt(summary.totalScheduledRent)}</span>
      </div>

      {/* Export + table */}
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              {['Property', 'Unit', 'Status', 'Tenant', 'Rent/mo', 'Lease Start', 'Lease End', 'Days Vacant'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((r: any) => (
              <tr key={r.unitId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-900">{r.propertyName}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{r.unitNumber}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-700">{r.tenantName ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-2.5 text-gray-700">{fmt(r.rentAmount)}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.leaseStart ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.leaseEnd ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.daysVacant != null ? r.daysVacant : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">No units found.</div>
        )}
      </div>
    </div>
  );
}
