import { createClient } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Runtime auth state — set by AuthProvider after login
let _orgId: string = process.env.NEXT_PUBLIC_ORG_ID || '';
let _userId: string = '';

export function setAuthContext(orgId: string, userId: string) {
  _orgId = orgId;
  _userId = userId;
}

export function getOrgId() {
  return _orgId;
}

async function getAuthToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuthToken();

  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export const api = {
  auth: {
    me: () => apiFetch<{
      id: string;
      email: string;
      name: string;
      role: string;
      organizationId: string;
      organization: {
        id: string;
        name: string;
        slug: string;
        timezone: string;
        rentDueDay: number;
        gracePeriodDays: number;
        lateFeeAmount: string;
      };
    }>('/api/v1/auth/me'),

    register: (data: { name: string; orgName: string; orgPhone?: string; timezone?: string }) =>
      apiFetch<{ userId: string; orgId: string; orgName: string; role: string }>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  organizations: {
    get: () => apiFetch<any>(`/api/v1/organizations/${_orgId}`),
    update: (data: {
      name?: string;
      phone?: string;
      email?: string;
      timezone?: string;
      dateFormat?: string;
      rentDueDay?: number;
      gracePeriodDays?: number;
      lateFeeAmount?: number;
    }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  properties: {
    list: () => apiFetch<any[]>(`/api/v1/organizations/${_orgId}/properties`),
    get: (id: string) => apiFetch<any>(`/api/v1/organizations/${_orgId}/properties/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/properties`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/properties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/properties/${id}`, {
        method: 'DELETE',
      }),
  },
  tenants: {
    list: () => apiFetch<any[]>(`/api/v1/organizations/${_orgId}/tenants`),
    get: (id: string) => apiFetch<any>(`/api/v1/organizations/${_orgId}/tenants/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/tenants`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/tenants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/tenants/${id}`, {
        method: 'DELETE',
      }),
    invitePortal: (id: string) =>
      apiFetch<{ message: string; email: string }>(`/api/v1/organizations/${_orgId}/tenants/${id}/invite-portal`, {
        method: 'POST',
      }),
  },
  leases: {
    list: () => apiFetch<any[]>(`/api/v1/organizations/${_orgId}/leases`),
    get: (id: string) => apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    renew: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${id}/renew`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/leases/${id}`, {
        method: 'DELETE',
      }),
    addParticipant: (leaseId: string, tenantId: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${leaseId}/participants`, {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      }),
    removeParticipant: (leaseId: string, participantId: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${leaseId}/participants/${participantId}`, {
        method: 'DELETE',
      }),
    setPrimaryParticipant: (leaseId: string, participantId: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${leaseId}/participants/${participantId}`, {
        method: 'PATCH',
      }),
  },
  payments: {
    list: (params?: { leaseId?: string; tenantId?: string; status?: string; type?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.leaseId) query.set('leaseId', params.leaseId);
      if (params?.tenantId) query.set('tenantId', params.tenantId);
      if (params?.status) query.set('status', params.status);
      if (params?.type) query.set('type', params.type);
      if (params?.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      return apiFetch<any[]>(
        `/api/v1/organizations/${_orgId}/payments${qs ? `?${qs}` : ''}`
      );
    },
    stats: () => apiFetch<any>(`/api/v1/organizations/${_orgId}/payments/stats`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/payments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/payments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/payments/${id}`, {
        method: 'DELETE',
      }),
    initiateACH: (paymentId: string) =>
      apiFetch<{ clientSecret: string; paymentIntentId: string; status: string }>(
        `/api/v1/organizations/${_orgId}/payments/${paymentId}/initiate-ach`,
        { method: 'POST' }
      ),
    cancelACH: (paymentId: string) =>
      apiFetch<{ cancelled: boolean }>(
        `/api/v1/organizations/${_orgId}/payments/${paymentId}/cancel-ach`,
        { method: 'POST' }
      ),
  },
  units: {
    list: (propertyId: string) =>
      apiFetch<any[]>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/units`),
    get: (propertyId: string, unitId: string) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}`
      ),
    create: (propertyId: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/units`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (propertyId: string, unitId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}`,
        { method: 'PATCH', body: JSON.stringify(data) }
      ),
    delete: (propertyId: string, unitId: string) =>
      apiFetch<void>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}`,
        { method: 'DELETE' }
      ),
  },
  workOrders: {
    list: (params?: { status?: string; priority?: string; category?: string; propertyId?: string; unitId?: string; tenantId?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.priority) query.set('priority', params.priority);
      if (params?.category) query.set('category', params.category);
      if (params?.propertyId) query.set('propertyId', params.propertyId);
      if (params?.unitId) query.set('unitId', params.unitId);
      if (params?.tenantId) query.set('tenantId', params.tenantId);
      if (params?.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      return apiFetch<any[]>(`/api/v1/organizations/${_orgId}/work-orders${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => apiFetch<any>(`/api/v1/organizations/${_orgId}/work-orders/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/work-orders`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/work-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/work-orders/${id}`, {
        method: 'DELETE',
      }),
  },
  messages: {
    threads: {
      list: () => apiFetch<any[]>(`/api/v1/organizations/${_orgId}/messages/threads`),
      get: (threadId: string) => apiFetch<any[]>(`/api/v1/organizations/${_orgId}/messages/threads/${threadId}`),
    },
    send: (data: { senderUserId: string; recipientTenantId: string; body: string; threadId?: string | null; subject?: string | null; unitId?: string | null; workOrderId?: string | null }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  notifications: {
    list: (params?: { userId?: string; unreadOnly?: boolean }) => {
      const query = new URLSearchParams();
      if (params?.userId) query.set('userId', params.userId);
      if (params?.unreadOnly) query.set('unreadOnly', 'true');
      const qs = query.toString();
      return apiFetch<any[]>(`/api/v1/organizations/${_orgId}/notifications${qs ? `?${qs}` : ''}`);
    },
    markRead: (notifId: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/notifications/${notifId}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: _userId }),
      }),
    markAllRead: () =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/notifications/read-all`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: _userId }),
      }),
    triggerLateFees: () =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/notifications/jobs/late-fees`, { method: 'POST' }),
    triggerRentReminders: () =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/notifications/jobs/rent-reminders`, { method: 'POST' }),
  },
  staff: {
    list: (params?: { includeInactive?: boolean }) => {
      const qs = params?.includeInactive ? '?includeInactive=true' : '';
      return apiFetch<any[]>(`/api/v1/organizations/${_orgId}/staff${qs}`);
    },
    invite: (data: { email: string; name: string; role?: string }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/staff/invite`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (userId: string, data: {
      role?: string;
      status?: string;
      notifRentOverdue?: string;
      notifWorkOrder?: string;
      notifLeaseExpiry?: string;
      notifNewMessage?: string;
    }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/staff/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
  vendors: {
    list: (params?: { activeOnly?: boolean }) => {
      const qs = params?.activeOnly ? '?status=active' : '';
      return apiFetch<any[]>(`/api/v1/organizations/${_orgId}/vendors${qs}`);
    },
  },
  documents: {
    requestUploadUrl: (data: {
      entityType: string;
      entityId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      docCategory?: string | null;
      label?: string | null;
      visibleToTenant?: boolean;
    }) =>
      apiFetch<{ uploadUrl: string; s3Key: string; expiresInSeconds: number }>(
        `/api/v1/organizations/${_orgId}/documents/upload-url`,
        { method: 'POST', body: JSON.stringify(data) },
      ),

    uploadToS3: async (uploadUrl: string, file: File, contentType: string): Promise<void> => {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
    },

    confirmUpload: (data: {
      s3Key: string;
      entityType: string;
      entityId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      docCategory?: string | null;
      label?: string | null;
      visibleToTenant?: boolean;
    }) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/documents`,
        { method: 'POST', body: JSON.stringify(data) },
      ),

    list: (params?: { entityType?: string; entityId?: string }) => {
      const query = new URLSearchParams();
      if (params?.entityType) query.set('entityType', params.entityType);
      if (params?.entityId) query.set('entityId', params.entityId);
      const qs = query.toString();
      return apiFetch<any[]>(
        `/api/v1/organizations/${_orgId}/documents${qs ? `?${qs}` : ''}`,
      );
    },

    getDownloadUrl: (docId: string) =>
      apiFetch<{ downloadUrl: string; document: any }>(
        `/api/v1/organizations/${_orgId}/documents/${docId}/download-url`,
      ),

    delete: (docId: string) =>
      apiFetch<void>(
        `/api/v1/organizations/${_orgId}/documents/${docId}`,
        { method: 'DELETE' },
      ),
  },

  ledger: {
    list: (params?: { paymentId?: string; type?: string; limit?: number; cursor?: string }) => {
      const query = new URLSearchParams();
      if (params?.paymentId) query.set('paymentId', params.paymentId);
      if (params?.type) query.set('type', params.type);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.cursor) query.set('cursor', params.cursor);
      const qs = query.toString();
      return apiFetch<any[]>(`/api/v1/organizations/${_orgId}/ledger${qs ? `?${qs}` : ''}`);
    },
  },

  connect: {
    getStatus: () =>
      apiFetch<{
        stripeAccountId: string | null;
        stripeAccountStatus: 'not_connected' | 'pending' | 'active' | 'restricted';
        stripeAccountDetailsSubmitted: boolean;
      }>(`/api/v1/organizations/${_orgId}/connect/status`),

    createAccountLink: () =>
      apiFetch<{ url: string }>(`/api/v1/organizations/${_orgId}/connect/account-link`, {
        method: 'POST',
      }),

    syncStatus: () =>
      apiFetch<{
        stripeAccountStatus: 'not_connected' | 'pending' | 'active' | 'restricted';
        stripeAccountDetailsSubmitted: boolean;
      }>(`/api/v1/organizations/${_orgId}/connect/sync`, {
        method: 'POST',
      }),
  },
};
