'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ModuleKey } from '@propflow/shared';

const MODULE_LABELS: Record<ModuleKey, string> = {
  owner_portal: 'Owner Portal',
  reporting_analytics: 'Reporting & Analytics',
  advanced_tenant_onboarding: 'Advanced Tenant Onboarding',
  advanced_payments_accounting: 'Advanced Payments & Accounting',
  unit_intelligence: 'Unit Intelligence & Appliance Registry',
  inspections_compliance: 'Inspections & Compliance',
  grounds_maintenance: 'Grounds & Property Maintenance',
};

interface ModuleGateProps {
  module: ModuleKey;
  children: ReactNode;
  /** Rendered instead of children when the module isn't active. Defaults to null (renders nothing). */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on whether `module` is in the org's
 * activeModules (from AuthContext, populated by GET /auth/me). Until module
 * billing ships, activation is a manual settings toggle — see
 * docs/reference/modules.md.
 */
export default function ModuleGate({ module, children, fallback = null }: ModuleGateProps) {
  const { profile, loading } = useAuth();

  if (loading) return null;

  const isActive = profile?.organization.activeModules?.includes(module) ?? false;
  if (!isActive) return <>{fallback}</>;

  return <>{children}</>;
}

/** Standard "module not active" placeholder for a gated page body. */
export function ModuleInactiveNotice({ module }: { module: ModuleKey }) {
  return (
    <div className="empty-state">
      <p>
        <strong>{MODULE_LABELS[module]}</strong> is not active for your organization.
      </p>
      <p>Ask an org owner or manager to enable it under Settings → Organization.</p>
    </div>
  );
}
