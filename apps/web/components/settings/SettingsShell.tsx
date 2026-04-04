'use client';

import Link from 'next/link';

const SETTINGS_NAV = [
  { href: '/settings/organization', label: 'Organization' },
  { href: '/settings/team', label: 'Team' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings', label: 'Stripe Connect' },
];

export default function SettingsShell({
  activeHref,
  children,
}: {
  activeHref: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '24px', alignItems: 'start' }}>
        <div className="card">
          <nav>
            {SETTINGS_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'block',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: item.href === activeHref ? 600 : 400,
                  color: item.href === activeHref ? 'var(--color-primary)' : 'inherit',
                  borderLeft: item.href === activeHref ? '3px solid var(--color-primary)' : '3px solid transparent',
                  textDecoration: 'none',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div>{children}</div>
      </div>
    </>
  );
}
