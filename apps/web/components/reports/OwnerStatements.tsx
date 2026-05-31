'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  propertyId?: string;
  properties?: { id: string; name: string }[];
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function OwnerStatements({ propertyId, properties = [] }: Props) {
  const [statements, setStatements] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    ownerId: '',
    propertyId: propertyId ?? '',
    periodStart: '',
    periodEnd: '',
  });
  const [financials, setFinancials] = useState<any>(null);
  const [loadingFinancials, setLoadingFinancials] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.ownerStatements.list(propertyId ? { propertyId } : undefined),
      api.owners.list(),
    ])
      .then(([stmts, ownrs]: [any, any]) => {
        setStatements(Array.isArray(stmts) ? stmts : []);
        setOwners(Array.isArray(ownrs) ? ownrs : []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch financials when period + property are set
  useEffect(() => {
    if (!form.periodStart || !form.periodEnd || !form.propertyId) {
      setFinancials(null);
      return;
    }
    setLoadingFinancials(true);
    api.reports
      .financialSummary({ periodStart: form.periodStart, periodEnd: form.periodEnd, propertyId: form.propertyId })
      .then((res: any) => {
        const prop = (res?.properties ?? []).find((p: any) => p.propertyId === form.propertyId);
        setFinancials(prop ?? null);
      })
      .catch(() => setFinancials(null))
      .finally(() => setLoadingFinancials(false));
  }, [form.periodStart, form.periodEnd, form.propertyId]);

  async function handleGenerate() {
    if (!form.ownerId || !form.propertyId || !form.periodStart || !form.periodEnd) return;
    setGenerating(true);
    try {
      const ownerShare = financials?.owners?.find((o: any) => o.ownerId === form.ownerId);
      await api.ownerStatements.create({
        ownerId: form.ownerId,
        propertyId: form.propertyId,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        totalIncome: financials?.totalIncome ?? 0,
        totalExpenses: financials?.totalExpenses ?? 0,
        netOperatingIncome: financials?.netOperatingIncome ?? 0,
        distributionAmount: ownerShare?.ownerShare ?? 0,
        status: 'draft',
      });
      setShowModal(false);
      setForm({ ownerId: '', propertyId: propertyId ?? '', periodStart: '', periodEnd: '' });
      setFinancials(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function markSent(id: string) {
    await api.ownerStatements.update(id, { status: 'sent' });
    load();
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-500">Loading statements…</div>;
  if (error) return <div className="py-16 text-center text-sm text-red-500">{error}</div>;

  const canGenerate = !generating && !!form.ownerId && !!form.propertyId && !!form.periodStart && !!form.periodEnd;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="text-sm bg-indigo-600 text-white rounded-md px-3 py-1.5 hover:bg-indigo-700 transition-colors"
        >
          Generate Statement
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              {['Owner', 'Property', 'Period', 'Income', 'Expenses', 'NOI', 'Distribution', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {statements.map((s: any) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-900">{s.owner?.name ?? s.ownerId}</td>
                <td className="px-4 py-2.5 text-gray-700">{s.property?.name ?? s.propertyId}</td>
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                  {s.periodStart?.slice(0, 10)} – {s.periodEnd?.slice(0, 10)}
                </td>
                <td className="px-4 py-2.5 text-gray-700">{fmt(Number(s.totalIncome))}</td>
                <td className="px-4 py-2.5 text-gray-700">{fmt(Number(s.totalExpenses))}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{fmt(Number(s.netOperatingIncome))}</td>
                <td className="px-4 py-2.5 font-medium text-indigo-700">{fmt(Number(s.distributionAmount))}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${s.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-700'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {s.status === 'draft' && (
                    <button
                      onClick={() => markSent(s.id)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Mark Sent
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {statements.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">
            No owner statements yet. Click &quot;Generate Statement&quot; to create one.
          </div>
        )}
      </div>

      {/* Generate modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Generate Owner Statement</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
                <select
                  value={form.ownerId}
                  onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md text-sm px-3 py-1.5"
                >
                  <option value="">Select owner…</option>
                  {owners.map((o: any) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Property selector — required when "All Properties" is active */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Property</label>
                <select
                  value={form.propertyId}
                  onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md text-sm px-3 py-1.5"
                >
                  <option value="">Select property…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Period Start</label>
                  <input
                    type="date"
                    value={form.periodStart}
                    onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md text-sm px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Period End</label>
                  <input
                    type="date"
                    value={form.periodEnd}
                    onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md text-sm px-3 py-1.5"
                  />
                </div>
              </div>

              {/* Auto-populated financials */}
              {loadingFinancials && <p className="text-xs text-gray-400">Fetching financials…</p>}
              {financials && !loadingFinancials && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">Total Income</span><span>{fmt(financials.totalIncome)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Total Expenses</span><span>{fmt(financials.totalExpenses)}</span></div>
                  <div className="flex justify-between font-medium"><span className="text-gray-700">NOI</span><span>{fmt(financials.netOperatingIncome)}</span></div>
                  {form.ownerId && financials.owners?.find((o: any) => o.ownerId === form.ownerId) && (
                    <div className="flex justify-between text-indigo-700 font-medium border-t pt-1">
                      <span>Owner Distribution</span>
                      <span>{fmt(financials.owners.find((o: any) => o.ownerId === form.ownerId).ownerShare)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setShowModal(false); setFinancials(null); }}
                className="text-sm border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="text-sm bg-indigo-600 text-white rounded-md px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
