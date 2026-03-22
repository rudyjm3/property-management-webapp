'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string | null;
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
        emergencyContactName: formData.get('emergencyContactName') || null,
        emergencyContactPhone: formData.get('emergencyContactPhone') || null,
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
                    <td>{tenant.phone || '--'}</td>
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
                <div className="form-group">
                  <label>Full Name</label>
                  <input name="name" required placeholder="e.g. John Smith" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input name="email" type="email" required placeholder="john@example.com" />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input name="phone" placeholder="(555) 123-4567" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Emergency Contact Name</label>
                    <input name="emergencyContactName" placeholder="Jane Smith" />
                  </div>
                  <div className="form-group">
                    <label>Emergency Contact Phone</label>
                    <input name="emergencyContactPhone" placeholder="(555) 987-6543" />
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
