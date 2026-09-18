'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type VendorListItem, type VendorInput } from '@/lib/api';
import { WORK_ORDER_CATEGORIES } from '@propflow/shared';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'occupied',
  inactive: 'vacant',
};

const SPECIALTY_LABELS: Record<string, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  appliance: 'Appliance',
  pest: 'Pest',
  structural: 'Structural',
  cosmetic: 'Cosmetic',
  grounds: 'Grounds',
  general: 'General',
  other: 'Other',
};

function emptyForm(): VendorInput {
  return {
    companyName: '',
    contactName: '',
    email: '',
    phonePrimary: '',
    phoneEmergency: '',
    specialties: [],
    status: 'active',
    notes: '',
    licenseNumber: '',
    licenseExpiresAt: '',
    insuranceOnFile: false,
    insuranceExpiresAt: '',
  };
}

function expiryLabel(dateStr: string | null): { label: string; badge: string } | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(now.getDate() + 30);
  // licenseExpiresAt/insuranceExpiresAt are @db.Date fields, serialized as
  // UTC-midnight ISO timestamps — format in the UTC timezone so viewers west
  // of UTC don't see the previous calendar day.
  const formatted = date.toLocaleDateString('en-US', { timeZone: 'UTC' });
  if (date < now) return { label: `Expired ${formatted}`, badge: 'badge-danger' };
  if (date <= in30) return { label: `Expires ${formatted}`, badge: 'badge-notice' };
  return { label: `Expires ${formatted}`, badge: 'badge-vacant' };
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VendorInput>(emptyForm());
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadVendors() {
    setLoading(true);
    try {
      const data = await api.vendors.list();
      setVendors(data);
    } catch (err) {
      console.error('Failed to load vendors:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVendors();
  }, []);

  function openForm() {
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
  }

  function toggleSpecialty(spec: string) {
    setForm((f) => ({
      ...f,
      specialties: f.specialties.includes(spec)
        ? f.specialties.filter((s) => s !== spec)
        : [...f.specialties, spec],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (form.specialties.length === 0) {
      setFormError('Select at least one specialty.');
      return;
    }
    setSubmitting(true);
    try {
      await api.vendors.create({
        ...form,
        phoneEmergency: form.phoneEmergency || null,
        notes: form.notes || null,
        licenseNumber: form.licenseNumber || null,
        licenseExpiresAt: form.licenseExpiresAt || null,
        insuranceExpiresAt: form.insuranceExpiresAt || null,
      });
      closeForm();
      loadVendors();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create vendor');
    } finally {
      setSubmitting(false);
    }
  }

  const hasActiveFilters = Boolean(search || statusFilter || specialtyFilter);

  const filteredVendors = vendors.filter((v) => {
    if (search) {
      const q = search.toLowerCase();
      const matches =
        v.companyName.toLowerCase().includes(q) ||
        v.contactName.toLowerCase().includes(q) ||
        v.email.toLowerCase().includes(q) ||
        v.specialties.some((s) => s.toLowerCase().includes(q));
      if (!matches) return false;
    }
    if (statusFilter && v.status !== statusFilter) return false;
    if (specialtyFilter && !v.specialties.includes(specialtyFilter)) return false;
    return true;
  });

  if (loading) return <div className="loading">Loading vendors...</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Vendors</h1>
          <p className="page-subtitle">
            {filteredVendors.length === vendors.length
              ? `${vendors.length} vendors`
              : `${filteredVendors.length} of ${vendors.length} vendors`}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openForm}>
          + Add Vendor
        </button>
      </div>

      {vendors.length > 0 && (
        <div className="filter-bar">
          <div className="filter-search">
            <label className="filter-label" htmlFor="vendor-search">
              Search
            </label>
            <div className="filter-search-input-wrap">
              <svg
                className="filter-search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                id="vendor-search"
                type="text"
                placeholder="Company, contact, email or specialty..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`filter-search-input${search ? ' has-clear' : ''}`}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear vendor search"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    fontSize: '16px',
                    lineHeight: 1,
                    padding: '0 2px',
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <label className="filter-label" htmlFor="vendor-status-filter">
              Status
            </label>
            <select
              id="vendor-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`filter-select${statusFilter ? ' filter-select-active-primary' : ''}`}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label" htmlFor="vendor-specialty-filter">
              Specialty
            </label>
            <select
              id="vendor-specialty-filter"
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className={`filter-select${specialtyFilter ? ' filter-select-active-warning' : ''}`}
            >
              <option value="">All Specialties</option>
              {WORK_ORDER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SPECIALTY_LABELS[c] ?? c}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <div className="filter-summary">
              <div className="filter-summary-row">
                <span className="filter-label">Results</span>
                <span className="filter-count">{filteredVendors.length}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setSpecialtyFilter('');
                }}
                className="filter-clear-button"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="empty-state">
          <h3>No vendors yet</h3>
          <p>Add your first vendor or contractor to get started.</p>
        </div>
      ) : filteredVendors.length === 0 ? (
        <div className="empty-state">
          <h3>No vendors match your filters</h3>
          <p>Try adjusting your search or filter criteria.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th>Specialties</th>
                <th>Rating</th>
                <th>License / Insurance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map((vendor) => (
                <tr key={vendor.id}>
                  <td>
                    <Link
                      href={`/vendors/${vendor.id}`}
                      style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {vendor.companyName}
                    </Link>
                    {vendor.preferred && (
                      <span className="badge badge-notice" style={{ marginLeft: '8px' }}>
                        Preferred
                      </span>
                    )}
                  </td>
                  <td>
                    <div>{vendor.contactName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {vendor.email} &middot; {vendor.phonePrimary}
                    </div>
                  </td>
                  <td>
                    {vendor.specialties.map((s) => (
                      <span key={s} className="badge badge-vacant" style={{ marginRight: '4px', marginBottom: '4px' }}>
                        {SPECIALTY_LABELS[s] ?? s}
                      </span>
                    ))}
                  </td>
                  <td>{vendor.rating ? `${Number(vendor.rating).toFixed(1)} / 5` : '—'}</td>
                  <td style={{ fontSize: '13px' }}>
                    {(() => {
                      const license = expiryLabel(vendor.licenseExpiresAt);
                      const insurance = expiryLabel(vendor.insuranceExpiresAt);
                      if (!license && !insurance) return '—';
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {license && (
                            <span className={`badge ${license.badge}`}>License: {license.label}</span>
                          )}
                          {insurance && (
                            <span className={`badge ${insurance.badge}`}>Insurance: {insurance.label}</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    <span className={`badge badge-${STATUS_BADGE[vendor.status] ?? 'vacant'}`}>
                      {STATUS_LABELS[vendor.status] ?? vendor.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Vendor</h2>
              <button className="btn btn-sm btn-secondary" onClick={closeForm}>
                X
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>
                    {formError}
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>Company Name</label>
                    <input
                      required
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                      placeholder="e.g. Acme Plumbing Co."
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Name</label>
                    <input
                      required
                      value={form.contactName}
                      onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                      placeholder="e.g. Jane Doe"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="jane@acmeplumbing.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      required
                      value={form.phonePrimary}
                      onChange={(e) => setForm({ ...form, phonePrimary: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Emergency Phone</label>
                  <input
                    value={form.phoneEmergency ?? ''}
                    onChange={(e) => setForm({ ...form, phoneEmergency: e.target.value })}
                    placeholder="Optional after-hours number"
                  />
                </div>
                <div className="form-group">
                  <label>Specialties</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {WORK_ORDER_CATEGORIES.map((c) => (
                      <label
                        key={c}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '13px',
                          fontWeight: 400,
                          border: '1px solid var(--color-border)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={form.specialties.includes(c)}
                          onChange={() => toggleSpecialty(c)}
                        />
                        {SPECIALTY_LABELS[c] ?? c}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>License Number</label>
                    <input
                      value={form.licenseNumber ?? ''}
                      onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>License Expires</label>
                    <input
                      type="date"
                      value={form.licenseExpiresAt ?? ''}
                      onChange={(e) => setForm({ ...form, licenseExpiresAt: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={form.insuranceOnFile ?? false}
                        onChange={(e) => setForm({ ...form, insuranceOnFile: e.target.checked })}
                      />
                      Insurance On File
                    </label>
                  </div>
                  <div className="form-group">
                    <label>Insurance Expires</label>
                    <input
                      type="date"
                      value={form.insuranceExpiresAt ?? ''}
                      onChange={(e) => setForm({ ...form, insuranceExpiresAt: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={form.notes ?? ''}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
