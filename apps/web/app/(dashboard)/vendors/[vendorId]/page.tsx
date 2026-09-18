'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type Vendor, type VendorInput, type VendorWorkHistory, type PreferredVendorAssignment } from '@/lib/api';
import { WORK_ORDER_CATEGORIES } from '@propflow/shared';
import ModuleGate, { ModuleInactiveNotice } from '@/components/ModuleGate';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_LABELS: Record<string, string> = { active: 'Active', inactive: 'Inactive' };
const STATUS_BADGE: Record<string, string> = { active: 'badge-occupied', inactive: 'badge-vacant' };

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

const MONTHS_OPTIONS = [3, 6, 12, 24];

// Formats a date-only (@db.Date) ISO value, e.g. licenseExpiresAt /
// insuranceExpiresAt — always in UTC so the calendar date shown doesn't
// shift for viewers west of UTC.
function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—';
}

function expiryBadge(dateStr: string | null): { label: string; className: string } | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(now.getDate() + 30);
  // licenseExpiresAt/insuranceExpiresAt are @db.Date fields, serialized as
  // UTC-midnight ISO timestamps — format in the UTC timezone so viewers west
  // of UTC don't see the previous calendar day.
  const formatted = date.toLocaleDateString('en-US', { timeZone: 'UTC' });
  if (date < now) return { label: `Expired ${formatted}`, className: 'badge-danger' };
  if (date <= in30) return { label: `Expires ${formatted}`, className: 'badge-notice' };
  return { label: `Expires ${formatted}`, className: 'badge-vacant' };
}

function toFormInput(vendor: Vendor): VendorInput {
  return {
    companyName: vendor.companyName,
    contactName: vendor.contactName,
    email: vendor.email,
    phonePrimary: vendor.phonePrimary,
    phoneEmergency: vendor.phoneEmergency ?? '',
    specialties: vendor.specialties,
    status: vendor.status,
    preferred: vendor.preferred,
    notes: vendor.notes ?? '',
    licenseNumber: vendor.licenseNumber ?? '',
    licenseExpiresAt: vendor.licenseExpiresAt ? vendor.licenseExpiresAt.slice(0, 10) : '',
    insuranceOnFile: vendor.insuranceOnFile,
    insuranceExpiresAt: vendor.insuranceExpiresAt ? vendor.insuranceExpiresAt.slice(0, 10) : '',
  };
}

