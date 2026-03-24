// ─── User ─────────────────────────────────────────────────────────────────────

export const USER_ROLES = ['owner', 'manager', 'maintenance'] as const;
export const USER_STATUSES = ['active', 'invited', 'deactivated'] as const;

// ─── Organization ─────────────────────────────────────────────────────────────

export const PLAN_TIERS = ['starter', 'pro', 'enterprise'] as const;
export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled'] as const;

// ─── Property ─────────────────────────────────────────────────────────────────

export const PROPERTY_TYPES = ['multifamily', 'single_family', 'commercial', 'mixed_use'] as const;

// ─── Unit ─────────────────────────────────────────────────────────────────────

export const UNIT_TYPES = ['studio', 'one_bed', 'two_bed', 'three_bed', 'four_plus_bed', 'commercial'] as const;
export const UNIT_STATUSES = ['vacant', 'occupied', 'notice', 'maintenance', 'unlisted'] as const;

// ─── Tenant ───────────────────────────────────────────────────────────────────

export const PORTAL_STATUSES = ['invited', 'active', 'never_logged_in'] as const;
export const PREFERRED_CONTACTS = ['email', 'sms', 'call'] as const;
export const GOVERNMENT_ID_TYPES = ['drivers_license', 'state_id', 'passport'] as const;
export const INCOME_SOURCES = ['employment', 'self_employed', 'benefits', 'other'] as const;

// ─── Lease ────────────────────────────────────────────────────────────────────

export const LEASE_STATUSES = ['draft', 'active', 'month_to_month', 'notice_given', 'expired', 'terminated'] as const;
export const LEASE_TYPES = ['fixed_term', 'month_to_month'] as const;
export const SECURITY_DEPOSIT_STATUSES = ['held', 'partial_return', 'full_return', 'applied_to_balance'] as const;
export const ESIGNATURE_STATUSES = ['pending', 'partially_signed', 'completed'] as const;

export const LEASE_EXPIRY_WARNING_DAYS = {
  red: 60,
  yellow: 90,
} as const;

// ─── Payment ──────────────────────────────────────────────────────────────────

export const PAYMENT_TYPES = ['rent', 'deposit', 'late_fee', 'pet_deposit', 'parking', 'credit', 'other'] as const;
export const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'waived', 'refunded'] as const;
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

// ─── Vendor ───────────────────────────────────────────────────────────────────

export const VENDOR_STATUSES = ['active', 'inactive'] as const;

// ─── Document ─────────────────────────────────────────────────────────────────

export const DOCUMENT_ENTITY_TYPES = ['property', 'unit', 'lease', 'tenant', 'work_order', 'vendor'] as const;
export const DOCUMENT_CATEGORIES = ['lease', 'inspection', 'insurance', 'id', 'photo', 'other'] as const;

// ─── API ──────────────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
