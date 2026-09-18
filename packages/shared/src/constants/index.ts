// ─── User ─────────────────────────────────────────────────────────────────────

export const USER_ROLES = ['owner', 'manager', 'maintenance'] as const;
export const USER_STATUSES = ['active', 'invited', 'deactivated'] as const;

// ─── Organization ─────────────────────────────────────────────────────────────

export const PLAN_TIERS = ['starter', 'pro', 'enterprise'] as const;
export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled'] as const;

// ─── Property ─────────────────────────────────────────────────────────────────

export const PROPERTY_TYPES = ['multifamily', 'single_family', 'commercial', 'mixed_use'] as const;

// ─── Unit ─────────────────────────────────────────────────────────────────────

export const UNIT_TYPES = [
  'studio',
  'one_bed',
  'two_bed',
  'three_bed',
  'four_plus_bed',
  'commercial',
] as const;
export const UNIT_STATUSES = ['vacant', 'occupied', 'notice', 'maintenance', 'unlisted'] as const;

// ─── Appliance (Unit Intelligence & Appliance Registry) ────────────────────────

export const APPLIANCE_STATUSES = ['active', 'removed'] as const;

export const APPLIANCE_CATEGORIES = [
  'hvac',
  'water_heater',
  'refrigerator',
  'dishwasher',
  'washer',
  'dryer',
  'oven_range',
  'microwave',
  'garbage_disposal',
  'other',
] as const;

// Expected end-of-life, in years from install date (or purchase date if no
// install date is recorded), used to compute the age-based replacement alert.
// Rough industry-standard figures — not manufacturer-specific.
export const APPLIANCE_EXPECTED_LIFESPAN_YEARS: Record<(typeof APPLIANCE_CATEGORIES)[number], number> = {
  hvac: 15,
  water_heater: 10,
  refrigerator: 13,
  dishwasher: 10,
  washer: 10,
  dryer: 13,
  oven_range: 15,
  microwave: 9,
  garbage_disposal: 12,
  other: 10,
};

// ─── Tenant ───────────────────────────────────────────────────────────────────

export const PORTAL_STATUSES = ['invited', 'active', 'never_logged_in'] as const;
export const PREFERRED_CONTACTS = ['email', 'sms', 'call'] as const;
export const GOVERNMENT_ID_TYPES = ['drivers_license', 'state_id', 'passport'] as const;
export const INCOME_SOURCES = ['employment', 'self_employed', 'benefits', 'other'] as const;

// ─── Lease ────────────────────────────────────────────────────────────────────

export const LEASE_STATUSES = [
  'draft',
  'active',
  'month_to_month',
  'notice_given',
  'expired',
  'terminated',
] as const;
export const LEASE_TYPES = ['fixed_term', 'month_to_month'] as const;
export const SECURITY_DEPOSIT_STATUSES = [
  'held',
  'partial_return',
  'full_return',
  'applied_to_balance',
] as const;
export const ESIGNATURE_STATUSES = ['pending', 'partially_signed', 'completed'] as const;

export const LEASE_EXPIRY_WARNING_DAYS = {
  red: 60,
  yellow: 90,
} as const;

// ─── Payment ──────────────────────────────────────────────────────────────────

export const PAYMENT_TYPES = [
  'rent',
  'deposit',
  'late_fee',
  'pet_deposit',
  'parking',
  'credit',
  'other',
] as const;
export const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'waived', 'refunded', 'voided'] as const;
export const PAYMENT_METHODS = ['ach', 'card', 'check', 'cash', 'money_order', 'other'] as const;

// ─── Work Order ───────────────────────────────────────────────────────────────

export const WORK_ORDER_CATEGORIES = [
  'plumbing',
  'electrical',
  'hvac',
  'appliance',
  'pest',
  'structural',
  'cosmetic',
  'grounds',
  'general',
  'other',
] as const;

export const WORK_ORDER_PRIORITIES = ['emergency', 'urgent', 'routine'] as const;

export const WORK_ORDER_STATUSES = [
  'new_order',
  'assigned',
  'in_progress',
  'pending_parts',
  'completed',
  'closed',
  'cancelled',
] as const;

export const WORK_ORDER_LOCATION_TYPES = [
  'exterior',
  'parking',
  'roof',
  'landscaping',
  'common_interior',
  'amenity',
  'unit_interior',
] as const;

