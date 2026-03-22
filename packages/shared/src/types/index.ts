// ─── Enums ───────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'manager' | 'maintenance';

export type PropertyType = 'apartment' | 'condo' | 'house';

export type UnitStatus = 'vacant' | 'occupied' | 'notice' | 'maintenance';

export type LeaseStatus = 'active' | 'month_to_month' | 'notice_given' | 'expired';

export type PaymentType = 'rent' | 'deposit' | 'late_fee' | 'credit';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'waived';

export type WorkOrderCategory =
  | 'plumbing'
  | 'electrical'
  | 'appliance'
  | 'hvac'
  | 'general'
  | 'other';

export type WorkOrderPriority = 'low' | 'normal' | 'urgent' | 'emergency';

export type WorkOrderStatus =
  | 'new'
  | 'assigned'
  | 'in_progress'
  | 'pending_parts'
  | 'completed'
  | 'cancelled';

export type DocumentEntityType = 'property' | 'unit' | 'lease' | 'tenant' | 'work_order';

// ─── Entity Interfaces ───────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: string;
  createdAt: Date;
}

export interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface Property {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: PropertyType;
  yearBuilt: number | null;
  unitCount: number;
  photoUrl: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  floor: number | null;
  bedrooms: number;
  bathrooms: number;
  sqFt: number | null;
  rentAmount: number;
  depositAmount: number;
  status: UnitStatus;
  notes: string | null;
  createdAt: Date;
}

export interface Tenant {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface Lease {
  id: string;
  unitId: string;
  rentAmount: number;
  depositAmount: number;
  startDate: Date;
  endDate: Date;
  status: LeaseStatus;
  lateFeeAmount: number;
  lateFeeGraceDays: number;
  documentUrl: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface LeaseParticipant {
  id: string;
  leaseId: string;
  tenantId: string;
  isPrimary: boolean;
}

export interface Payment {
  id: string;
  leaseId: string;
  tenantId: string;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
  paidAt: Date | null;
  dueDate: Date;
  notes: string | null;
  createdAt: Date;
}

export interface WorkOrder {
  id: string;
  unitId: string;
  tenantId: string | null;
  assignedToUserId: string | null;
  category: WorkOrderCategory;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  description: string;
  resolutionNotes: string | null;
  cost: number | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface Message {
  id: string;
  organizationId: string;
  senderUserId: string | null;
  recipientTenantId: string | null;
  body: string;
  attachmentUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface Document {
  id: string;
  organizationId: string;
  entityType: DocumentEntityType;
  entityId: string;
  name: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  visibleToTenant: boolean;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  actionUrl: string | null;
  createdAt: Date;
}
