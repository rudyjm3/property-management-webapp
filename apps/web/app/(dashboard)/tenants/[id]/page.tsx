'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import PhoneInput from '@/components/PhoneInput';
import DocumentPanel from '@/components/DocumentPanel';

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

interface TenantDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  fullLegalName: string | null;
  dateOfBirth: string | null;
  currentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContact1Relationship: string | null;
  portalStatus: string;
  createdAt: string;
  leaseParticipants: Array<{
    isPrimary: boolean;
    lease: {
      id: string;
      startDate: string;
      endDate: string;
      rentAmount: string;
      status: string;
      unit: {
        id: string;
        unitNumber: string;
        propertyId: string;
        property: { id: string; name: string; address: string };
      };
    };
  }>;
  payments: Array<{
    id: string;
    amount: string;
    type: string;
    status: string;
    dueDate: string;
    paidDate: string | null;
    createdAt: string;
  }>;
  workOrders: Array<{
    id: string;
    category: string;
    priority: string;
    status: string;
    description: string;
    createdAt: string;
  }>;
}

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.tenants.get(tenantId);
        setTenant(data);
      } catch (err) {
        console.error('Failed to load tenant:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantId]);

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    try {
      const updated = await api.tenants.update(tenantId, {
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
      setTenant((prev) => (prev ? { ...prev, ...updated } : prev));
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update tenant');
    }
  }

  async function handleInvitePortal() {
    if (!confirm(`Send a portal invite email to ${tenant!.email}?`)) return;
    setInviting(true);
    try {
      await api.tenants.invitePortal(tenantId);
      setTenant((prev) => prev ? { ...prev, portalStatus: 'invited' } : prev);
      alert('Invite sent! The tenant will receive an email to set their password.');
    } catch (err: any) {
      alert(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to remove this tenant? This cannot be undone.')) return;
    try {
      await api.tenants.delete(tenantId);
      router.push('/tenants');
    } catch (err: any) {
      alert(err.message || 'Failed to delete tenant');
    }
  }

  if (loading) return <div className="loading">Loading tenant...</div>;
  if (!tenant) return <div className="loading">Tenant not found</div>;

  const CURRENT_LEASE_STATUSES = ['active', 'month_to_month', 'notice_given'];
  const currentLeases = tenant.leaseParticipants.filter((lp) =>
    CURRENT_LEASE_STATUSES.includes(lp.lease.status)
  );
  const activeLease = currentLeases[0] ?? null;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/tenants">Tenants</Link>
        <span>/</span>
        <span>{tenant.name}</span>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">{tenant.name}</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Tenant since {new Date(tenant.createdAt).toLocaleDateString()}
            <span className={`badge badge-${PORTAL_STATUS_BADGE[tenant.portalStatus] ?? 'vacant'}`}>
              {PORTAL_STATUS_LABELS[tenant.portalStatus] ?? tenant.portalStatus}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tenant.portalStatus === 'never_logged_in' && (
            <button className="btn btn-primary" onClick={handleInvitePortal} disabled={inviting}>
              {inviting ? 'Sending…' : 'Invite to Portal'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Contact Info */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>Contact Information</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Email</label>
                <span>{tenant.email}</span>
              </div>
              <div className="detail-item">
                <label>Phone</label>
                <span>{formatPhone(tenant.phone)}</span>
              </div>
              {tenant.fullLegalName && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Full Legal Name</label>
                  <span>{tenant.fullLegalName}</span>
                </div>
              )}
              {tenant.dateOfBirth && (
                <div className="detail-item">
                  <label>Date of Birth</label>
                  <span>{new Date(tenant.dateOfBirth).toLocaleDateString()}</span>
                </div>
              )}
              {tenant.currentAddress && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Current Address</label>
                  <span>{tenant.currentAddress}</span>
                </div>
              )}
              <div className="detail-item">
                <label>Emergency Contact</label>
                <span>
                  {tenant.emergencyContactName || '--'}
                  {tenant.emergencyContact1Relationship && (
                    <span style={{ color: 'var(--color-text-muted)', marginLeft: '6px', fontSize: '13px' }}>
                      ({tenant.emergencyContact1Relationship})
                    </span>
                  )}
                </span>
              </div>
              <div className="detail-item">
                <label>Emergency Phone</label>
                <span>{formatPhone(tenant.emergencyContactPhone)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Current Lease */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>Current Lease</h3>
            {currentLeases.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <p>No active lease</p>
              </div>
            ) : (
              <>
                {currentLeases.length > 1 && (
                  <div style={{ marginBottom: '12px', fontSize: '13px', color: '#ca8a04', fontWeight: 500 }}>
                    This tenant is on {currentLeases.length} active leases.
                  </div>
                )}
                {currentLeases.map((lp, i) => (
                  <div
                    key={lp.lease.id}
                    style={i > 0 ? { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' } : {}}
                  >
                    <div className="detail-grid">
                      <div className="detail-item">
                        <label>Property</label>
                        <Link
                          href={`/properties/${lp.lease.unit.property.id}`}
                          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                        >
                          {lp.lease.unit.property.name}
                        </Link>
                      </div>
                      <div className="detail-item">
                        <label>Unit</label>
                        <Link
                          href={`/properties/${lp.lease.unit.property.id}/units/${lp.lease.unit.id}`}
                          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                        >
                          Unit {lp.lease.unit.unitNumber}
                        </Link>
                      </div>
                      <div className="detail-item">
                        <label>Lease Start</label>
                        <span>{new Date(lp.lease.startDate).toLocaleDateString()}</span>
                      </div>
                      <div className="detail-item">
                        <label>Lease End</label>
                        <span>{new Date(lp.lease.endDate).toLocaleDateString()}</span>
                      </div>
                      <div className="detail-item">
                        <label>Monthly Rent</label>
                        <span>${Number(lp.lease.rentAmount).toLocaleString()}</span>
                      </div>
                      <div className="detail-item">
                        <label>Status</label>
                        <span className="badge badge-occupied">{lp.lease.status.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lease History */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-body">
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
            Lease History ({tenant.leaseParticipants.length})
          </h3>
          {tenant.leaseParticipants.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px' }}>
              <p>No lease history</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Unit</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Rent</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.leaseParticipants.map((lp) => (
                    <tr key={lp.lease.id}>
                      <td>{lp.lease.unit.property.name}</td>
                      <td>Unit {lp.lease.unit.unitNumber}</td>
                      <td>{new Date(lp.lease.startDate).toLocaleDateString()}</td>
                      <td>{new Date(lp.lease.endDate).toLocaleDateString()}</td>
                      <td>${Number(lp.lease.rentAmount).toLocaleString()}</td>
                      <td>
                        <span className={`badge badge-${lp.lease.status === 'active' ? 'occupied' : lp.lease.status === 'expired' ? 'notice' : 'vacant'}`}>
                          {lp.lease.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Work Orders */}
      {tenant.workOrders.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
              Recent Work Orders ({tenant.workOrders.length})
            </h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.workOrders.map((wo) => (
                    <tr key={wo.id}>
                      <td>{new Date(wo.createdAt).toLocaleDateString()}</td>
                      <td style={{ textTransform: 'capitalize' }}>{wo.category}</td>
                      <td>
                        <span className={`badge badge-${wo.priority === 'urgent' || wo.priority === 'emergency' ? 'notice' : 'occupied'}`}>
                          {wo.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${wo.status === 'completed' ? 'occupied' : wo.status === 'new_order' ? 'vacant' : 'maintenance'}`}>
                          {wo.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {wo.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Tenant</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setEditing(false)}>
                X
              </button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                {error && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>
                    {error}
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input name="name" required defaultValue={tenant.name} />
                  </div>
                  <div className="form-group">
                    <label>Full Legal Name</label>
                    <input name="fullLegalName" defaultValue={tenant.fullLegalName || ''} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input name="email" type="email" required defaultValue={tenant.email} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Phone</label>
                    <PhoneInput name="phone" defaultValue={tenant.phone} />
                  </div>
                  <div className="form-group">
                    <label>Date of Birth</label>
                    <input name="dateOfBirth" type="date" defaultValue={tenant.dateOfBirth ? tenant.dateOfBirth.slice(0, 10) : ''} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Current Address</label>
                  <input name="currentAddress" defaultValue={tenant.currentAddress || ''} placeholder="123 Main St, City, ST 00000" />
                </div>
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Emergency Contact 1
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Name</label>
                      <input name="emergencyContactName" defaultValue={tenant.emergencyContactName || ''} />
                    </div>
                    <div className="form-group">
                      <label>Phone</label>
                      <PhoneInput name="emergencyContactPhone" defaultValue={tenant.emergencyContactPhone} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Relationship</label>
                    <input name="emergencyContact1Relationship" defaultValue={tenant.emergencyContact1Relationship || ''} placeholder="e.g. Spouse, Parent, Sibling" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DocumentPanel entityType="tenant" entityId={tenantId} />
    </>
  );
}
