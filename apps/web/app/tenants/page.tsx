'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import PhoneInput from '@/components/PhoneInput';

const PORTAL_STATUS_LABELS: Record<string, string> = {
  active: 'Portal Active',
  invited: 'Invited',
  never_logged_in: 'Not Invited',
};

const PORTAL_STATUS_BADGE: Record<string, string> = {
  active: 'occupied',
  invited: 'notice',
  never_logged_in: 'vacant',
};

interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  portalStatus: string;
  createdAt: string;
  leaseParticipants: Array<{
    lease: {
      status: string;
      unit: {
        id: string;
        unitNumber: string;
        property: { id: string; name: string };
      };
    };
  }>;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    try {
      const data = await api.tenants.list();
      setTenants(data);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    try {
      await api.tenants.create({
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone') || null,
        fullLegalName: (formData.get('fullLegalName') as string) || null,
        dateOfBirth: (formData.get('dateOfBirth') as string) || null,
        currentAddress: (formData.get('currentAddress') as string) || null,
        emergencyContactName: formData.get('emergencyContactName') || null,
        emergencyContactPhone: formData.get('emergencyContactPhone') || null,
        emergencyContact1Relationship: (formData.get('emergencyContact1Relationship') as string) || null,
      });
      setShowForm(false);
      loadTenants();
    } catch (err: any) {
      setError(err.message || 'Failed to create tenant');
    }
  }

  if (loading) return <div className="loading">Loading tenants...</div>;

  const activeTenants = tenants.filter((t) => t.leaseParticipants.length > 0);
  const inactiveTenants = tenants.filter((t) => t.leaseParticipants.length === 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tenants</h1>
          <p className="page-subtitle">
            {tenants.length} tenants &middot; {activeTenants.length} with active leases
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Tenant
        </button>
      </div>

      {tenants.length === 0 ? (
        <div className="empty-state">
          <h3>No tenants yet</h3>
          <p>Add your first tenant to get started.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Unit</th>
                <th>Property</th>
                <th>Portal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const activeLease = tenant.leaseParticipants[0];
                return (
                  <tr key={tenant.id}>
                    <td>
                      <Link
                        href={`/tenants/${tenant.id}`}
                        style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {tenant.name}
                      </Link>
                    </td>
                    <td>{tenant.email}</td>
                    <td>{formatPhone(tenant.phone)}</td>
                    <td>
                      {activeLease ? (
                        <Link
                          href={`/properties/${activeLease.lease.unit.property.id}/units/${activeLease.lease.unit.id}`}
                          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                        >
                          Unit {activeLease.lease.unit.unitNumber}
                        </Link>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td>{activeLease?.lease.unit.property.name || '--'}</td>
                    <td>
                      <span className={`badge badge-${PORTAL_STATUS_BADGE[tenant.portalStatus] ?? 'vacant'}`}>
                        {PORTAL_STATUS_LABELS[tenant.portalStatus] ?? tenant.portalStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${activeLease ? 'occupied' : 'vacant'}`}>
                        {activeLease ? 'Active Lease' : 'No Lease'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Tenant</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowForm(false)}>
                X
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>
                    {error}
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input name="name" required placeholder="e.g. John Smith" />
                  </div>
                  <div className="form-group">
                    <label>Full Legal Name</label>
                    <input name="fullLegalName" placeholder="As on lease documents" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input name="email" type="email" required placeholder="john@example.com" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Phone</label>
                    <PhoneInput name="phone" />
                  </div>
                  <div className="form-group">
                    <label>Date of Birth</label>
                    <input name="dateOfBirth" type="date" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Current Address</label>
                  <input name="currentAddress" placeholder="123 Main St, City, ST 00000" />
                </div>
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Emergency Contact 1
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Name</label>
                      <input name="emergencyContactName" placeholder="Jane Smith" />
                    </div>
                    <div className="form-group">
                      <label>Phone</label>
                      <PhoneInput name="emergencyContactPhone" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Relationship</label>
                    <input name="emergencyContact1Relationship" placeholder="e.g. Spouse, Parent, Sibling" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