// ─── Vendor ───────────────────────────────────────────────────────────────────

export const VENDOR_STATUSES = ['active', 'inactive'] as const;

// ─── Document ─────────────────────────────────────────────────────────────────

export const DOCUMENT_ENTITY_TYPES = [
  'organization',
  'property',
  'unit',
  'lease',
  'tenant',
  'work_order',
  'vendor',
] as const;
export const DOCUMENT_CATEGORIES = [
  'lease',
  'inspection',
  'insurance',
  'id',
  'photo',
  'other',
] as const;

// ─── Rental Application ───────────────────────────────────────────────────────

export const RENTAL_APPLICATION_STATUSES = [
  'pending',
  'under_review',
  'approved',
  'denied',
  'withdrawn',
] as const;

// ─── Ledger ───────────────────────────────────────────────────────────────────

export const LEDGER_ENTRY_TYPES = ['credit', 'debit'] as const;

// ─── Owner Statement ──────────────────────────────────────────────────────────

export const OWNER_STATEMENT_STATUSES = ['draft', 'sent'] as const;

// ─── Disbursement (Advanced Payments & Accounting) ────────────────────────────

export const DISBURSEMENT_STATUSES = ['pending', 'completed', 'cancelled'] as const;

// ─── Inspection (Inspections & Compliance / Module 6) ─────────────────────────

export const INSPECTION_TYPES = ['move_in', 'move_out', 'scheduled', 'annual', 'semi_annual'] as const;

export const INSPECTION_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;

export const INSPECTION_MEDIA_TYPES = ['photo', 'video'] as const;

// One sensible default checklist template is seeded per org (see seed.ts) —
// this is the shape of InspectionTemplate.checklistItems, not a hardcoded
// checklist used in place of the template model. See docs/reference/modules.md
// for the configurability level actually shipped.
export const DEFAULT_INSPECTION_CHECKLIST: { section: string; item: string; description?: string }[] = [
  { section: 'Kitchen', item: 'Countertops & cabinets', description: 'Check for damage, staining, proper function' },
  { section: 'Kitchen', item: 'Sink & faucet', description: 'Check for leaks, drainage' },
  { section: 'Kitchen', item: 'Appliances', description: 'Refrigerator, oven/range, dishwasher, microwave' },
  { section: 'Bathrooms', item: 'Toilet, tub/shower, sink', description: 'Check for leaks, caulking, drainage' },
  { section: 'Bathrooms', item: 'Ventilation fan', description: '' },
  { section: 'Bedrooms', item: 'Walls, flooring, ceiling', description: 'Check for damage, stains, holes' },
  { section: 'Bedrooms', item: 'Windows & closets', description: 'Check for proper operation, locks' },
  { section: 'Living Areas', item: 'Walls, flooring, ceiling', description: '' },
  { section: 'Living Areas', item: 'Windows & doors', description: 'Check locks, screens, weatherstripping' },
  { section: 'Exterior', item: 'Doors & locks', description: '' },
  { section: 'Exterior', item: 'Yard/grounds/parking', description: 'If applicable' },
  { section: 'Appliances & Systems', item: 'HVAC', description: 'Filters, thermostat operation' },
  { section: 'Appliances & Systems', item: 'Water heater', description: '' },
  { section: 'Safety Devices', item: 'Smoke detectors', description: 'Test and confirm battery' },
  { section: 'Safety Devices', item: 'Carbon monoxide detectors', description: 'Test and confirm battery' },
  { section: 'Safety Devices', item: 'Fire extinguisher', description: 'If provided' },
];

// ─── Add-On Modules ───────────────────────────────────────────────────────────

// Keys stored in Organization.activeModules. Gates existing functionality that
// has shipped ahead of its module's billing wiring (see docs/reference/modules.md).
export const MODULE_KEYS = {
  OWNER_PORTAL: 'owner_portal',
  REPORTING_ANALYTICS: 'reporting_analytics',
  ADVANCED_TENANT_ONBOARDING: 'advanced_tenant_onboarding',
  ADVANCED_PAYMENTS_ACCOUNTING: 'advanced_payments_accounting',
  UNIT_INTELLIGENCE: 'unit_intelligence',
  INSPECTIONS_COMPLIANCE: 'inspections_compliance',
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

export const ALL_MODULE_KEYS = Object.values(MODULE_KEYS) as ModuleKey[];

// ─── API ──────────────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
