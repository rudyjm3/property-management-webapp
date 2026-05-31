'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

interface Props {
  periodStart: string;
  periodEnd: string;
  propertyId?: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function RevenueTrendChart({ periodStart, periodEnd, propertyId }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.reports
      .revenueTrend({ periodStart, periodEnd, propertyId })
      .then((res: any) => setData(res.data?.months ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [periodStart, periodEnd, propertyId]);

  if (loading) return <div className="h-64 flex items-center justify-center text-sm text-gray-500">Loading trend…</div>;
  if (error) return <div className="h-64 flex items-center justify-center text-sm text-red-500">{error}</div>;
  if (!data.length) return <div className="h-64 flex items-center justify-center text-sm text-gray-400">No data for selected period.</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => fmt(Number(value ?? 0))} />
        <Legend />
        <Bar dataKey="totalIncome" name="Income" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Bar dataKey="totalExpenses" name="Expenses" fill="#f87171" radius={[4, 4, 0, 0]} />
        <Line dataKey="netOperatingIncome" name="NOI" type="monotone" stroke="#10b981" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
