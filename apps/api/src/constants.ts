// Lease statuses that represent a currently active tenancy.
// Used across services to consistently define what "current" means.
export const CURRENT_LEASE_STATUSES = ['active', 'month_to_month', 'notice_given'] as const;
