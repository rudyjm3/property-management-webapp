const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || `API error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  return json.data;
}

// Hardcoded for now — will come from auth session later
const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID || '';

export const api = {
  properties: {
    list: () => apiFetch<any[]>(`/api/v1/organizations/${ORG_ID}/properties`),
    get: (id: string) => apiFetch<any>(`/api/v1/organizations/${ORG_ID}/properties/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${ORG_ID}/properties`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${ORG_ID}/properties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${ORG_ID}/properties/${id}`, {
        method: 'DELETE',
      }),
  },
  tenants: {
    list: () => apiFetch<any[]>(`/api/v1/organizations/${ORG_ID}/tenants`),
    get: (id: string) => apiFetch<any>(`/api/v1/organizations/${ORG_ID}/tenants/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${ORG_ID}/tenants`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${ORG_ID}/tenants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${ORG_ID}/tenants/${id}`, {
        method: 'DELETE',
      }),
  },
  leases: {
    list: () => apiFetch<any[]>(`/api/v1/organizations/${ORG_ID}/leases`),
    get: (id: string) => apiFetch<any>(`/api/v1/organizations/${ORG_ID}/leases/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${ORG_ID}/leases`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${ORG_ID}/leases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    renew: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${ORG_ID}/leases/${id}/renew`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${ORG_ID}/leases/${id}`, {
        method: 'DELETE',
      }),
  },
  units: {
    list: (propertyId: string) =>
      apiFetch<any[]>(`/api/v1/organizations/${ORG_ID}/properties/${propertyId}/units`),
    get: (propertyId: string, unitId: string) =>
      apiFetch<any>(
        `/api/v1/organizations/${ORG_ID}/properties/${propertyId}/units/${unitId}`
      ),
    create: (propertyId: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${ORG_ID}/properties/${propertyId}/units`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (propertyId: string, unitId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${ORG_ID}/properties/${propertyId}/units/${unitId}`,
        { method: 'PATCH', body: JSON.stringify(data) }
      ),
    delete: (propertyId: string, unitId: string) =>
      apiFetch<void>(
        `/api/v1/organizations/${ORG_ID}/properties/${propertyId}/units/${unitId}`,
        { method: 'DELETE' }
      ),
  },
};
