import { z } from 'zod';
import {
  USER_ROLES,
  UNIT_STATUSES,
  LEASE_STATUSES,
  PAYMENT_TYPES,
  PAYMENT_STATUSES,
  WORK_ORDER_CATEGORIES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
} from '../constants';

// ─── Organization ────────────────────────────────────────────────────────────

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
});

// ─── Property ────────────────────────────────────────────────────────────────

export const createPropertySchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  state: z.string().length(2),
  zip: z.string().min(5).max(10),
  type: z.enum(['apartment', 'condo', 'house']),
  yearBuilt: z.number().int().min(1800).max(2100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// ─── Unit ────────────────────────────────────────────────────────────────────

export const createUnitSchema = z.object({
  unitNumber: z.string().min(1).max(20),
  floor: z.number().int().nullable().optional(),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0).max(20),
  sqFt: z.number().int().positive().nullable().optional(),
  rentAmount: z.number().positive(),
  depositAmount: z.number().min(0),
  status: z.enum(UNIT_STATUSES).default('vacant'),
  notes: z.string().max(2000).nullable().optional(),
});

// ─── Tenant ──────────────────────────────────────────────────────────────────

export const createTenantSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  phone: z.string().max(20).nullable().optional(),
  emergencyContactName: z.string().max(200).nullable().optional(),
  emergencyContactPhone: z.string().max(20).nullable().optional(),
});

export const updateTenantSchema = createTenantSchema.partial();

export const inviteTenantSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  phone: z.string().max(20).nullable().optional(),
  unitId: z.string().uuid(),
  leaseStartDate: z.string().date(),
  leaseEndDate: z.string().date(),
  rentAmount: z.number().positive(),
});

// ─── Lease ───────────────────────────────────────────────────────────────────

export const createLeaseSchema = z.object({
  unitId: z.string().uuid(),
  tenantIds: z.array(z.string().uuid()).min(1),
  rentAmount: z.number().positive(),
  depositAmount: z.number().min(0),
  startDate: z.string().date(),
  endDate: z.string().date(),
  lateFeeAmount: z.number().min(0).default(0),
  lateFeeGraceDays: z.number().int().min(0).default(5),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateLeaseSchema = z.object({
  status: z.enum(LEASE_STATUSES).optional(),
  rentAmount: z.number().positive().optional(),
  depositAmount: z.number().min(0).optional(),
  endDate: z.string().date().optional(),
  lateFeeAmount: z.number().min(0).optional(),
  lateFeeGraceDays: z.number().int().min(0).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const renewLeaseSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  rentAmount: z.number().positive(),
});

// ─── Payment ─────────────────────────────────────────────────────────────────

export const createPaymentSchema = z.object({
  leaseId: z.string().uuid(),
  tenantId: z.string().uuid(),
  amount: z.number().positive(),
  type: z.enum(PAYMENT_TYPES),
  dueDate: z.string().date(),
  notes: z.string().max(2000).nullable().optional(),
});

// ─── Work Order ──────────────────────────────────────────────────────────────

export const createWorkOrderSchema = z.object({
  unitId: z.string().uuid(),
  category: z.enum(WORK_ORDER_CATEGORIES),
  priority: z.enum(WORK_ORDER_PRIORITIES).default('normal'),
  description: z.string().min(1).max(5000),
});

export const updateWorkOrderSchema = z.object({
  assignedToUserId: z.string().uuid().nullable().optional(),
  priority: z.enum(WORK_ORDER_PRIORITIES).optional(),
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  resolutionNotes: z.string().max(5000).nullable().optional(),
  cost: z.number().min(0).nullable().optional(),
});

// ─── Message ─────────────────────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  recipientTenantId: z.string().uuid(),
  body: z.string().min(1).max(10000),
});

// ─── Pagination ──────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
