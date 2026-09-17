'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  propertyId?: string;
}

interface VacancyHistoryPoint {
  id: string;
  propertyId: string | null;
  snapshotDate: string;
  totalUnits: number;
  vacantUnits: number;
  vacancyRatePct: number;
  marketVacancyRatePct: number | null;
}

export function VacancyReport({ propertyId }: Props) {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<VacancyHistoryPoint[]>([]);
  const [marketRateInput, setMarketRateInput] = useState('');
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadHistory() {
    api.reports.vacancyHistory({ propertyId }).then(setHistory).catch(() => {});
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.reports
      .vacancySnapshot({ propertyId })
      .then((res: any) => setData(res))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    api.reports.vacancyHistory({ propertyId }).then(setHistory).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  async function handleRecordSnapshot() {
    setRecording(true);
    try {
      await api.reports.recordVacancySnapshot({
        propertyId,
        marketVacancyRatePct: marketRateInput ? Number(marketRateInput) : undefined,
      });
      loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to record vacancy snapshot.');
    } finally {
      setRecording(false);
    }
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-500">Loading vacancy data…</div>;
  if (error) return <div className="py-16 text-center text-sm text-red-500">{error}</div>;
  if (!data) return null;

  const maxRate = Math.max(1, ...history.map((h) => Math.max(h.vacancyRatePct, h.marketVacancyRatePct ?? 0)));

  return (
    <div className="space-y-4">
      {/* Vacancy history + market comparison */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-medium text-gray-700">Vacancy Rate History</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              placeholder="Market rate %"
              value={marketRateInput}
              onChange={(e) => setMarketRateInput(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
            />
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleRecordSnapshot}
              disabled={recording}
            >
              {recording ? 'Recording…' : 'Record Snapshot'}
            </button>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">No history recorded yet. Click &quot;Record Snapshot&quot; to start tracking.</p>
        ) : (
          <div className="flex items-end gap-3" style={{ height: '140px' }}>
            {history.map((h) => (
              <div key={h.id} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="relative w-full flex justify-center items-end" style={{ height: '100%' }}>
                  <div
                    title={`Your vacancy: ${h.vacancyRatePct.toFixed(1)}%`}
                    style={{ height: `${Math.max(4, (h.vacancyRatePct / maxRate) * 100)}%`, width: '60%' }}
                    className="bg-indigo-500 rounded-t"
                  />
                  {h.marketVacancyRatePct != null && (
                    <div
                      title={`Market: ${h.marketVacancyRatePct.toFixed(1)}%`}
                      style={{
                        position: 'absolute',
                        bottom: `${Math.max(0, (h.marketVacancyRatePct / maxRate) * 100)}%`,
                        width: '80%',
                        borderTop: '2px dashed #f97316',
                      }}
                    />
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {new Date(h.snapshotDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-indigo-500 rounded-sm" /> Your vacancy rate</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-orange-500" style={{ borderTop: '2px dashed #f97316' }} /> Market rate</span>
        </div>
      </div>

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
