'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function ConnectReturnPage() {
  const router = useRouter();

  useEffect(() => {
    api.connect.syncStatus()
      .then(() => router.push('/settings'))
      .catch(() => router.push('/settings'));
  }, [router]);

  return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ color: 'var(--color-text-muted)' }}>Verifying your bank account connection…</p>
    </div>
  );
}
