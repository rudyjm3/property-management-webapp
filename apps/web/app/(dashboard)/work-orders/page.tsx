'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface WorkOrder {
  id: string;
  title: string | null;
  description: string;
  category: string;
  priority: string;
  status: string;
  slaDeadlineAt: string | null;
  slaBreached: boolean;
  createdAt: string;
  unit: {
    id: string;
    unitNumber: string;
    property: { id: string; name: string };
  };
  tenant: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  submittedByUser: { id: string; name: string } | null;
}

interface UnitOption {
  id: string;
  label: string;
  propertyId: string;
  tenantId: string | null;
  leaseTenants: { id: string; name: string }[];
}

const PRIORITY_COLORS: Record<string, string> = {
  emergency: 'badge-notice',
  urgent: 'badge-maintenance',
  routine: 'badge-vacant',
  normal: 'badge-vacant',
};

const PRIORITY_LABELS: Record<string, string> = {
  emergency: 'Emergency',
  urgent: 'Urgent',
  routine: 'Routine',
  normal: 'Routine',
};

const STATUS_COLORS: Record<string, string> = {
  new_order: 'badge-maintenance',
  assigned: 'badge-vacant',
  in_progress: 'badge-occupied',
  pending_parts: 'badge-maintenance',
  completed: 'badge-occupied',
  closed: 'badge-vacant',
  cancelled: 'badge-vacant',
};

