'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Unit {
  id: string;
  unitNumber: string;
  floor: number | null;
  bedrooms: number;
  bathrooms: number;
  sqFt: number | null;
  rentAmount: string;
  status: string;
  leases: Array<{
    participants: Array<{
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
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddUnit, setShowAddUnit] = useState(false);

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
        bedrooms: Number(formData.get('bedrooms')),
        bathrooms: Number(formData.get('bathrooms')),
        sqFt: formData.get('sqFt') ? Number(formData.get('sqFt')) : null,
        rentAmount: Number(formData.get('rentAmount')),
        depositAmount: Number(formData.get('depositAmount') || 0),
      });
      setShowAddUnit(false);
      loadProperty();
    } catch (err) {
      console.error('Failed to create unit:', err);
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
        <button className="btn btn-primary" onClick={() => setShowAddUnit(true)}>
          + Add Unit
        </button>
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
            const tenant = unit.leases?.[0]?.participants?.[0]?.tenant;
            return (
              <Link
                key={unit.id}
                href={`/properties/${propertyId}/units/${unit.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="unit-card">
                  <div className="unit-header">
                    <span className="unit-number">Unit {unit.unitNumber}</span>
                    <span className={`badge badge-${unit.status}`}>{unit.status}</span>
                  </div>
                  {tenant && <div className="unit-tenant">{tenant.name}</div>}
                  {!tenant && unit.status === 'vacant' && (
                    <div className="unit-tenant">No tenant</div>
                  )}
                  <div className="unit-rent">
                    ${Number(unit.rentAmount).toLocaleString()}/mo
                  </div>
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
                    <label>Bedrooms</label>
                    <input name="bedrooms" type="number" required defaultValue="1" min="0" />
                  </div>
                  <div className="form-group">
                    <label>Bathrooms</label>
                    <input name="bathrooms" type="number" required defaultValue="1" min="0" step="0.5" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Sq Ft</label>
                    <input name="sqFt" type="number" placeholder="750" />
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
    </>
  );
}
