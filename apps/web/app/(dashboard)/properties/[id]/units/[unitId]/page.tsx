'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import DocumentPanel from '@/components/DocumentPanel';
import { useAuth } from '@/contexts/AuthContext';

const UNIT_STATUS_LABELS: Record<string, string> = {
  occupied: 'Occupied',
  vacant: 'Vacant',
  notice: 'Notice',
  maintenance: 'Maintenance',
};

const LEASE_STATUS_BADGE: Record<string, string> = {
  active: 'badge-occupied',
  month_to_month: 'badge-occupied',
  notice_given: 'badge-notice',
  expired: 'badge-muted',
  terminated: 'badge-muted',
  draft: 'badge-neutral',
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  studio: 'Studio',
  one_bed: '1 Bed',
  two_bed: '2 Bed',
  three_bed: '3 Bed',
  four_plus_bed: '4+ Bed',
  commercial: 'Commercial',
};

interface UnitDetail {
  id: string;
  unitNumber: string;
  floor: number | null;
  type: string | null;
  bedrooms: number;
  bathrooms: number;
  sqFt: number | null;
  marketRent: string | null;
  availableDate: string | null;
  rentAmount: string;
  depositAmount: string;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  property: { id: string; name: string; address: string; city: string; state: string; zip: string };
  leases: Array<{
    id: string;
    startDate: string;
    endDate: string;
    rentAmount: string;
    status: string;
    participants: Array<{
      isPrimary: boolean;
      tenant: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
      };
    }>;
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

const WO_CATEGORIES = ['plumbing','electrical','hvac','appliance','pest','structural','cosmetic','grounds','general','other'];
const WO_PRIORITIES = ['routine','urgent','emergency'];

export default function UnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;
  const unitId = params.unitId as string;
  const { profile } = useAuth();
  const isMaintenance = profile?.role === 'maintenance';
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditUnit, setShowEditUnit] = useState(false);

  // Work order modal
  const [showWOModal, setShowWOModal] = useState(false);
  const [woDescription, setWoDescription] = useState('');
  const [woCategory, setWoCategory] = useState('general');
  const [woPriority, setWoPriority] = useState('routine');
  const [woSubmitting, setWoSubmitting] = useState(false);

  const loadUnit = useCallback(async () => {
    try {
      const data = await api.units.get(propertyId, unitId);
      setUnit(data);
    } catch (err) {
      console.error('Failed to load unit:', err);
    } finally {
      setLoading(false);
    }
  }, [propertyId, unitId]);

  useEffect(() => {
    loadUnit();
  }, [loadUnit]);

  async function handleCreateWorkOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!unit) return;
    setWoSubmitting(true);
    try {
      const wo = await api.workOrders.create({
        propertyId,
        unitId,
        description: woDescription,
        category: woCategory,
        priority: woPriority,
        tenantId: unit.leases.find((l) => l.status === 'active')?.participants.find((p) => p.isPrimary)?.tenant.id ?? null,
      });
      router.push(`/work-orders/${wo.id}`);
    } catch (err) {
      console.error('Failed to create work order:', err);
    } finally {
      setWoSubmitting(false);
    }
  }

  async function handleEditUnit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await api.units.update(propertyId, unitId, {
        unitNumber: formData.get('unitNumber'),
        floor: formData.get('floor') ? Number(formData.get('floor')) : null,
        type: (formData.get('type') as string) || null,
        bedrooms: Number(formData.get('bedrooms')),
        bathrooms: Number(formData.get('bathrooms')),
        sqFt: formData.get('sqFt') ? Number(formData.get('sqFt')) : null,
        marketRent: formData.get('marketRent') ? Number(formData.get('marketRent')) : null,
        rentAmount: Number(formData.get('rentAmount')),
        depositAmount: Number(formData.get('depositAmount') || 0),
        status: formData.get('status'),
        address: (formData.get('unitAddress') as string) || null,
        city: (formData.get('unitCity') as string) || null,
        state: ((formData.get('unitState') as string) || '').toUpperCase() || null,
        zip: (formData.get('unitZip') as string) || null,
        notes: (formData.get('notes') as string) || null,
      });
      setShowEditUnit(false);
      await loadUnit();
    } catch (err) {
      console.error('Failed to update unit:', err);
    }
  }

  if (loading) return <div className="loading">Loading unit...</div>;
  if (!unit) return <div className="loading">Unit not found</div>;

  const activeLease = unit.leases.find((l) => ['active', 'month_to_month', 'notice_given'].includes(l.status));
  const primaryTenant = activeLease?.participants.find((p) => p.isPrimary)?.tenant;
  const hasUnitAddress = !!(unit.address || unit.city || unit.state || unit.zip);
  const resolvedAddress = `${unit.address ?? unit.property.address}, ${unit.city ?? unit.property.city}, ${unit.state ?? unit.property.state} ${unit.zip ?? unit.property.zip}`;

  return (
    <>
      {/* Work Order Modal */}
      {showWOModal && (
        <div className="modal-overlay" onClick={() => setShowWOModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create Work Order — Unit {unit.unitNumber}</h2>
              <button className="modal-close" onClick={() => setShowWOModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateWorkOrder}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Category</label>
                    <select value={woCategory} onChange={(e) => setWoCategory(e.target.value)}>
                      {WO_CATEGORIES.map((c) => (
                        <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select value={woPriority} onChange={(e) => setWoPriority(e.target.value)}>
                      {WO_PRIORITIES.map((p) => (
                        <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Description *</label>
                  <textarea
                    value={woDescription}
                    onChange={(e) => setWoDescription(e.target.value)}
                    placeholder="Describe the issue in detail…"
                    rows={4}
                    required
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowWOModal(false)} disabled={woSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={woSubmitting || !woDescription.trim()}>
                  {woSubmitting ? 'Creating…' : 'Create work order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="breadcrumb">
        <Link href="/properties">Properties</Link>
        <span>/</span>
        <Link href={`/properties/${propertyId}`}>{unit.property.name}</Link>
        <span>/</span>
        <span>Unit {unit.unitNumber}</span>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">Unit {unit.unitNumber}</h1>
          <p className="page-subtitle">{resolvedAddress}</p>
          {hasUnitAddress && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Property: {unit.property.address}, {unit.property.city}, {unit.property.state} {unit.property.zip}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isMaintenance && (
            <button className="btn btn-secondary" onClick={() => setShowEditUnit(true)}>
              Edit Unit
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setShowWOModal(true)}>
            + Add Work Order
          </button>
          {!isMaintenance && primaryTenant && (
            <Link
              href={`/messages?tenantId=${primaryTenant.id}`}
              className="btn btn-secondary"
            >
              Message Tenant
            </Link>
          )}
          {!isMaintenance && activeLease && (
            <Link href={`/leases/${activeLease.id}`} className="btn btn-secondary">
              View Lease
            </Link>
          )}
          <span className={`badge badge-${unit.status}`} style={{ fontSize: '14px', padding: '4px 12px' }}>
            {UNIT_STATUS_LABELS[unit.status] ?? unit.status}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Unit Info */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>Unit Details</h3>
            <div className="detail-grid">
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                <label>Address</label>
                <span>
                  {resolvedAddress}
                  {hasUnitAddress && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      (unit-specific)
                    </span>
                  )}
                </span>
              </div>
              {unit.type && (
                <div className="detail-item">
                  <label>Unit Type</label>
                  <span>{UNIT_TYPE_LABELS[unit.type] ?? unit.type}</span>
                </div>
              )}
              <div className="detail-item">
                <label>Bedrooms</label>
                <span>{unit.bedrooms}</span>
              </div>
              <div className="detail-item">
                <label>Bathrooms</label>
                <span>{unit.bathrooms}</span>
              </div>
              <div className="detail-item">
                <label>Square Feet</label>
                <span>{unit.sqFt ? `${unit.sqFt} sqft` : '--'}</span>
              </div>
              <div className="detail-item">
                <label>Floor</label>
                <span>{unit.floor || '--'}</span>
              </div>
              {!isMaintenance && (
                <>
                  <div className="detail-item">
                    <label>Market Rent</label>
                    <span>{unit.marketRent ? `$${Number(unit.marketRent).toLocaleString()}` : '--'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Monthly Rent</label>
                    <span>${Number(unit.rentAmount).toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <label>Security Deposit</label>
                    <span>${Number(unit.depositAmount).toLocaleString()}</span>
                  </div>
                </>
              )}
              {unit.availableDate && (
                <div className="detail-item">
                  <label>Available Date</label>
                  <span>{new Date(unit.availableDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            {unit.notes && (
              <div style={{ marginTop: '16px' }}>
                <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Notes
                </label>
                <p style={{ fontSize: '14px', marginTop: '4px' }}>{unit.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Current Tenant */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>Current Tenant</h3>
            {primaryTenant ? (
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Name</label>
                  <span>{primaryTenant.name}</span>
                </div>
                <div className="detail-item">
                  <label>Email</label>
                  <span>{primaryTenant.email}</span>
                </div>
                <div className="detail-item">
                  <label>Phone</label>
                  <span>{formatPhone(primaryTenant.phone)}</span>
                </div>
                {!isMaintenance && (
                  <>
                    <div className="detail-item">
                      <label>Lease Status</label>
                      <span className={`badge ${LEASE_STATUS_BADGE[activeLease?.status ?? ''] ?? 'badge-vacant'}`}>
                        {activeLease?.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="detail-item">
                      <label>Lease Start</label>
                      <span>{activeLease ? new Date(activeLease.startDate).toLocaleDateString() : '--'}</span>
                    </div>
                    <div className="detail-item">
                      <label>Lease End</label>
                      <span>{activeLease ? new Date(activeLease.endDate).toLocaleDateString() : '--'}</span>
                    </div>
                    <div className="detail-item">
                      <label>Monthly Rent</label>
                      <span>${activeLease ? Number(activeLease.rentAmount).toLocaleString() : '--'}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '24px' }}>
                <p>No active tenant</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showEditUnit && (
        <div className="modal-overlay" onClick={() => setShowEditUnit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Unit</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowEditUnit(false)}>
                X
              </button>
            </div>
            <form onSubmit={handleEditUnit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Unit Number</label>
                    <input name="unitNumber" required defaultValue={unit.unitNumber} />
                  </div>
                  <div className="form-group">
                    <label>Floor</label>
                    <input name="floor" type="number" defaultValue={unit.floor ?? ''} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Unit Type</label>
                    <select name="type" defaultValue={unit.type ?? ''}>
                      <option value="">-- Select --</option>
                      <option value="studio">Studio</option>
                      <option value="one_bed">1 Bed</option>
                      <option value="two_bed">2 Bed</option>
                      <option value="three_bed">3 Bed</option>
                      <option value="four_plus_bed">4+ Bed</option>
                      <option value="commercial">Commercial</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select name="status" defaultValue={unit.status}>
                      <option value="vacant">vacant</option>
                      <option value="occupied">occupied</option>
                      <option value="notice">notice</option>
                      <option value="maintenance">maintenance</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Bedrooms</label>
                    <input name="bedrooms" type="number" required min="0" defaultValue={unit.bedrooms} />
                  </div>
                  <div className="form-group">
                    <label>Bathrooms</label>
                    <input name="bathrooms" type="number" required min="0" step="0.5" defaultValue={unit.bathrooms} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Sq Ft</label>
                    <input name="sqFt" type="number" defaultValue={unit.sqFt ?? ''} />
                  </div>
                  <div className="form-group">
                    <label>Market Rent ($)</label>
                    <input name="marketRent" type="number" min="0" step="0.01" defaultValue={unit.marketRent ?? ''} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Monthly Rent ($)</label>
                    <input name="rentAmount" type="number" required min="0" step="0.01" defaultValue={unit.rentAmount} />
                  </div>
                  <div className="form-group">
                    <label>Security Deposit ($)</label>
                    <input name="depositAmount" type="number" min="0" step="0.01" defaultValue={unit.depositAmount} />
                  </div>
                </div>
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Address Override <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>(leave blank to use property address)</span>
                  </p>
                  <div className="form-group">
                    <label>Street Address</label>
                    <input name="unitAddress" defaultValue={unit.address ?? ''} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>City</label>
                      <input name="unitCity" defaultValue={unit.city ?? ''} />
                    </div>
                    <div className="form-group">
                      <label>State</label>
                      <input name="unitState" maxLength={2} defaultValue={unit.state ?? ''} style={{ textTransform: 'uppercase' }} />
                    </div>
                    <div className="form-group">
                      <label>ZIP</label>
                      <input name="unitZip" defaultValue={unit.zip ?? ''} />
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea name="notes" rows={3} defaultValue={unit.notes ?? ''} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditUnit(false)}>
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

      {/* Work Orders */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
              Recent Work Orders ({unit.workOrders.length})
            </h3>
          </div>
          {unit.workOrders.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px' }}>
              <p>No work orders for this unit</p>
            </div>
          ) : (
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
                  {unit.workOrders.map((wo) => (
                    <tr key={wo.id}>
                      <td>{new Date(wo.createdAt).toLocaleDateString()}</td>
                      <td style={{ textTransform: 'capitalize' }}>{wo.category}</td>
                      <td>
                        <span className={`badge badge-${wo.priority === 'emergency' ? 'danger' : wo.priority === 'urgent' ? 'notice' : 'occupied'}`}>
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
          )}
        </div>
      </div>

      {/* Lease History */}
      {!isMaintenance && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
              Lease History ({unit.leases.length})
            </h3>
            {unit.leases.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <p>No lease history for this unit</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Rent</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unit.leases.map((lease) => {
                      const tenant = lease.participants.find((p) => p.isPrimary)?.tenant;
                      return (
                        <tr key={lease.id}>
                          <td>{tenant?.name || '--'}</td>
                          <td>{new Date(lease.startDate).toLocaleDateString()}</td>
                          <td>{new Date(lease.endDate).toLocaleDateString()}</td>
                          <td>${Number(lease.rentAmount).toLocaleString()}</td>
                          <td>
                            <span className={`badge ${LEASE_STATUS_BADGE[lease.status] ?? 'badge-muted'}`}>
                              {lease.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {!isMaintenance && <DocumentPanel entityType="unit" entityId={unitId} />}
    </>
  );
}
