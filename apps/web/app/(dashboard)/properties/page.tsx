'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  multifamily: 'Multifamily',
  single_family: 'Single Family',
  commercial: 'Commercial',
  mixed_use: 'Mixed Use',
};

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  unitCount: number;
  _count: { units: number };
}

export default function PropertiesPage() {
  const { profile } = useAuth();
  const isMaintenance = profile?.role === 'maintenance';
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadProperties();
  }, []);

  async function loadProperties() {
    try {
      const data = await api.properties.list();
      setProperties(data);
    } catch (err) {
      console.error('Failed to load properties:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await api.properties.create({
        name: formData.get('name'),
        address: formData.get('address'),
        city: formData.get('city'),
        state: formData.get('state'),
        zip: formData.get('zip'),
        type: formData.get('type'),
      });
      setShowForm(false);
      loadProperties();
    } catch (err) {
      console.error('Failed to create property:', err);
    }
  }

  if (loading) return <div className="loading">Loading properties...</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Properties</h1>
          <p className="page-subtitle">{properties.length} properties in your portfolio</p>
        </div>
        {!isMaintenance && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Add Property
          </button>
        )}
      </div>

      {properties.length === 0 ? (
        <div className="empty-state">
          <h3>No properties yet</h3>
          <p>Add your first property to get started.</p>
        </div>
      ) : (
        <div className="property-grid">
          {properties.map((property) => (
            <Link
              key={property.id}
              href={`/properties/${property.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="property-card">
                <h3>{property.name}</h3>
                <div className="address">
                  {property.address}, {property.city}, {property.state} {property.zip}
                </div>
                <div className="property-meta">
                  <span>{property._count.units} units</span>
                  <span>{PROPERTY_TYPE_LABELS[property.type] ?? property.type}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Property</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowForm(false)}>
                X
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Property Name</label>
                  <input name="name" required placeholder="e.g. Sunset Gardens" />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input name="address" required placeholder="1200 Sunset Blvd" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>City</label>
                    <input name="city" required placeholder="Austin" />
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input name="state" required placeholder="TX" maxLength={2} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Zip Code</label>
                    <input name="zip" required placeholder="78701" />
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <select name="type" defaultValue="multifamily">
                      <option value="multifamily">Multifamily</option>
                      <option value="single_family">Single Family</option>
                      <option value="commercial">Commercial</option>
                      <option value="mixed_use">Mixed Use</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Property
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
