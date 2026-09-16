import { createClient } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getOwnerAuthToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function ownerApiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getOwnerAuthToken();
  const requestUrl = `${API_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(requestUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
      ...options,
    });
  } catch (err: any) {
    throw new Error(
      `Network error contacting API at ${requestUrl}. ${err?.message || 'Network request failed'}`
    );
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || `API error: ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}

export interface OwnerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  organizationId: string;
  organization: { id: string; name: string; timezone: string };
}

export interface OwnerProperty {
  propertyId: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ownershipPct: number;
  unitCount: number;
  occupiedUnits: number;
  occupancyPct: number;
}

export interface OwnerStatement {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalIncome: string;
  totalExpenses: string;
  netOperatingIncome: string;
  distributionAmount: string;
  status: string;
  notes: string | null;
  property: { id: string; name: string; address: string; city: string; state: string };
}

export interface OwnerDashboard {
  propertyCount: number;
  totalUnits: number;
  occupiedUnits: number;
  portfolioOccupancyPct: number;
  ytdDistributions: number;
  recentStatements: OwnerStatement[];
  properties: OwnerProperty[];
}

export const ownerApi = {
  me: () => ownerApiFetch<OwnerProfile>('/api/v1/owner-portal/me'),
  dashboard: () => ownerApiFetch<OwnerDashboard>('/api/v1/owner-portal/dashboard'),
  properties: () => ownerApiFetch<OwnerProperty[]>('/api/v1/owner-portal/properties'),
  statements: (propertyId?: string) =>
    ownerApiFetch<OwnerStatement[]>(
      `/api/v1/owner-portal/statements${propertyId ? `?propertyId=${propertyId}` : ''}`
    ),
  statement: (id: string) => ownerApiFetch<OwnerStatement>(`/api/v1/owner-portal/statements/${id}`),
};
