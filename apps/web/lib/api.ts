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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuthToken();
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
    const baseMessage = err?.message || 'Network request failed';
    throw new Error(
      `Network error contacting API at ${requestUrl}. Ensure the API server is running and reachable. ${baseMessage}`
    );
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || `API error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  return json.data;
}

// ─── Vendor & Contractor Management (Module 5) ─────────────────────────────
// Shapes mirror apps/api/src/services/vendor.service.ts and
// packages/shared/src/validators/index.ts exactly — see docs/reference/schema.md
// for the underlying Vendor/VendorWorkOrderRating/PreferredVendorAssignment models.

export interface VendorListItem {
  id: string;
  companyName: string;
  contactName: string;
  phonePrimary: string;
  email: string;
  specialties: string[];
  status: 'active' | 'inactive';
  preferred: boolean | null;
  rating: string | null;
  licenseExpiresAt: string | null;
  insuranceExpiresAt: string | null;
}

export interface Vendor {
  id: string;
  organizationId: string;
  companyName: string;
  contactName: string;
  email: string;
  phonePrimary: string;
  phoneEmergency: string | null;
  specialties: string[];
  status: 'active' | 'inactive';
  preferred: boolean | null;
  rating: string | null;
  notes: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  insuranceOnFile: boolean;
  insuranceExpiresAt: string | null;
  w9OnFile: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorInput {
  companyName: string;
  contactName: string;
  email: string;
  phonePrimary: string;
  phoneEmergency?: string | null;
  specialties: string[];
  status?: 'active' | 'inactive';
  preferred?: boolean | null;
  notes?: string | null;
  licenseNumber?: string | null;
  licenseExpiresAt?: string | null;
  insuranceOnFile?: boolean;
  insuranceExpiresAt?: string | null;
}

export interface VendorExpiryAlert {
  id: string;
  companyName: string;
  contactName: string;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  licenseStatus: 'expired' | 'expiring' | null;
  insuranceExpiresAt: string | null;
  insuranceStatus: 'expired' | 'expiring' | null;
}

export interface VendorWorkHistory {
  range: { since: string; months: number };
  count: number;
  scheduleGeneratedCount: number;
  totalSpend: number;
  byCategory: { category: string; count: number; spend: number }[];
  ratings: {
    count: number;
    average: number | null;
    recent: { rating: number; note: string | null; createdAt: string }[];
  };
}

export interface VendorWorkOrderRating {
  id: string;
  workOrderId: string;
  vendorId: string;
  rating: number;
  note: string | null;
  createdAt: string;
}

export interface PreferredVendorAssignment {
  id: string;
  organizationId: string;
  propertyId: string | null;
  category: string;
  vendorId: string;
  vendor: { id: string; companyName: string; contactName?: string };
  property: { id: string; name: string } | null;
}

// ─── Eviction Management (Module 8) ────────────────────────────────────────
// Shapes mirror apps/api/src/services/eviction.service.ts and
// packages/shared/src/validators/index.ts — see docs/reference/schema.md for
// the underlying Eviction/StateEvictionRule models. This is a legally
// sensitive workflow — see the disclaimer on StateEvictionRule in schema.md
// and the banner shown in the eviction UI: notice-period/delivery-method
// data here is reference material, not verified legal advice.

export type EvictionNoticeType = 'pay_or_quit' | 'cure_or_quit' | 'unconditional_quit';
export type EvictionDeliveryMethod = 'certified_mail' | 'personal_service' | 'posting';
export type EvictionStatus =
  | 'notice_served'
  | 'cured'
  | 'paid'
  | 'expired'
  | 'filed'
  | 'court_date_set'
  | 'judgment'
  | 'writ_issued'
  | 'completed'
  | 'dismissed';
export type EvictionJudgmentOutcome = 'possession_landlord' | 'possession_tenant' | 'dismissed' | 'settled';

export interface StateEvictionRule {
  id: string;
  state: string;
  noticeType: EvictionNoticeType;
  noticePeriodDays: number;
  allowedDeliveryMethods: EvictionDeliveryMethod[];
  notes: string | null;
  source: string;
  lastVerifiedAt: string;
}

export interface Eviction {
  id: string;
  organizationId: string;
  leaseId: string;
  noticeType: EvictionNoticeType;
  noticeDate: string;
  stateRuleId: string | null;
  stateRule: StateEvictionRule | null;
  noticePeriodDays: number;
  deadlineDate: string;
  overrideReason: string | null;
  deliveryMethod: EvictionDeliveryMethod;
  deliveryDate: string | null;
  servedByUserId: string | null;
  servedByName: string | null;
  servedBy: { id: string; name: string; email: string } | null;
  status: EvictionStatus;
  resolvedAt: string | null;
  courtCaseNumber: string | null;
  courtName: string | null;
  filedAt: string | null;
  courtDate: string | null;
  judgmentOutcome: EvictionJudgmentOutcome | null;
  judgmentAt: string | null;
  writIssuedAt: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  dismissedReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lease: {
    id: string;
    status: string;
    rentAmount: string;
    unit: {
      id: string;
      unitNumber: string;
      propertyId: string;
      property: { id: string; name: string; address: string; city: string; state: string };
    };
    participants: { tenant: { id: string; name: string; email: string; phone: string | null } }[];
  };
}

export interface EvictionInput {
  leaseId: string;
  noticeType: EvictionNoticeType;
  noticeDate: string;
  deliveryMethod: EvictionDeliveryMethod;
  deliveryDate?: string | null;
  servedByUserId?: string | null;
  servedByName?: string | null;
  noticePeriodDays?: number | null;
  overrideReason?: string | null;
  notes?: string | null;
}

export const api = {
  auth: {
    me: () =>
      apiFetch<{
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
          activeModules: string[];
        };
      }>('/api/v1/auth/me'),

    register: (data: { name: string; orgName: string; orgPhone?: string; timezone?: string }) =>
      apiFetch<{ userId: string; orgId: string; orgName: string; role: string }>(
        '/api/v1/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
  },

  organizations: {
    get: () => apiFetch<any>(`/api/v1/organizations/${_orgId}`),
    update: (data: {
      name?: string;
      phone?: string;
      email?: string;
      timezone?: string;
      dateFormat?: string;
      logoUrl?: string | null;
      planTier?: 'starter' | 'pro' | 'enterprise';
      rentDueDay?: number;
      gracePeriodDays?: number;
      lateFeeAmount?: number;
      activeModules?: string[];
      defaultManagementFeePct?: number;
    }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
  billing: {
    summary: () =>
      apiFetch<{
        organization: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          planTier: 'starter' | 'pro' | 'enterprise';
          subscriptionStatus: string;
          trialEndsAt: string | null;
          stripeCustomerId: string | null;
          stripeSubscriptionId: string | null;
        };
        defaultPaymentMethod: {
          type: string;
          brand?: string;
          last4?: string;
          expMonth?: number;
          expYear?: number;
          bankName?: string | null;
          accountType?: string | null;
        } | null;
        invoices: Array<{
          id: string;
          number: string | null;
          status: string | null;
          amountPaid: number;
          amountDue: number;
          currency: string;
          created: number;
          dueDate: number | null;
          hostedInvoiceUrl: string | null;
          invoicePdf: string | null;
        }>;
      }>(`/api/v1/organizations/${_orgId}/billing/summary`),
    createPortalSession: () =>
      apiFetch<{ url: string }>(`/api/v1/organizations/${_orgId}/billing/portal-session`, {
        method: 'POST',
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
      apiFetch<{ message: string; email: string }>(
        `/api/v1/organizations/${_orgId}/tenants/${id}/invite-portal`,
        {
          method: 'POST',
        }
      ),
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
    moveOut: (id: string, data: { moveOutDate: string; deductions: { reason: string; amount: number }[]; notes?: string | null }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${id}/move-out`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // Advanced Payments & Accounting (Module 4) — security deposit reconciliation.
    getSecurityDepositDisposition: (id: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${id}/security-deposit-disposition`),
    reconcileSecurityDeposit: (id: string, data: { moveInConditionNotes?: string | null; moveOutConditionNotes?: string | null }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${id}/security-deposit-disposition`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // Inspections & Compliance (Module 6) — move-in vs. move-out comparison.
    compareInspections: (id: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/leases/${id}/inspections/compare`),
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
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/leases/${leaseId}/participants/${participantId}`,
        {
          method: 'DELETE',
        }
      ),
    setPrimaryParticipant: (leaseId: string, participantId: string) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/leases/${leaseId}/participants/${participantId}`,
        {
          method: 'PATCH',
        }
      ),
    sign: (leaseId: string, signatureName: string) =>
      apiFetch<{ esignatureStatus: string }>(
        `/api/v1/organizations/${_orgId}/leases/${leaseId}/sign`,
        { method: 'POST', body: JSON.stringify({ signatureName }) },
      ),
  },
  payments: {
    list: (params?: {
      leaseId?: string;
      tenantId?: string;
      status?: string;
      type?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.leaseId) query.set('leaseId', params.leaseId);
      if (params?.tenantId) query.set('tenantId', params.tenantId);
      if (params?.status) query.set('status', params.status);
      if (params?.type) query.set('type', params.type);
      if (params?.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      return apiFetch<any[]>(`/api/v1/organizations/${_orgId}/payments${qs ? `?${qs}` : ''}`);
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
    // Advanced Payments & Accounting (Module 4) — card payments alongside ACH.
    initiateCard: (paymentId: string) =>
      apiFetch<{ clientSecret: string; paymentIntentId: string; status: string }>(
        `/api/v1/organizations/${_orgId}/payments/${paymentId}/initiate-card`,
        { method: 'POST' }
      ),
    // Advanced Payments & Accounting (Module 4) — manually-recorded partial
    // payment with the remaining balance carried forward.
    recordPartial: (paymentId: string, data: { amountPaid: number; method?: string; checkNumber?: string | null; referenceNote?: string | null; notes?: string | null }) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/payments/${paymentId}/record-partial`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    void: (paymentId: string, reason: string) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/payments/${paymentId}/void`,
        { method: 'POST', body: JSON.stringify({ reason }) }
      ),
  },
  units: {
    list: (propertyId: string) =>
      apiFetch<any[]>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/units`),
    get: (propertyId: string, unitId: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}`),
    create: (propertyId: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/units`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (propertyId: string, unitId: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (propertyId: string, unitId: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}`, {
        method: 'DELETE',
      }),
    bulkCreate: (propertyId: string, units: Record<string, unknown>[]) =>
      apiFetch<{ created: number; skipped: number }>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/bulk`,
        { method: 'POST', body: JSON.stringify({ units }) }
      ),
  },
  // Unit Intelligence & Appliance Registry (Module 2) — gated by activeModules.
  appliances: {
    list: (propertyId: string, unitId: string) =>
      apiFetch<any[]>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/appliances`
      ),
    get: (propertyId: string, unitId: string, applianceId: string) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/appliances/${applianceId}`
      ),
    create: (propertyId: string, unitId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/appliances`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    update: (propertyId: string, unitId: string, applianceId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/appliances/${applianceId}`,
        { method: 'PATCH', body: JSON.stringify(data) }
      ),
    delete: (propertyId: string, unitId: string, applianceId: string) =>
      apiFetch<void>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/appliances/${applianceId}`,
        { method: 'DELETE' }
      ),
    // Marks an appliance removed without replacing it.
    retire: (propertyId: string, unitId: string, applianceId: string, removedAt?: string | null) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/appliances/${applianceId}/retire`,
        { method: 'POST', body: JSON.stringify({ removedAt }) }
      ),
    // Retires the target appliance and creates a new one linked to it.
    replace: (propertyId: string, unitId: string, applianceId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/appliances/${applianceId}/replace`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
  },
  // Inspections & Compliance (Module 6) — gated by activeModules.
  inspections: {
    list: (propertyId: string, unitId: string) =>
      apiFetch<any[]>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections`
      ),
    get: (propertyId: string, unitId: string, inspectionId: string) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections/${inspectionId}`
      ),
    create: (propertyId: string, unitId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    update: (propertyId: string, unitId: string, inspectionId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections/${inspectionId}`,
        { method: 'PATCH', body: JSON.stringify(data) }
      ),
    complete: (propertyId: string, unitId: string, inspectionId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections/${inspectionId}/complete`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    cancel: (propertyId: string, unitId: string, inspectionId: string) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections/${inspectionId}/cancel`,
        { method: 'POST' }
      ),
    delete: (propertyId: string, unitId: string, inspectionId: string) =>
      apiFetch<void>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections/${inspectionId}`,
        { method: 'DELETE' }
      ),
    requestMediaUploadUrl: (propertyId: string, unitId: string, inspectionId: string, fileName: string, contentType: string) =>
      apiFetch<{ uploadUrl: string; storageKey: string; expiresInSeconds: number }>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections/${inspectionId}/media/upload-url`,
        { method: 'POST', body: JSON.stringify({ fileName, contentType }) }
      ),
    uploadToStorage: async (uploadUrl: string, file: File, contentType: string): Promise<void> => {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!res.ok) throw new Error(`Storage upload failed: ${res.status}`);
    },
    attachMedia: (
      propertyId: string,
      unitId: string,
      inspectionId: string,
      data: {
        storageKey: string;
        mediaType: 'photo' | 'video';
        capturedAt?: string | null;
        latitude?: number | null;
        longitude?: number | null;
      }
    ) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections/${inspectionId}/media`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    listMedia: (propertyId: string, unitId: string, inspectionId: string) =>
      apiFetch<any[]>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/units/${unitId}/inspections/${inspectionId}/media`
      ),
  },
  // Grounds & Property Maintenance (Module 3) — gated by activeModules.
  maintenanceSchedules: {
    list: (propertyId: string) =>
      apiFetch<any[]>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/maintenance-schedules`),
    create: (propertyId: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/maintenance-schedules`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (propertyId: string, scheduleId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/maintenance-schedules/${scheduleId}`,
        { method: 'PATCH', body: JSON.stringify(data) }
      ),
    delete: (propertyId: string, scheduleId: string) =>
      apiFetch<void>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/maintenance-schedules/${scheduleId}`,
        { method: 'DELETE' }
      ),
  },
  // Property-scoped (grounds/common-area) inspections — Module 3, reuses
  // Module 6's Inspection/InspectionMedia models scoped to a property.
  propertyInspections: {
    list: (propertyId: string) =>
      apiFetch<any[]>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/inspections`),
    create: (propertyId: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/inspections`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    complete: (propertyId: string, inspectionId: string, data: any) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/inspections/${inspectionId}/complete`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    cancel: (propertyId: string, inspectionId: string) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/inspections/${inspectionId}/cancel`,
        { method: 'POST' }
      ),
    requestMediaUploadUrl: (propertyId: string, inspectionId: string, fileName: string, contentType: string) =>
      apiFetch<{ uploadUrl: string; storageKey: string; expiresInSeconds: number }>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/inspections/${inspectionId}/media/upload-url`,
        { method: 'POST', body: JSON.stringify({ fileName, contentType }) }
      ),
    attachMedia: (
      propertyId: string,
      inspectionId: string,
      data: { storageKey: string; mediaType: string; capturedAt?: string | null; latitude?: number | null; longitude?: number | null }
    ) =>
      apiFetch<any>(
        `/api/v1/organizations/${_orgId}/properties/${propertyId}/inspections/${inspectionId}/media`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    listMedia: (propertyId: string, inspectionId: string) =>
      apiFetch<any[]>(`/api/v1/organizations/${_orgId}/properties/${propertyId}/inspections/${inspectionId}/media`),
  },
  inspectionTemplates: {
    list: () => apiFetch<any[]>(`/api/v1/organizations/${_orgId}/inspection-templates`),
    get: (templateId: string) => apiFetch<any>(`/api/v1/organizations/${_orgId}/inspection-templates/${templateId}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/inspection-templates`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (templateId: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/inspection-templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (templateId: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/inspection-templates/${templateId}`, { method: 'DELETE' }),
  },
  workOrders: {
    list: (params?: {
      status?: string;
      priority?: string;
      category?: string;
      propertyId?: string;
      unitId?: string;
      tenantId?: string;
      limit?: number;
    }) => {
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
      list: (tenantId?: string) =>
        apiFetch<any[]>(
          `/api/v1/organizations/${_orgId}/messages/threads${tenantId ? `?tenantId=${tenantId}` : ''}`
        ),
      get: (threadId: string) =>
        apiFetch<any[]>(`/api/v1/organizations/${_orgId}/messages/threads/${threadId}`),
    },
    attachmentUploadUrl: (fileName: string, contentType: string) =>
      apiFetch<{ uploadUrl: string; storageKey: string }>(
        `/api/v1/organizations/${_orgId}/messages/attachment-upload-url`,
        { method: 'POST', body: JSON.stringify({ fileName, contentType }) }
      ),
    send: (data: {
      senderUserId: string;
      recipientTenantId: string;
      body: string;
      threadId?: string | null;
      subject?: string | null;
      unitId?: string | null;
      workOrderId?: string | null;
      attachmentStorageKey?: string | null;
      attachmentName?: string | null;
      attachmentMimeType?: string | null;
    }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  notifications: {
    list: (params?: { userId?: string; unreadOnly?: boolean; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.userId) query.set('userId', params.userId);
      if (params?.unreadOnly) query.set('unreadOnly', 'true');
      if (params?.limit) query.set('limit', String(params.limit));
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
      apiFetch<any>(`/api/v1/organizations/${_orgId}/notifications/jobs/late-fees`, {
        method: 'POST',
      }),
    triggerRentReminders: () =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/notifications/jobs/rent-reminders`, {
        method: 'POST',
      }),
    triggerLeaseExpiry: () =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/notifications/jobs/lease-expiry`, {
        method: 'POST',
      }),
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
    update: (
      userId: string,
      data: {
        role?: string;
        status?: string;
        notifRentOverdue?: string;
        notifWorkOrder?: string;
        notifLeaseExpiry?: string;
        notifNewMessage?: string;
      }
    ) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/staff/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
  vendors: {
    list: (params?: { activeOnly?: boolean }) => {
      const qs = params?.activeOnly ? '?status=active' : '';
      return apiFetch<VendorListItem[]>(`/api/v1/organizations/${_orgId}/vendors${qs}`);
    },
    get: (id: string) => apiFetch<Vendor>(`/api/v1/organizations/${_orgId}/vendors/${id}`),
    create: (data: VendorInput) =>
      apiFetch<Vendor>(`/api/v1/organizations/${_orgId}/vendors`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<VendorInput>) =>
      apiFetch<Vendor>(`/api/v1/organizations/${_orgId}/vendors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/vendors/${id}`, {
        method: 'DELETE',
      }),
    // Vendor & Contractor Management (Module 5) — gated behind vendor_management
    expiryAlerts: () => apiFetch<VendorExpiryAlert[]>(`/api/v1/organizations/${_orgId}/vendors/expiry-alerts`),
    workHistory: (id: string, months?: number) =>
      apiFetch<VendorWorkHistory>(`/api/v1/organizations/${_orgId}/vendors/${id}/work-history${months ? `?months=${months}` : ''}`),
    preferredAssignments: {
      list: () => apiFetch<PreferredVendorAssignment[]>(`/api/v1/organizations/${_orgId}/vendors/preferred-assignments`),
      upsert: (data: { propertyId?: string | null; category: string; vendorId: string }) =>
        apiFetch<PreferredVendorAssignment>(`/api/v1/organizations/${_orgId}/vendors/preferred-assignments`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        apiFetch<void>(`/api/v1/organizations/${_orgId}/vendors/preferred-assignments/${id}`, {
          method: 'DELETE',
        }),
    },
    rateWorkOrder: (workOrderId: string, data: { rating: number; note?: string | null }) =>
      apiFetch<VendorWorkOrderRating>(`/api/v1/organizations/${_orgId}/work-orders/${workOrderId}/vendor-rating`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
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
      apiFetch<{ uploadUrl: string; storageKey: string; expiresInSeconds: number }>(
        `/api/v1/organizations/${_orgId}/documents/upload-url`,
        { method: 'POST', body: JSON.stringify(data) }
      ),

    uploadToStorage: async (uploadUrl: string, file: File, contentType: string): Promise<void> => {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!res.ok) throw new Error(`Storage upload failed: ${res.status}`);
    },

    confirmUpload: (data: {
      storageKey: string;
      entityType: string;
      entityId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      docCategory?: string | null;
      label?: string | null;
      visibleToTenant?: boolean;
    }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/documents`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    list: (params?: { entityType?: string; entityId?: string }) => {
      const query = new URLSearchParams();
      if (params?.entityType) query.set('entityType', params.entityType);
      if (params?.entityId) query.set('entityId', params.entityId);
      const qs = query.toString();
      return apiFetch<any[]>(`/api/v1/organizations/${_orgId}/documents${qs ? `?${qs}` : ''}`);
    },

    getDownloadUrl: (docId: string) =>
      apiFetch<{ downloadUrl: string; document: any }>(
        `/api/v1/organizations/${_orgId}/documents/${docId}/download-url`
      ),

    delete: (docId: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/documents/${docId}`, { method: 'DELETE' }),
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

  applications: {
    generateLink: (unitId: string) =>
      apiFetch<{ id: string; token: string; url: string }>(
        `/api/v1/organizations/${_orgId}/application-links`,
        { method: 'POST', body: JSON.stringify({ unitId }) },
      ),

    list: (params?: { status?: string; search?: string; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.search) qs.set('search', params.search);
      if (params?.cursor) qs.set('cursor', params.cursor);
      const q = qs.toString();
      return apiFetch<{ data: any[]; nextCursor: string | null }>(
        `/api/v1/organizations/${_orgId}/applications${q ? `?${q}` : ''}`,
      );
    },

    get: (id: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/applications/${id}`),

    review: (
      id: string,
      data: {
        status: 'approved' | 'denied';
        reviewNotes?: string | null;
        leaseStartDate?: string;
        leaseEndDate?: string;
        rentAmount?: number;
        depositAmount?: number;
      },
    ) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/applications/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    pendingCount: () =>
      apiFetch<{ count: number }>(`/api/v1/organizations/${_orgId}/applications?status=pending&limit=1`)
        .then((r: any) => (r.data?.length ?? 0)),

    runScreening: (id: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/applications/${id}/screening`, {
        method: 'POST',
      }),

    getScreening: (id: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/applications/${id}/screening`),
  },

  owners: {
    list: () => apiFetch<any[]>(`/api/v1/organizations/${_orgId}/owners`),
    get: (id: string) => apiFetch<any>(`/api/v1/organizations/${_orgId}/owners/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/owners`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/owners/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/owners/${id}`, { method: 'DELETE' }),
    listPropertyOwners: (propertyId: string) =>
      apiFetch<any[]>(`/api/v1/organizations/${_orgId}/owners/properties/${propertyId}/owners`),
    assignToProperty: (propertyId: string, data: { ownerId: string; ownershipPct: number }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/owners/properties/${propertyId}/owners`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    removeFromProperty: (propertyId: string, ownerId: string) =>
      apiFetch<void>(
        `/api/v1/organizations/${_orgId}/owners/properties/${propertyId}/owners/${ownerId}`,
        { method: 'DELETE' }
      ),
    invitePortal: (id: string) =>
      apiFetch<{ id: string; email: string; portalStatus: string; portalInvitedAt: string }>(
        `/api/v1/organizations/${_orgId}/owners/${id}/invite-portal`,
        { method: 'POST' }
      ),
  },

  ownerStatements: {
    list: (params?: { ownerId?: string; propertyId?: string }) => {
      const query = new URLSearchParams();
      if (params?.ownerId) query.set('ownerId', params.ownerId);
      if (params?.propertyId) query.set('propertyId', params.propertyId);
      const qs = query.toString();
      return apiFetch<any[]>(`/api/v1/organizations/${_orgId}/owners/statements${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/owners/statements/${id}`),
    create: (data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/owners/statements`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/owners/statements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/owners/statements/${id}`, {
        method: 'DELETE',
      }),
    // Advanced Payments & Accounting (Module 4) — disbursements tied to a statement.
    listDisbursements: (statementId: string) =>
      apiFetch<any[]>(`/api/v1/organizations/${_orgId}/owners/statements/${statementId}/disbursements`),
    createDisbursement: (statementId: string, data: { managementFeePct?: number; referenceNote?: string | null }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/owners/statements/${statementId}/disbursements`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateDisbursement: (disbursementId: string, data: { status: string; referenceNote?: string | null }) =>
      apiFetch<any>(`/api/v1/organizations/${_orgId}/owners/disbursements/${disbursementId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  reports: {
    financialSummary: (params: {
      periodStart: string;
      periodEnd: string;
      propertyId?: string;
    }) => {
      const query = new URLSearchParams();
      query.set('periodStart', params.periodStart);
      query.set('periodEnd', params.periodEnd);
      if (params.propertyId) query.set('propertyId', params.propertyId);
      return apiFetch<any>(`/api/v1/organizations/${_orgId}/reports/financial-summary?${query.toString()}`);
    },
    revenueTrend: (params: { periodStart: string; periodEnd: string; propertyId?: string }) => {
      const query = new URLSearchParams();
      query.set('periodStart', params.periodStart);
      query.set('periodEnd', params.periodEnd);
      if (params.propertyId) query.set('propertyId', params.propertyId);
      return apiFetch<any>(`/api/v1/organizations/${_orgId}/reports/financial-trend?${query.toString()}`);
    },
    rentRoll: (params?: { propertyId?: string; status?: string }) => {
      const query = new URLSearchParams();
      if (params?.propertyId) query.set('propertyId', params.propertyId);
      if (params?.status) query.set('status', params.status);
      const qs = query.toString();
      return apiFetch<any>(`/api/v1/organizations/${_orgId}/reports/rent-roll${qs ? `?${qs}` : ''}`);
    },
    vacancySnapshot: (params?: { propertyId?: string }) => {
      const query = new URLSearchParams();
      if (params?.propertyId) query.set('propertyId', params.propertyId);
      const qs = query.toString();
      return apiFetch<any>(`/api/v1/organizations/${_orgId}/reports/vacancy-snapshot${qs ? `?${qs}` : ''}`);
    },
    spendByLocation: (params: { periodStart: string; periodEnd: string; propertyId?: string }) => {
      const query = new URLSearchParams();
      query.set('periodStart', params.periodStart);
      query.set('periodEnd', params.periodEnd);
      if (params.propertyId) query.set('propertyId', params.propertyId);
      return apiFetch<any>(`/api/v1/organizations/${_orgId}/reports/spend-by-location?${query.toString()}`);
    },
    vacancyHistory: (params?: { propertyId?: string; periodStart?: string; periodEnd?: string }) => {
      const query = new URLSearchParams();
      if (params?.propertyId) query.set('propertyId', params.propertyId);
      if (params?.periodStart) query.set('periodStart', params.periodStart);
      if (params?.periodEnd) query.set('periodEnd', params.periodEnd);
      const qs = query.toString();
      return apiFetch<any[]>(`/api/v1/organizations/${_orgId}/reports/vacancy-history${qs ? `?${qs}` : ''}`);
    },
    recordVacancySnapshot: (data?: { propertyId?: string; marketVacancyRatePct?: number }) =>
      apiFetch<any[]>(`/api/v1/organizations/${_orgId}/reports/vacancy-history/snapshot`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      }),
    runBuilder: (data: { source: string; columns?: string[]; filters?: Record<string, unknown> }) =>
      apiFetch<{ source: string; availableColumns: string[]; columns: string[]; rows: Record<string, unknown>[] }>(
        `/api/v1/organizations/${_orgId}/reports/builder`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    // Advanced Payments & Accounting (Module 4) — Schedule E tax export.
    scheduleEExport: (params: { periodStart: string; periodEnd: string; propertyId?: string }) => {
      const query = new URLSearchParams();
      query.set('periodStart', params.periodStart);
      query.set('periodEnd', params.periodEnd);
      if (params.propertyId) query.set('propertyId', params.propertyId);
      return apiFetch<any>(`/api/v1/organizations/${_orgId}/reports/schedule-e-export?${query.toString()}`);
    },
    // Grounds & Property Maintenance (Module 3) — task completion history and
    // photo-compliance rate per property. Gated behind both grounds_maintenance
    // and reporting_analytics (see reports.ts).
    groundsMaintenanceCompliance: (params?: { propertyId?: string; periodStart?: string; periodEnd?: string }) => {
      const query = new URLSearchParams();
      if (params?.propertyId) query.set('propertyId', params.propertyId);
      if (params?.periodStart) query.set('periodStart', params.periodStart);
      if (params?.periodEnd) query.set('periodEnd', params.periodEnd);
      const qs = query.toString();
      return apiFetch<any>(`/api/v1/organizations/${_orgId}/reports/grounds-maintenance-compliance${qs ? `?${qs}` : ''}`);
    },
    savedReports: {
      list: () => apiFetch<any[]>(`/api/v1/organizations/${_orgId}/reports/saved`),
      create: (data: { name: string; source: string; columns: string[]; filters: Record<string, unknown> }) =>
        apiFetch<any>(`/api/v1/organizations/${_orgId}/reports/saved`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        apiFetch<void>(`/api/v1/organizations/${_orgId}/reports/saved/${id}`, { method: 'DELETE' }),
    },
  },

  // Eviction Management (Module 8) — gated by activeModules.
  evictions: {
    list: (params?: { leaseId?: string; status?: EvictionStatus }) => {
      const query = new URLSearchParams();
      if (params?.leaseId) query.set('leaseId', params.leaseId);
      if (params?.status) query.set('status', params.status);
      const qs = query.toString();
      return apiFetch<Eviction[]>(`/api/v1/organizations/${_orgId}/evictions${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions/${id}`),
    create: (data: EvictionInput) =>
      apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<EvictionInput>) =>
      apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/v1/organizations/${_orgId}/evictions/${id}`, { method: 'DELETE' }),
    resolve: (id: string, data: { outcome: 'cured' | 'paid' | 'expired'; resolvedAt?: string | null }) =>
      apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    file: (id: string, data: { courtCaseNumber: string; courtName?: string | null; filedAt?: string | null }) =>
      apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions/${id}/file`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    setCourtDate: (id: string, courtDate: string) =>
      apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions/${id}/court-date`, {
        method: 'POST',
        body: JSON.stringify({ courtDate }),
      }),
    recordJudgment: (id: string, data: { judgmentOutcome: EvictionJudgmentOutcome; judgmentAt?: string | null }) =>
      apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions/${id}/judgment`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    recordWrit: (id: string, writIssuedAt?: string | null) =>
      apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions/${id}/writ`, {
        method: 'POST',
        body: JSON.stringify({ writIssuedAt }),
      }),
    complete: (id: string, completedAt?: string | null) =>
      apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ completedAt }),
      }),
    dismiss: (id: string, dismissedReason: string, dismissedAt?: string | null) =>
      apiFetch<Eviction>(`/api/v1/organizations/${_orgId}/evictions/${id}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({ dismissedReason, dismissedAt }),
      }),
  },

  // Read-only — StateEvictionRule is shared across every org, and this
  // codebase's RBAC has no platform-admin concept, so there is no
  // customer-facing write endpoint for it (see routes/state-eviction-rules.ts).
  stateEvictionRules: {
    list: (state?: string) =>
      apiFetch<StateEvictionRule[]>(`/api/v1/organizations/${_orgId}/state-eviction-rules${state ? `?state=${state}` : ''}`),
    get: (id: string) => apiFetch<StateEvictionRule>(`/api/v1/organizations/${_orgId}/state-eviction-rules/${id}`),
  },
};
