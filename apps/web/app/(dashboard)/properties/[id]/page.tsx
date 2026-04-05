'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import DocumentPanel from '@/components/DocumentPanel';
import { useAuth } from '@/contexts/AuthContext';

const UNIT_TYPE_LABELS: Record<string, string> = {
  studio: 'Studio',
  one_bed: '1 Bed',
  two_bed: '2 Bed',
  three_bed: '3 Bed',
  four_plus_bed: '4+ Bed',
  commercial: 'Commercial',
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  multifamily: 'Multifamily',
  single_family: 'Single Family',
  commercial: 'Commercial',
  mixed_use: 'Mixed Use',
};

interface Unit {
  id: string;
  unitNumber: string;
  floor: number | null;
  type: string | null;
  bedrooms: number;
  bathrooms: number;
  sqFt: number | null;
  marketRent: string | null;
  rentAmount: string;
  status: string;
  leases: Array<{
    participants: Array<{
      isPrimary: boolean;
      tenant: { id: string; name: string; email: string };
    }>;
  }>;
  _count: { workOrders: number };
}

interface PropertyDetail {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  yearBuilt: number | null;
  unitCount: number;
  units: Unit[];
}

export default function PropertyDetailPage() {
  const params = useParams();
  const propertyId = params.id as string;
  const { profile } = useAuth();
  const isMaintenance = profile?.role === 'maintenance';
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [showEditProperty, setShowEditProperty] = useState(false);

  useEffect(() => {
    loadProperty();
  }, [propertyId]);

  async function loadProperty() {
    try {
      const data = await api.properties.get(propertyId);
      setProperty(data);
    } catch (err) {
      console.error('Failed to load property:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddUnit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await api.units.create(propertyId, {
        unitNumber: formData.get('unitNumber'),
        floor: formData.get('floor') ? Number(formData.get('floor')) : null,
        type: (formData.get('type') as string) || null,
        bedrooms: Number(formData.get('bedrooms')),
        bathrooms: Number(formData.get('bathrooms')),
        sqFt: formData.get('sqFt') ? Number(formData.get('sqFt')) : null,
        marketRent: formData.get('marketRent') ? Number(formData.get('marketRent')) : null,
        rentAmount: Number(formData.get('rentAmount')),
        depositAmount: Number(formData.get('depositAmount') || 0),
        address: (formData.get('unitAddress') as string) || null,
        city: (formData.get('unitCity') as string) || null,
        state: (formData.get('unitState') as string) || null,
        zip: (formData.get('unitZip') as string) || null,
      });
      setShowAddUnit(false);
      loadProperty();
    } catch (err) {
      console.error('Failed to create unit:', err);
    }
  }

  async function handleEditProperty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await api.properties.update(propertyId, {
        name: formData.get('name'),
        address: formData.get('address'),
        city: formData.get('city'),
        state: (formData.get('state') as string)?.toUpperCase(),
        zip: formData.get('zip'),
        type: formData.get('type'),
      });
      setShowEditProperty(false);
      loadProperty();
    } catch (err) {
      console.error('Failed to update property:', err);
    }
  }

  if (loading) return <div className="loading">Loading property...</div>;
  if (!property) return <div className="loading">Property not found</div>;

  const occupiedCount = property.units.filter((u) => u.status === 'occupied').length;
  const vacantCount = property.units.filter((u) => u.status === 'vacant').length;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/properties">Properties</Link>
        <span>/</span>
        <span>{property.name}</span>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">{property.name}</h1>
          <p className="page-subtitle">
            {property.address}, {property.city}, {property.state} {property.zip}
          </p>
        </div>
        {!isMaintenance && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setShowEditProperty(true)}>
              Edit Property
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddUnit(true)}>
              + Add Unit
            </button>
          </div>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Units</div>
          <div className="stat-value">{property.units.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Occupied</div>
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            {occupiedCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vacant</div>
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>
            {vacantCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Occupancy</div>
          <div className="stat-value">
            {property.units.length > 0
              ? Math.round((occupiedCount / property.units.length) * 100)
              : 0}
            %
          </div>
        </div>
      </div>

      {property.units.length === 0 ? (
        <div className="empty-state">
          <h3>No units yet</h3>
          <p>Add units to this property to start managing them.</p>
        </div>
      ) : (
        <div className="units-grid">
          {property.units.map((unit) => {
            const participants = unit.leases?.[0]?.participants;
            const tenant = (participants?.find((p) => p.isPrimary) ?? participants?.[0])?.tenant;
            return (
              <Link
                key={unit.id}
                href={`/properties/${propertyId}/units/${unit.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="unit-card">
                  <div className="unit-header">
                    <span className="unit-number">Unit {unit.unitNumber}</span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {unit.type && (
                        <span className="badge badge-neutral">{UNIT_TYPE_LABELS[unit.type] ?? unit.type}</span>
                      )}
                      <span className={`badge badge-${unit.status}`}>{unit.status}</span>
                    </div>
                  </div>
                  {tenant && <div className="unit-tenant">{tenant.name}</div>}
                  {!tenant && unit.status === 'vacant' && (
                    <div className="unit-tenant">No tenant</div>
                  )}
                  {!isMaintenance && (
                    <div className="unit-rent">
                      ${Number(unit.rentAmount).toLocaleString()}/mo
                    </div>
                  )}
                  <div className="property-meta" style={{ marginTop: '8px' }}>
                    <span>{unit.bedrooms}bd / {unit.bathrooms}ba</span>
                    {unit.sqFt && <span>{unit.sqFt} sqft</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!isMaintenance && <DocumentPanel entityType="property" entityId={propertyId} />}

      {showAddUnit && (
        <div className="modal-overlay" onClick={() => setShowAddUnit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Unit</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowAddUnit(false)}>
                X
              </button>
            </div>
            <form onSubmit={handleAddUnit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Unit Number</label>
                    <input name="unitNumber" required placeholder="e.g. 101" />
                  </div>
                  <div className="form-group">
                    <label>Floor</label>
                    <input name="floor" type="number" placeholder="1" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Unit Type</label>
                    <select name="type" defaultValue="">
                      <option value="">— Select —</option>
                      <option value="studio">Studio</option>
                      <option value="one_bed">1 Bed</option>
                      <option value="two_bed">2 Bed</option>
                      <option value="three_bed">3 Bed</option>
                      <option value="four_plus_bed">4+ Bed</option>
                      <option value="commercial">Commercial</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Bedrooms</label>
                    <input name="bedrooms" type="number" required defaultValue="1" min="0" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Bathrooms</label>
                    <input name="bathrooms" type="number" required defaultValue="1" min="0" step="0.5" />
                  </div>
                  <div className="form-group">
                    <label>Sq Ft</label>
                    <input name="sqFt" type="number" placeholder="750" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Market Rent ($)</label>
                    <input name="marketRent" type="number" placeholder="1200" min="0" step="0.01" />
                  </div>
                  <div className="form-group">
                    <label>Monthly Rent ($)</label>
                    <input name="rentAmount" type="number" required placeholder="1200" min="0" step="0.01" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Security Deposit ($)</label>
                  <input name="depositAmount" type="number" placeholder="1200" min="0" step="0.01" />
                </div>
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Address Override <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>(leave blank to use property address)</span>
                  </p>
                  <div className="form-group">
                    <label>Street Address</label>
                    <input name="unitAddress" placeholder="e.g. 456 Oak Ave" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>City</label>
                      <input name="unitCity" placeholder="e.g. Springfield" />
                    </div>
                    <div className="form-group">
                      <label>State</label>
                      <input name="unitState" placeholder="e.g. IL" maxLength={2} style={{ textTransform: 'uppercase' }} />
                    </div>
                    <div className="form-group">
                      <label>ZIP</label>
                      <input name="unitZip" placeholder="e.g. 62701" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddUnit(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditProperty && (
        <div className="modal-overlay" onClick={() => setShowEditProperty(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Property</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowEditProperty(false)}>
                X
              </button>
            </div>
            <form onSubmit={handleEditProperty}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Property Name</label>
                  <input name="name" required defaultValue={property.name} />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input name="address" required defaultValue={property.address} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>City</label>
                    <input name="city" required defaultValue={property.city} />
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input name="state" required maxLength={2} defaultValue={property.state} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Zip Code</label>
                    <input name="zip" required defaultValue={property.zip} />
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <select name="type" defaultValue={property.type}>
                      <option value="multifamily">Multifamily</option>
                      <option value="single_family">Single Family</option>
                      <option value="commercial">Commercial</option>
                      <option value="mixed_use">Mixed Use</option>
                    </select>
                  </div>
                </div>
                <div className="property-meta" style={{ marginTop: '8px' }}>
                  <span>Current type: {PROPERTY_TYPE_LABELS[property.type] ?? property.type}</span>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditProperty(false)}>
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
    </>
  );
}