export default function VendorDetailPage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const vendorManagementActive = profile?.organization.activeModules?.includes('vendor_management') ?? false;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Edit form
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<VendorInput | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Work history / spend (Module 5)
  const [months, setMonths] = useState(12);
  const [history, setHistory] = useState<VendorWorkHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // Preferred vendor assignments (Module 5)
  const [assignments, setAssignments] = useState<PreferredVendorAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await api.vendors.get(vendorId);
      setVendor(data);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load vendor');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadHistory = useCallback(async () => {
    if (!vendorManagementActive) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const data = await api.vendors.workHistory(vendorId, months);
      setHistory(data);
    } catch (err: any) {
      setHistoryError(err.message || 'Failed to load work history');
    } finally {
      setHistoryLoading(false);
    }
  }, [vendorId, months, vendorManagementActive]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!vendorManagementActive) return;
    setAssignmentsLoading(true);
    api.vendors.preferredAssignments
      .list()
      .then((all) => setAssignments(all.filter((a) => a.vendorId === vendorId)))
      .catch(() => setAssignments([]))
      .finally(() => setAssignmentsLoading(false));
  }, [vendorId, vendorManagementActive]);

  function openEdit() {
    if (!vendor) return;
    setForm(toFormInput(vendor));
    setFormError('');
    setShowEdit(true);
  }

  function toggleSpecialty(spec: string) {
    setForm((f) =>
      f
        ? {
            ...f,
            specialties: f.specialties.includes(spec)
              ? f.specialties.filter((s) => s !== spec)
              : [...f.specialties, spec],
          }
        : f
    );
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.specialties.length === 0) {
      setFormError('Select at least one specialty.');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      const updated = await api.vendors.update(vendorId, {
        ...form,
        phoneEmergency: form.phoneEmergency || null,
        notes: form.notes || null,
        licenseNumber: form.licenseNumber || null,
        licenseExpiresAt: form.licenseExpiresAt || null,
        insuranceExpiresAt: form.insuranceExpiresAt || null,
      });
      setVendor(updated);
      setShowEdit(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update vendor');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this vendor? This cannot be undone.')) return;
    setDeleteError('');
    try {
      await api.vendors.delete(vendorId);
      router.push('/vendors');
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete vendor');
    }
  }

  if (loading) return <div className="loading">Loading vendor…</div>;
  if (loadError || !vendor) {
    return (
      <div className="empty-state">
        <h3>Vendor not found</h3>
        {loadError && <p>{loadError}</p>}
        <Link href="/vendors">Back to Vendors</Link>
      </div>
    );
  }

  const license = expiryBadge(vendor.licenseExpiresAt);
  const insurance = expiryBadge(vendor.insuranceExpiresAt);

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
            <Link href="/vendors">Vendors</Link> /
          </div>
          <h1 className="page-title">{vendor.companyName}</h1>
          <p className="page-subtitle">
            <span className={`badge ${STATUS_BADGE[vendor.status] ?? 'badge-vacant'}`}>
              {STATUS_LABELS[vendor.status] ?? vendor.status}
            </span>
            {vendor.rating && (
              <span style={{ marginLeft: '8px' }}>{Number(vendor.rating).toFixed(1)} / 5 rating</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={openEdit}>
            Edit
          </button>
          <button className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      {deleteError && (
        <div style={{ color: 'var(--color-danger)', marginBottom: '16px', fontSize: '14px' }}>{deleteError}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Contact & specialties */}
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>Contact</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Contact name</div>
                  <div>{vendor.contactName}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Email</div>
                  <div>{vendor.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Primary phone</div>
                  <div>{vendor.phonePrimary}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Emergency phone</div>
                  <div>{vendor.phoneEmergency || '—'}</div>
                </div>
              </div>
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Specialties</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {vendor.specialties.map((s) => (
                    <span key={s} className="badge badge-vacant">
                      {SPECIALTY_LABELS[s] ?? s}
                    </span>
                  ))}
                </div>
              </div>
              {vendor.notes && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Notes</div>
                  <p style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{vendor.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Work history & spend (Module 5) */}
          <ModuleGate module="vendor_management" fallback={
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>Work History &amp; Spend</h3>
                <ModuleInactiveNotice module="vendor_management" />
              </div>
            </div>
          }>
            <div className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Work History &amp; Spend</h3>
                  <select
                    value={months}
                    onChange={(e) => setMonths(Number(e.target.value))}
                    className="filter-select"
                    style={{ fontSize: '13px' }}
                  >
                    {MONTHS_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        Last {m} months
                      </option>
                    ))}
                  </select>
                </div>
                {historyLoading ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading…</p>
                ) : historyError ? (
                  <p style={{ color: 'var(--color-danger)', fontSize: '14px' }}>{historyError}</p>
                ) : !history || history.count === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
                    No completed work orders in this period.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Completed jobs</div>
                        <div style={{ fontWeight: 700, fontSize: '18px' }}>{history.count}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Total spend</div>
                        <div style={{ fontWeight: 700, fontSize: '18px' }}>
                          ${history.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Avg. rating (period)</div>
                        <div style={{ fontWeight: 700, fontSize: '18px' }}>
                          {history.ratings.average != null ? `${history.ratings.average.toFixed(1)} / 5` : '—'}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                      By category
                    </div>
                    <table style={{ width: '100%', fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '4px 0' }}>Category</th>
                          <th style={{ textAlign: 'right', padding: '4px 0' }}>Jobs</th>
                          <th style={{ textAlign: 'right', padding: '4px 0' }}>Spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.byCategory.map((c) => (
                          <tr key={c.category}>
                            <td style={{ padding: '4px 0' }}>{SPECIALTY_LABELS[c.category] ?? c.category}</td>
                            <td style={{ textAlign: 'right', padding: '4px 0' }}>{c.count}</td>
                            <td style={{ textAlign: 'right', padding: '4px 0' }}>
                              ${c.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {history.ratings.recent.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                          Recent ratings (this vendor&apos;s completed jobs in this period)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {history.ratings.recent.map((r, i) => (
                            <div key={i} style={{ fontSize: '13px', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                              <strong>{r.rating} / 5</strong>
                              {r.note && <span style={{ color: 'var(--color-text-muted)' }}> — {r.note}</span>}
                              <span style={{ color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                                ({new Date(r.createdAt).toLocaleDateString()})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '12px' }}>
                      Rating history above is limited to the 10 most recent ratings within the selected time
                      range — there is currently no endpoint to list a vendor&apos;s full rating history outside
                      that window. The overall {vendor.rating ? `${Number(vendor.rating).toFixed(1)} / 5` : 'N/A'} rating
                      shown above is the all-time rolling average across every rated work order.
                    </p>
                  </>
                )}
              </div>
            </div>
          </ModuleGate>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                License &amp; Insurance
              </h3>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>License #</div>
                <div style={{ fontWeight: 500 }}>{vendor.licenseNumber || '—'}</div>
                {license && <span className={`badge ${license.className}`} style={{ marginTop: '4px', display: 'inline-block' }}>{license.label}</span>}
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Insurance</div>
                <div style={{ fontWeight: 500 }}>{vendor.insuranceOnFile ? 'On file' : 'Not on file'}</div>
                {insurance && <span className={`badge ${insurance.className}`} style={{ marginTop: '4px', display: 'inline-block' }}>{insurance.label}</span>}
              </div>
            </div>
          </div>

          <ModuleGate module="vendor_management">
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                  Preferred For
                </h3>
                {assignmentsLoading ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Loading…</p>
                ) : assignments.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                    Not set as a preferred vendor for any property/category. Manage assignments from{' '}
                    <Link href="/settings/organization">Settings → Organization</Link>.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {assignments.map((a) => (
                      <div key={a.id} style={{ fontSize: '13px' }}>
                        <span className="badge badge-notice">{SPECIALTY_LABELS[a.category] ?? a.category}</span>{' '}
                        {a.property ? a.property.name : 'Org-wide default'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ModuleGate>
        </div>
      </div>

      {showEdit && form && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Vendor</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowEdit(false)}>
                X
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                {formError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>{formError}</div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>Company Name</label>
                    <input
                      required
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Name</label>
                    <input
                      required
                      value={form.contactName}
                      onChange={(e) => setForm({ ...form, contactName: e.target.value })}
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
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      required
                      value={form.phonePrimary}
                      onChange={(e) => setForm({ ...form, phonePrimary: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Emergency Phone</label>
                  <input
                    value={form.phoneEmergency ?? ''}
                    onChange={(e) => setForm({ ...form, phoneEmergency: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
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
                        <input type="checkbox" checked={form.specialties.includes(c)} onChange={() => toggleSpecialty(c)} />
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
                  <textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
