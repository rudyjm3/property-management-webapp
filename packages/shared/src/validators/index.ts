import { z } from 'zod';
import {
  USER_ROLES,
  UNIT_STATUSES,
  UNIT_TYPES,
  LEASE_STATUSES,
  LEASE_TYPES,
  SECURITY_DEPOSIT_STATUSES,
  PAYMENT_TYPES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  WORK_ORDER_CATEGORIES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  PREFERRED_CONTACTS,
  GOVERNMENT_ID_TYPES,
  INCOME_SOURCES,
  VENDOR_STATUSES,
  PROPERTY_TYPES,
} from '../constants';

// ─── Organization ─────────────────────────────────────────────────────────────

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  timezone: z.string().max(100).default('America/Chicago'),
});

// ─── Property ─────────────────────────────────────────────────────────────────

export const createPropertySchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(PROPERTY_TYPES),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  state: z.string().length(2),
  zip: z.string().min(5).max(10),
  country: z.string().length(2).default('US'),
  jurisdictionNotes: z.string().max(2000).nullable().optional(),
  yearBuilt: z.number().int().min(1800).max(2100).nullable().optional(),
  amenities: z.array(z.string()).default([]),
  notes: z.string().max(2000).nullable().optional(),
});

// ─── Unit ─────────────────────────────────────────────────────────────────────

