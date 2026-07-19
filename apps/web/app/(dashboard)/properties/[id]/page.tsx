'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import DocumentPanel from '@/components/DocumentPanel';
import { useAuth } from '@/contexts/AuthContext';
import BulkCreateModal from './BulkCreateModal';

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
  address: string | null;
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

interface PropertyWorkOrder {
  id: string;
  title: string | null;
  description: string;
  status: string;
  locationType: string | null;
  isCapitalProject: boolean;
  createdAt: string;
  unit: { id: string } | null;
}

const WO_STATUS_LABELS: Record<string, string> = {
  new_order: 'New',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending_parts: 'Pending Parts',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const WO_LOCATION_LABELS: Record<string, string> = {
  exterior: 'Exterior',
  parking: 'Parking lot',
  roof: 'Roof',
  landscaping: 'Landscaping',
  common_interior: 'Common interior',
  amenity: 'Amenity',
  unit_interior: 'Unit interior',
};

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;
  const { profile } = useAuth();
  const isMaintenance = profile?.role === 'maintenance';

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [showEditProperty, setShowEditProperty] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);

  // Filter state
  const [unitSearch, setUnitSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBedrooms, setFilterBedrooms] = useState('');
  const [filterBathrooms, setFilterBathrooms] = useState('');
  const [filterSqFtMin, setFilterSqFtMin] = useState('');
  const [filterSqFtMax, setFilterSqFtMax] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAddress, setFilterAddress] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(20);

  // View toggle
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [propertyWorkOrders, setPropertyWorkOrders] = useState<PropertyWorkOrder[]>([]);

  useEffect(() => {
    loadProperty();
    loadPropertyWorkOrders();
  }, [propertyId]);

  // Reset to page 1 whenever any filter or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterType, filterBedrooms, filterBathrooms,
      filterSqFtMin, filterSqFtMax, filterAddress, unitSearch, pageSize]);

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

  async function loadPropertyWorkOrders() {
    try {
      const data = await api.workOrders.list({ propertyId });
      // Only property-level (common area) orders — unit-scoped orders live on their unit pages
      setPropertyWorkOrders((data as PropertyWorkOrder[]).filter((wo) => !wo.unit));
    } catch (err) {
      console.error('Failed to load property work orders:', err);
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

  async function handleDeleteProperty() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.properties.delete(propertyId);
      router.push('/properties');
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to delete property';
      if (msg.toLowerCase().includes('unit')) {
        setDeleteError('This property still has units. Remove all units before deleting.');
      } else {
        setDeleteError(msg);
      }
      setDeleting(false);
    }
  }

  function clearAllFilters() {
    setUnitSearch('');
    setFilterStatus('');
    setFilterBedrooms('');
    setFilterBathrooms('');
    setFilterSqFtMin('');
    setFilterSqFtMax('');
    setFilterType('');
    setFilterAddress('');
  }

  // Derived filter + pagination values (computed from loaded units)
  const distinctAddresses = useMemo(() => {
    if (!property) return [];
    return [...new Set(property.units.map((u) => u.address).filter(Boolean) as string[])];
  }, [property?.units]);

  const filteredUnits = useMemo(() => {
    if (!property) return [];
    return property.units.filter((unit) => {
      if (filterStatus && unit.status !== filterStatus) return false;
      if (filterType && unit.type !== filterType) return false;
      if (filterBedrooms) {
        const n = Number(filterBedrooms);
        if (filterBedrooms === '4') {
          if (unit.bedrooms < 4) return false;
        } else {
          if (unit.bedrooms !== n) return false;
        }
      }
      if (filterBathrooms) {
        const n = Number(filterBathrooms);
        if (filterBathrooms === '3') {
          if (unit.bathrooms < 3) return false;
        } else {
          if (unit.bathrooms !== n) return false;
        }
      }
      if (filterSqFtMin && (unit.sqFt === null || unit.sqFt < Number(filterSqFtMin))) return false;
      if (filterSqFtMax && (unit.sqFt === null || unit.sqFt > Number(filterSqFtMax))) return false;
      if (filterAddress && unit.address !== filterAddress) return false;
      if (unitSearch) {
        const q = unitSearch.toLowerCase();
        const matchUnit = unit.unitNumber.toLowerCase().includes(q);
        const matchType = (unit.type ? (UNIT_TYPE_LABELS[unit.type] ?? unit.type) : '').toLowerCase().includes(q);
        const matchAddress = (unit.address ?? '').toLowerCase().includes(q);
        if (!matchUnit && !matchType && !matchAddress) return false;
      }
      return true;
    });
  }, [property?.units, filterStatus, filterType, filterBedrooms, filterBathrooms,
      filterSqFtMin, filterSqFtMax, filterAddress, unitSearch]);

  const totalPages = pageSize === 'all' ? 1 : Math.ceil(filteredUnits.length / (pageSize as number));
  const pagedUnits = pageSize === 'all'
    ? filteredUnits
    : filteredUnits.slice((currentPage - 1) * (pageSize as number), currentPage * (pageSize as number));

  const hasActiveFilters = !!(filterStatus || filterType || filterBedrooms ||
    filterBathrooms || filterSqFtMin || filterSqFtMax || filterAddress || unitSearch);

  if (loading) return <div className="loading">Loading property...</div>;
  if (!property) return <div className="loading">Property not found</div>;

  const occupiedCount = property.units.filter((u) => u.status === 'occupied' || u.status === 'notice').length;
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
            <button className="btn btn-secondary" onClick={() => setShowBulkCreate(true)}>
              + Bulk Add Units
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

      {/* Property-level (common area) work orders */}
      {propertyWorkOrders.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                Property Work Orders ({propertyWorkOrders.length})
              </h2>
              <Link href="/work-orders" className="btn btn-sm btn-secondary">
                View All Work Orders
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {propertyWorkOrders.map((wo) => (
                <div
                  key={wo.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/work-orders/${wo.id}`} style={{ fontWeight: 500, fontSize: '14px' }}>
                      {wo.title || wo.description.slice(0, 60)}
                    </Link>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {WO_LOCATION_LABELS[wo.locationType ?? ''] ?? 'Common area'}
                      {' · '}
                      {new Date(wo.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {wo.isCapitalProject && (
                      <span className="badge badge-notice">CapEx</span>
                    )}
                    <span className="badge badge-vacant">
                      {WO_STATUS_LABELS[wo.status] ?? wo.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Units section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', marginTop: '8px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
          Units ({property.units.length})
        </h2>
        {property.units.length > 0 && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      {property.units.length > 0 && (
        <div className="filter-bar" style={{ marginBottom: '16px' }}>
          <div className="filter-search">
            <label className="filter-label">Search</label>
            <div style={{ position: 'relative' }}>
              <svg
                style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className={`filter-search-input${unitSearch ? ' has-clear' : ''}`}
                placeholder="Unit #, floor plan, address…"
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
                style={{ paddingLeft: '28px' }}
              />
              {unitSearch && (
                <button
                  onClick={() => setUnitSearch('')}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '16px', lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <label className="filter-label">Status</label>
            <select
              className={`filter-select${filterStatus ? ' filter-select-active-primary' : ''}`}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
              <option value="notice">Notice</option>
              <option value="maintenance">Maintenance</option>
              <option value="unlisted">Unlisted</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Bedrooms</label>
            <select
              className={`filter-select${filterBedrooms ? ' filter-select-active-primary' : ''}`}
              value={filterBedrooms}
              onChange={(e) => setFilterBedrooms(e.target.value)}
            >
              <option value="">Any</option>
              <option value="0">Studio (0)</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4+</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Bathrooms</label>
            <select
              className={`filter-select${filterBathrooms ? ' filter-select-active-primary' : ''}`}
              value={filterBathrooms}
              onChange={(e) => setFilterBathrooms(e.target.value)}
            >
              <option value="">Any</option>
              <option value="1">1</option>
              <option value="1.5">1.5</option>
              <option value="2">2</option>
              <option value="2.5">2.5</option>
              <option value="3">3+</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Floor Plan</label>
            <select
              className={`filter-select${filterType ? ' filter-select-active-primary' : ''}`}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="studio">Studio</option>
              <option value="one_bed">1 Bed</option>
              <option value="two_bed">2 Bed</option>
              <option value="three_bed">3 Bed</option>
              <option value="four_plus_bed">4+ Bed</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Sq Ft</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                type="number"
                placeholder="Min"
                value={filterSqFtMin}
                onChange={(e) => setFilterSqFtMin(e.target.value)}
                style={{ width: '72px', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px' }}
              />
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>–</span>
              <input
                type="number"
                placeholder="Max"
                value={filterSqFtMax}
                onChange={(e) => setFilterSqFtMax(e.target.value)}
                style={{ width: '72px', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px' }}
              />
            </div>
          </div>

          {distinctAddresses.length > 0 && (
            <div className="filter-group">
              <label className="filter-label">Street Address</label>
              <select
                className={`filter-select${filterAddress ? ' filter-select-active-primary' : ''}`}
                value={filterAddress}
                onChange={(e) => setFilterAddress(e.target.value)}
              >
                <option value="">All Addresses</option>
                {distinctAddresses.map((addr) => (
                  <option key={addr} value={addr}>{addr}</option>
                ))}
              </select>
            </div>
          )}

          {hasActiveFilters && (
            <div className="filter-summary">
              <span className="filter-label">Results</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="filter-count">{filteredUnits.length}</span>
                <button
                  onClick={clearAllFilters}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--color-primary)', padding: 0, textDecoration: 'underline' }}
                >
                  Clear filters
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Units display */}
      {property.units.length === 0 ? (
        <div className="empty-state">
          <h3>No units yet</h3>
          <p>Add units to this property to start managing them.</p>
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="empty-state">
          <h3>No units match the current filters</h3>
          <p>
            <button
              onClick={clearAllFilters}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', textDecoration: 'underline', fontSize: 'inherit', padding: 0 }}
            >
              Clear filters
            </button>{' '}
            to see all units.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="units-grid">
          {pagedUnits.map((unit) => {
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
                      <span className={`badge badge-${unit.status}`}>{unit.status === 'notice' ? 'Notice' : unit.status}</span>
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
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Unit #</th>
                <th>Floor Plan</th>
                <th>Status</th>
                <th>Bed</th>
                <th>Bath</th>
                <th>Sq Ft</th>
                {!isMaintenance && <th>Rent</th>}
                <th>Tenant</th>
              </tr>
            </thead>
            <tbody>
              {pagedUnits.map((unit) => {
                const participants = unit.leases?.[0]?.participants;
                const tenant = (participants?.find((p) => p.isPrimary) ?? participants?.[0])?.tenant;
                return (
                  <tr
                    key={unit.id}
                    onClick={() => router.push(`/properties/${propertyId}/units/${unit.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 500 }}>Unit {unit.unitNumber}</td>
                    <td>{unit.type ? (UNIT_TYPE_LABELS[unit.type] ?? unit.type) : '—'}</td>
                    <td>
                      <span className={`badge badge-${unit.status}`}>
                        {unit.status === 'notice' ? 'Notice' : unit.status}
                      </span>
                    </td>
                    <td>{unit.bedrooms}</td>
                    <td>{unit.bathrooms}</td>
                    <td>{unit.sqFt ? `${unit.sqFt.toLocaleString()} sqft` : '—'}</td>
                    {!isMaintenance && <td>${Number(unit.rentAmount).toLocaleString()}/mo</td>}
                    <td>{tenant?.name ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination controls */}
      {property.units.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="filter-select"
              style={{ width: 'auto' }}
            >
              <option value={20}>20</option>
              <option value={40}>40</option>
              <option value={60}>60</option>
              <option value={80}>80</option>
              <option value="all">All</option>
            </select>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              {hasActiveFilters
                ? `Showing ${filteredUnits.length} of ${property.units.length} units`
                : `${property.units.length} unit${property.units.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          {pageSize !== 'all' && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn btn-sm btn-secondary"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                Prev
              </button>
              <span style={{ fontSize: '13px' }}>Page {currentPage} of {totalPages}</span>
              <button
                className="btn btn-sm btn-secondary"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {!isMaintenance && <DocumentPanel entityType="property" entityId={propertyId} />}

      {/* Add Unit modal */}
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

      {/* Edit Property modal */}
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
              <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => { setShowEditProperty(false); setDeleteError(null); setShowDeleteConfirm(true); }}
                >
                  Delete Property
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowEditProperty(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Property confirmation modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => { if (!deleting) { setShowDeleteConfirm(false); setDeleteError(null); } }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Property</h2>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                disabled={deleting}
              >
                X
              </button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--color-danger-light, #fff5f5)', border: '1px solid var(--color-danger)', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px' }}>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-danger)' }}>This action cannot be undone.</p>
              </div>
              <p style={{ margin: '0 0 8px' }}>
                You are about to permanently delete <strong>{property.name}</strong>
                {' '}({property.address}, {property.city}, {property.state} {property.zip}).
              </p>
              <p style={{ margin: '0 0 8px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                All property records will be removed. A confirmation email will be sent to the account owner.
              </p>
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>
                Note: all units must be removed before a property can be deleted.
              </p>
              {deleteError && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fff5f5', border: '1px solid var(--color-danger)', borderRadius: '6px', color: 'var(--color-danger)', fontSize: '14px' }}>
                  {deleteError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteProperty}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete Property'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Create modal */}
      {showBulkCreate && (
        <BulkCreateModal
          propertyId={propertyId}
          property={property}
          onClose={() => setShowBulkCreate(false)}
          onSuccess={() => { loadProperty(); setShowBulkCreate(false); }}
        />
      )}
    </>
  );
}
