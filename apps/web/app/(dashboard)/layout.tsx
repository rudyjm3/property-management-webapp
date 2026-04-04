'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/contexts/AuthContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, needsOnboarding, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [loading, needsOnboarding, router]);

  useEffect(() => {
    if (loading || !profile) return;
    if (pathname.startsWith('/settings') && !['owner', 'manager'].includes(profile.role)) {
      router.replace('/dashboard');
    }
  }, [loading, pathname, profile, router]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: '14px', color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    );
  }

  if (needsOnboarding) return null;

  if (pathname.startsWith('/settings') && profile && !['owner', 'manager'].includes(profile.role)) {
    return null;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}