export const createUnitSchema = z.object({
  unitNumber: z.string().min(1).max(20),
  floor: z.number().int().nullable().optional(),
  type: z.enum(UNIT_TYPES).nullable().optional(),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0).max(20),
  sqFt: z.number().int().positive().nullable().optional(),
  marketRent: z.number().positive().nullable().optional(),
  rentAmount: z.number().positive(),
  depositAmount: z.number().min(0),
  status: z.enum(UNIT_STATUSES).default('vacant'),
  availableDate: z.string().date().nullable().optional(),
  parkingSpaces: z.array(z.string()).default([]),
  storageUnit: z.string().max(100).nullable().optional(),
  utilityMeterElectric: z.string().max(100).nullable().optional(),
  utilityMeterGas: z.string().max(100).nullable().optional(),
  utilityMeterWater: z.string().max(100).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().length(2).nullable().optional(),
  zip: z.string().min(5).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// ─── Tenant ───────────────────────────────────────────────────────────────────

export const createTenantSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  fullLegalName: z.string().max(200).nullable().optional(),
  preferredName: z.string().max(200).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  phoneSecondary: z.string().max(20).nullable().optional(),
  preferredContact: z.enum(PREFERRED_CONTACTS).nullable().optional(),
  languagePreference: z.string().max(10).nullable().optional(),
  ssnLast4: z.string().length(4).nullable().optional(),
  govtIdType: z.enum(GOVERNMENT_ID_TYPES).nullable().optional(),
  currentAddress: z.string().max(500).nullable().optional(),
  previousAddress: z.string().max(500).nullable().optional(),
  employerName: z.string().max(200).nullable().optional(),
  employerPhone: z.string().max(20).nullable().optional(),
  monthlyGrossIncome: z.number().positive().nullable().optional(),
  incomeSource: z.enum(INCOME_SOURCES).nullable().optional(),
  emergencyContactName: z.string().max(200).nullable().optional(),
  emergencyContactPhone: z.string().max(20).nullable().optional(),
  emergencyContact1Relationship: z.string().max(100).nullable().optional(),
  emergencyContact1Email: z.string().email().nullable().optional(),
  emergencyContact2Name: z.string().max(200).nullable().optional(),
  emergencyContact2Phone: z.string().max(20).nullable().optional(),
  emergencyContact2Relationship: z.string().max(100).nullable().optional(),
  vehicles: z.array(z.object({
    make: z.string(),
    model: z.string(),
    color: z.string(),
    plate: z.string(),
    state: z.string().length(2),
  })).nullable().optional(),
  pets: z.array(z.object({
    type: z.string(),
    breed: z.string(),
    weight: z.number(),
    name: z.string(),
  })).nullable().optional(),
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

// ─── Lease ────────────────────────────────────────────────────────────────────

export const createLeaseSchema = z.object({
  unitId: z.string().uuid(),
  tenantIds: z.array(z.string().uuid()).min(1),
  type: z.enum(LEASE_TYPES).nullable().optional(),
  rentAmount: z.number().positive(),
  depositAmount: z.number().min(0),
  startDate: z.string().date(),
  endDate: z.string().date(),
  moveInDate: z.string().date().nullable().optional(),
  noticePeriodDays: z.number().int().min(0).default(30),
  rentDueDay: z.number().int().min(1).max(28).default(1),
  lateFeeAmount: z.number().min(0).default(0),
  lateFeeGraceDays: z.number().int().min(0).default(5),
  utilitiesIncluded: z.array(z.string()).default([]),
  hasPetAddendum: z.boolean().default(false),
  petDepositAmount: z.number().min(0).nullable().optional(),
  hasParkingAddendum: z.boolean().default(false),
  parkingFee: z.number().min(0).nullable().optional(),
  occupantCount: z.number().int().min(1).default(1),
  occupantNames: z.array(z.string()).default([]),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateLeaseSchema = z.object({
  status: z.enum(LEASE_STATUSES).optional(),
  type: z.enum(LEASE_TYPES).nullable().optional(),
  rentAmount: z.number().positive().optional(),
  depositAmount: z.number().min(0).optional(),
  endDate: z.string().date().optional(),
  moveOutDate: z.string().date().nullable().optional(),
  noticePeriodDays: z.number().int().min(0).optional(),
  rentDueDay: z.number().int().min(1).max(28).optional(),
  lateFeeAmount: z.number().min(0).optional(),
  lateFeeGraceDays: z.number().int().min(0).optional(),
  securityDepositStatus: z.enum(SECURITY_DEPOSIT_STATUSES).optional(),
  securityDepositReturnedAt: z.string().date().nullable().optional(),
  securityDepositReturnAmount: z.number().min(0).nullable().optional(),
  utilitiesIncluded: z.array(z.string()).optional(),
  hasPetAddendum: z.boolean().optional(),
  petDepositAmount: z.number().min(0).nullable().optional(),
  hasParkingAddendum: z.boolean().optional(),
  parkingFee: z.number().min(0).nullable().optional(),
  occupantCount: z.number().int().min(1).optional(),
  occupantNames: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const renewLeaseSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  rentAmount: z.number().positive(),
  type: z.enum(LEASE_TYPES).nullable().optional(),
  noticePeriodDays: z.number().int().min(0).optional(),
});

// ─── Payment ──────────────────────────────────────────────────────────────────

export const createPaymentSchema = z.object({
  leaseId: z.string().uuid(),
  tenantId: z.string().uuid(),
  amount: z.number().positive(),
  type: z.enum(PAYMENT_TYPES),
  status: z.enum(PAYMENT_STATUSES).default('completed'),
  method: z.enum(PAYMENT_METHODS).default('other'),
  checkNumber: z.string().max(50).nullable().optional(),
  referenceNote: z.string().max(500).nullable().optional(),
  dueDate: z.string().date(),
  paidAt: z.string().datetime().nullable().optional(),
  periodStart: z.string().date().nullable().optional(),
  periodEnd: z.string().date().nullable().optional(),
  isLate: z.boolean().default(false),
  lateFeeApplied: z.boolean().default(false),
  lateFeeWaived: z.boolean().nullable().optional(),
  lateFeeWaivedReason: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updatePaymentSchema = z.object({
  amount: z.number().positive().optional(),
  type: z.enum(PAYMENT_TYPES).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  paidAt: z.string().datetime().nullable().optional(),
  dueDate: z.string().date().optional(),
  periodStart: z.string().date().nullable().optional(),
  periodEnd: z.string().date().nullable().optional(),
  isLate: z.boolean().optional(),
  lateFeeApplied: z.boolean().optional(),
  lateFeeWaived: z.boolean().nullable().optional(),
  lateFeeWaivedReason: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const listPaymentsFiltersSchema = z.object({
  leaseId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  type: z.enum(PAYMENT_TYPES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ─── Work Order ───────────────────────────────────────────────────────────────

export const createWorkOrderSchema = z.object({
  unitId: z.string().uuid(),
  propertyId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  category: z.enum(WORK_ORDER_CATEGORIES),
  priority: z.enum(WORK_ORDER_PRIORITIES).default('routine'),
  description: z.string().min(1).max(5000),
  entryPermissionGranted: z.boolean().default(false),
  preferredContactWindow: z.string().max(200).nullable().optional(),
});

export const updateWorkOrderSchema = z.object({
  assignedToUserId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  priority: z.enum(WORK_ORDER_PRIORITIES).optional(),
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  resolutionNotes: z.string().max(5000).nullable().optional(),
  laborCost: z.number().min(0).nullable().optional(),
  partsCost: z.number().min(0).nullable().optional(),
  totalCost: z.number().min(0).nullable().optional(),
  chargedToTenant: z.boolean().nullable().optional(),
  tenantChargeAmount: z.number().min(0).nullable().optional(),
  slaBreached: z.boolean().optional(),
});

// ─── Vendor ───────────────────────────────────────────────────────────────────

export const createVendorSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  email: z.string().email(),
  phonePrimary: z.string().min(1).max(20),
  phoneEmergency: z.string().max(20).nullable().optional(),
  specialties: z.array(z.string()).min(1),
  status: z.enum(VENDOR_STATUSES).default('active'),
  preferred: z.boolean().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  licenseNumber: z.string().max(200).nullable().optional(),
  licenseExpiresAt: z.string().date().nullable().optional(),
  insuranceOnFile: z.boolean().default(false),
  insuranceExpiresAt: z.string().date().nullable().optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

// ─── Message ──────────────────────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  recipientTenantId: z.string().uuid(),
  body: z.string().min(1).max(10000),
  unitId: z.string().uuid().nullable().optional(),
  workOrderId: z.string().uuid().nullable().optional(),
  subject: z.string().max(500).nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

// ─── Pagination ───────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
