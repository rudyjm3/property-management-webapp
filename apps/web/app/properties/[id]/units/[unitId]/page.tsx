'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/phone';

interface UnitDetail {
  id: string;
  unitNumber: string;
  floor: number | null;
  bedrooms: number;
  bathrooms: number;
  sqFt: number | null;
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

export default function UnitDetailPage() {
  const params = useParams();
  const propertyId = params.id as string;
  const unitId = params.unitId as string;
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.units.get(propertyId, unitId);
        setUnit(data);
      } catch (err) {
        console.error('Failed to load unit:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [propertyId, unitId]);

  if (loading) return <div className="loading">Loading unit...</div>;
  if (!unit) return <div className="loading">Unit not found</div>;

  const activeLease = unit.leases.find((l) => l.status === 'active');
  const primaryTenant = activeLease?.participants.find((p) => p.isPrimary)?.tenant;
  const hasUnitAddress = !!(unit.address || unit.city || unit.state || unit.zip);
  const resolvedAddress = `${unit.address ?? unit.property.address}, ${unit.city ?? unit.property.city}, ${unit.state ?? unit.property.state} ${unit.zip ?? unit.property.zip}`;

  return (
    <>
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
        <span className={`badge badge-${unit.status}`} style={{ fontSize: '14px', padding: '4px 12px' }}>
          {unit.status}
        </span>
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
              <div className="detail-item">
                <label>Monthly Rent</label>
                <span>${Number(unit.rentAmount).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <label>Security Deposit</label>
                <span>${Number(unit.depositAmount).toLocaleString()}</span>
              </div>
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
                <div className="detail-item">
                  <label>Lease Status</label>
                  <span className={`badge badge-occupied`}>{activeLease?.status}</span>
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
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '24px' }}>
                <p>No active tenant</p>
              </div>
            )}
          </div>
        </div>
      </div>

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
          )}
        </div>
      </div>

      {/* Lease History */}
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
                          <span className={`badge badge-${lease.status === 'active' ? 'occupied' : lease.status === 'expired' ? 'notice' : 'vacant'}`}>
                            {lease.status.replace('_', ' ')}
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
    </>
  );
}
