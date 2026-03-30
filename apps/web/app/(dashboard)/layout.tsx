'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/contexts/AuthContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, needsOnboarding } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [loading, needsOnboarding, router]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: '14px', color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    );
  }

  if (needsOnboarding) return null;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}
