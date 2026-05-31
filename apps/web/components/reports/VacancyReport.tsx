'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  propertyId?: string;
}

export function VacancyReport({ propertyId }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.reports
      .vacancySnapshot({ propertyId })
      .then((res: any) => setData(res))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [propertyId]);

  if (loading) return <div className="py-16 text-center text-sm text-gray-500">Loading vacancy data…</div>;
  if (error) return <div className="py-16 text-center text-sm text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Units', value: data.totalUnits },
          { label: 'Occupied', value: data.byStatus.occupied },
          { label: 'Vacant', value: data.byStatus.vacant },
          { label: 'Occupancy Rate', value: `${data.occupancyRate}%` },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-xl font-semibold text-gray-900 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Units by Status</h3>
        <div className="flex flex-wrap gap-4">
          {Object.entries(data.byStatus as Record<string, number>).map(([status, count]) => (
            <div key={status} className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-gray-900">{count as number}</span>
              <span className="capitalize text-gray-500">{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-property breakdown */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              {['Property', 'Total', 'Occupied', 'Vacant', 'Notice', 'Occupancy %', 'Avg Days Vacant'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {data.properties.map((p: any) => (
              <tr key={p.propertyId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{p.propertyName}</td>
                <td className="px-4 py-2.5 text-gray-700">{p.totalUnits}</td>
                <td className="px-4 py-2.5 text-gray-700">{p.occupiedUnits}</td>
                <td className="px-4 py-2.5 text-gray-700">{p.vacantUnits}</td>
                <td className="px-4 py-2.5 text-gray-700">{p.noticeUnits}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-medium ${p.occupancyRate >= 90 ? 'text-green-600' : p.occupancyRate >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {p.occupancyRate}%
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{p.avgDaysVacant != null ? `${p.avgDaysVacant}d` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.properties.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">No properties found.</div>
        )}
      </div>
    </div>
  );
}
