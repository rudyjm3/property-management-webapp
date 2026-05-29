export default function LeaseSignedPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: '480px', width: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '32px', textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: '#111827' }}>Lease signed!</h1>
        <p style={{ margin: 0, fontSize: '15px', lineHeight: '1.6', color: '#6b7280' }}>
          Your signature has been recorded. The property manager will countersign the lease and you&apos;ll receive an email confirmation once it&apos;s fully executed.
        </p>
      </div>
    </div>
  );
}
