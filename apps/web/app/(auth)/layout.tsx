export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg, #f8fafc)',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary, #6366f1)' }}>
            PropFlow
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Property management platform
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
