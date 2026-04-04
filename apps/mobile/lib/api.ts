import { supabase } from './supabase';
import type {
  TenantPortalProfile,
  TenantDashboard,
  TenantPaymentListItem,
  InitiatePaymentResponse,
  TenantWorkOrderListItem,
  SubmitWorkOrderInput,
  TenantUploadUrlResponse,
} from '@propflow/shared';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body?.error?.message ?? `API error ${res.status}`);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  return json.data;
}

export const tenantApi = {
  me: (): Promise<TenantPortalProfile> =>
    apiFetch('/api/v1/tenant/me'),

  dashboard: (): Promise<TenantDashboard> =>
    apiFetch('/api/v1/tenant/dashboard'),

  payments: (cursor?: string): Promise<{ data: TenantPaymentListItem[]; nextCursor: string | null }> =>
    apiFetch(`/api/v1/tenant/payments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),

  initiatePayment: (paymentId: string): Promise<InitiatePaymentResponse> =>
    apiFetch('/api/v1/tenant/payments/initiate', {
      method: 'POST',
      body: JSON.stringify({ paymentId }),
    }),

  workOrders: (cursor?: string): Promise<{ data: TenantWorkOrderListItem[]; nextCursor: string | null }> =>
    apiFetch(`/api/v1/tenant/work-orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),

  submitWorkOrder: (input: SubmitWorkOrderInput): Promise<{ id: string }> =>
    apiFetch('/api/v1/tenant/work-orders', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  requestUploadUrl: (fileName: string, contentType: string): Promise<TenantUploadUrlResponse> =>
    apiFetch('/api/v1/tenant/upload-url', {
      method: 'POST',
      body: JSON.stringify({ fileName, contentType }),
    }),
};