const STATUS_LABELS: Record<string, string> = {
  new_order: 'New',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending_parts: 'Pending Parts',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const CATEGORY_LABELS: Record<string, string> = {
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

const FILTER_STATUSES = ['', 'new_order', 'assigned', 'in_progress', 'pending_parts', 'completed', 'closed', 'cancelled'];
const FILTER_PRIORITIES = ['', 'emergency', 'urgent', 'routine'];
const FILTER_CATEGORIES = ['', 'plumbing', 'electrical', 'hvac', 'appliance', 'pest', 'structural', 'cosmetic', 'grounds', 'general', 'other'];

export default function WorkOrdersPage() {
  const { profile } = useAuth();
  const isMaintenance = profile?.role === 'maintenance';
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [leaseTenantOptions, setLeaseTenantOptions] = useState<{ id: string; name: string }[]>([]);
  const [formLoading, setFormLoading] = useState(false);

  const [unitId, setUnitId] = useState('');
  const [formTenantId, setFormTenantId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('routine');
  const [description, setDescription] = useState('');
  const [entryPermission, setEntryPermission] = useState(false);
  const [contactWindow, setContactWindow] = useState('');

  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.workOrders.list({
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        category: filterCategory || undefined,
      });
      setWorkOrders(data);
    } catch (err) {
      console.error('Failed to load work orders:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterCategory]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  async function openForm() {
    setShowForm(true);
    setFormLoading(true);
    try {
      const properties = await api.properties.list();
      const unitLists = await Promise.all(
        properties.map((p: any) =>
          api.units.list(p.id).then((units: any[]) =>
            units.map((u) => {
              const participants: any[] = u.leases?.[0]?.participants ?? [];
              const primary = participants.find((p: any) => p.isPrimary);
              return {
                id: u.id,
                label: `Unit ${u.unitNumber} — ${p.name}`,
                propertyId: p.id,
                tenantId: primary?.tenant?.id ?? participants[0]?.tenant?.id ?? null,
                leaseTenants: participants.map((p: any) => ({ id: p.tenant.id, name: p.tenant.name })),
              };
            })
          )
        )
      );
      setUnitOptions(unitLists.flat());
    } catch (err) {
      console.error('Failed to load units:', err);
    } finally {
      setFormLoading(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setFormError('');
    setUnitId('');
    setFormTenantId(null);
    setLeaseTenantOptions([]);
    setTitle('');
    setCategory('general');
    setPriority('routine');
    setDescription('');
    setEntryPermission(false);
    setContactWindow('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await api.workOrders.create({
        unitId,
        title: title || null,
        category,
        priority,
        description,
        entryPermissionGranted: entryPermission,
        preferredContactWindow: contactWindow || null,
        tenantId: formTenantId,
      });
      closeForm();
      loadWorkOrders();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create work order');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this work order?')) return;
    try {
      await api.workOrders.delete(id);
      loadWorkOrders();
    } catch (err) {
      console.error('Failed to delete work order:', err);
    }
  }

  const openCount = workOrders.filter((w) => !['completed', 'closed', 'cancelled'].includes(w.status)).length;
  const breachedCount = workOrders.filter((w) => w.slaBreached).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Work Orders</h1>
          <p className="page-subtitle">
            {openCount} open &middot; {workOrders.length} total
            {breachedCount > 0 && (
              <span style={{ color: 'var(--color-danger)', marginLeft: '8px' }}>
                · {breachedCount} SLA breach{breachedCount !== 1 ? 'es' : ''}
              </span>
            )}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openForm}>
          + New Work Order
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'white' }}
        >
          <option value="">All Statuses</option>
          {FILTER_STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'white' }}
        >
          <option value="">All Priorities</option>
          {FILTER_PRIORITIES.filter(Boolean).map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'white' }}
        >
          <option value="">All Categories</option>
          {FILTER_CATEGORIES.filter(Boolean).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        {(filterStatus || filterPriority || filterCategory) && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterCategory(''); }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading work orders...</div>
      ) : workOrders.length === 0 ? (
        <div className="empty-state">
          <h3>No work orders found</h3>
          <p>{filterStatus || filterPriority || filterCategory ? 'Try adjusting your filters.' : 'Create the first work order to get started.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Issue</th>
                <th>Unit / Property</th>
                <th>Tenant</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>SLA Deadline</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => {
                const isOverdue = wo.slaDeadlineAt && new Date(wo.slaDeadlineAt) < new Date() && !['completed', 'closed', 'cancelled'].includes(wo.status);
                return (
                  <tr key={wo.id} style={wo.slaBreached ? { background: '#fff5f5' } : undefined}>
                    <td>
                      <Link href={`/work-orders/${wo.id}`} style={{ fontWeight: 500, fontSize: '14px' }}>
                        {wo.title || wo.description.slice(0, 60)}
                      </Link>
                      {wo.title && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          {wo.description.slice(0, 60)}{wo.description.length > 60 ? '…' : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <Link href={`/properties/${wo.unit.property.id}/units/${wo.unit.id}`}>
                        Unit {wo.unit.unitNumber}
                      </Link>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{wo.unit.property.name}</div>
                    </td>
                    <td>
                      {wo.submittedByUser ? (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Staff created</span>
                      ) : wo.tenant ? (
                        <Link href={`/tenants/${wo.tenant.id}`}>{wo.tenant.name}</Link>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>{CATEGORY_LABELS[wo.category] ?? wo.category}</td>
                    <td>
                      <span className={`badge ${PRIORITY_COLORS[wo.priority] ?? 'badge-vacant'}`}>
                        {PRIORITY_LABELS[wo.priority] ?? wo.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[wo.status] ?? 'badge-vacant'}`}>
                        {STATUS_LABELS[wo.status] ?? wo.status}
                      </span>
                    </td>
                    <td style={{ color: isOverdue ? 'var(--color-danger)' : undefined }}>
                      {wo.slaDeadlineAt
                        ? new Date(wo.slaDeadlineAt).toLocaleString()
                        : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                      {wo.slaBreached && (
                        <div style={{ fontSize: '11px', color: 'var(--color-danger)', fontWeight: 600 }}>SLA BREACHED</div>
                      )}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {new Date(wo.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <Link href={`/work-orders/${wo.id}`} className="btn btn-sm btn-secondary">
                          View
                        </Link>
                        {!isMaintenance && (
                          <button
                            className="btn btn-sm btn-secondary"
                            style={{ color: 'var(--color-danger)' }}
                            onClick={() => handleDelete(wo.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Work Order Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2>New Work Order</h2>
              <button className="btn btn-sm btn-secondary" onClick={closeForm}>X</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>
                    {formError}
                  </div>
                )}
                {formLoading ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#6b7280' }}>Loading…</div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Unit *</label>
                      <select required value={unitId} onChange={(e) => {
                        setUnitId(e.target.value);
                        const opt = unitOptions.find((u) => u.id === e.target.value);
                        setFormTenantId(opt?.tenantId ?? null);
                        setLeaseTenantOptions(opt?.leaseTenants ?? []);
                      }}>
                        <option value="">— Select a unit —</option>
                        {unitOptions.map((u) => (
                          <option key={u.id} value={u.id}>{u.label}</option>
                        ))}
                      </select>
                    </div>

                    {leaseTenantOptions.length > 1 && (
                      <div className="form-group">
                        <label>Tenant</label>
                        <select value={formTenantId ?? ''} onChange={(e) => setFormTenantId(e.target.value || null)}>
                          {leaseTenantOptions.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Title (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Leaking kitchen faucet"
                        maxLength={200}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Category *</label>
                        <select required value={category} onChange={(e) => setCategory(e.target.value)}>
                          {FILTER_CATEGORIES.filter(Boolean).map((c) => (
                            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Priority *</label>
                        <select required value={priority} onChange={(e) => setPriority(e.target.value)}>
                          <option value="routine">Routine (7 days)</option>
                          <option value="urgent">Urgent (24 hours)</option>
                          <option value="emergency">Emergency (1 hour)</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Description *</label>
                      <textarea
                        required
                        rows={4}
                        placeholder="Describe the issue in detail..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>Preferred Contact Window</label>
                      <input
                        type="text"
                        placeholder="e.g. Weekdays 9am–5pm"
                        value={contactWindow}
                        onChange={(e) => setContactWindow(e.target.value)}
                      />
                    </div>

                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="entryPermission"
                        checked={entryPermission}
                        onChange={(e) => setEntryPermission(e.target.checked)}
                        style={{ width: 'auto' }}
                      />
                      <label htmlFor="entryPermission" style={{ marginBottom: 0 }}>
                        Entry permitted without tenant present
                      </label>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || formLoading}>
                  {submitting ? 'Creating…' : 'Create Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
