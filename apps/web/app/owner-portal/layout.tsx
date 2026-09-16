'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

const PUBLIC_PATHS = ['/owner-portal/login', '/owner-portal/set-password'];

const NAV_ITEMS = [
  { href: '/owner-portal', label: 'Dashboard' },
  { href: '/owner-portal/properties', label: 'Properties' },
  { href: '/owner-portal/statements', label: 'Statements' },
  { href: '/owner-portal/reports', label: 'Reports' },
];

export default function OwnerPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (isPublic) {
      setChecked(true);
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/owner-portal/login');
      } else {
        setChecked(true);
      }
    });
  }, [isPublic, pathname, router]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/owner-portal/login');
  }

  if (isPublic) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg, #f8fafc)',
          padding: '24px',
        }}
      >
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary, #6366f1)' }}>
              PropFlow
            </h1>
            <p style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>Owner Portal</p>
          </div>
          {children}
        </div>
      </div>
    );
  }

  if (!checked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: '14px', color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: '220px',
          flexShrink: 0,
          borderRight: '1px solid var(--color-border)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary, #6366f1)', marginBottom: '4px' }}>
          PropFlow
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>Owner Portal</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--color-primary, #6366f1)' : 'var(--color-text)',
                  background: active ? 'var(--color-surface, #f1f5f9)' : 'transparent',
                  textDecoration: 'none',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button className="btn btn-secondary btn-sm" onClick={handleSignOut}>
          Sign out
        </button>
      </aside>
      <main style={{ flex: 1, padding: '32px' }}>{children}</main>
    </div>
  );
}
