// ─── User Roles ──────────────────────────────────────────────────────────────

export const USER_ROLES = ['owner', 'manager', 'maintenance'] as const;

// ─── Unit ────────────────────────────────────────────────────────────────────

export const UNIT_STATUSES = ['vacant', 'occupied', 'notice', 'maintenance'] as const;

// ─── Lease ───────────────────────────────────────────────────────────────────

export const LEASE_STATUSES = ['active', 'month_to_month', 'notice_given', 'expired'] as const;

export const LEASE_EXPIRY_WARNING_DAYS = {
  red: 60,
  yellow: 90,
} as const;

// ─── Payments ────────────────────────────────────────────────────────────────

export const PAYMENT_TYPES = ['rent', 'deposit', 'late_fee', 'credit'] as const;
export const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'waived'] as const;

// ─── Work Orders ─────────────────────────────────────────────────────────────

export const WORK_ORDER_CATEGORIES = [
  'plumbing',
  'electrical',
  'appliance',
  'hvac',
  'general',
  'other',
] as const;

export const WORK_ORDER_PRIORITIES = ['low', 'normal', 'urgent', 'emergency'] as const;

export const WORK_ORDER_STATUSES = [
  'new',
  'assigned',
  'in_progress',
  'pending_parts',
  'completed',
  'cancelled',
] as const;

// ─── API ─────────────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
