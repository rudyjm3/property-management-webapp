'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function ConnectRefreshPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    api.connect.createAccountLink()
      .then((data) => { window.location.href = data.url; })
      .catch(() => setError('Unable to resume bank account setup. Please return to Settings and try again.'));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 60 }}>
        <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>
        <a href="/settings" style={{ color: 'var(--color-primary)' }}>Back to Settings</a>
      </div>
    );
  }

  return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ color: 'var(--color-text-muted)' }}>Resuming bank account setup…</p>
    </div>
  );
}
