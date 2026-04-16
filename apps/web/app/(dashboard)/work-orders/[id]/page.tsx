'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
  entryPermissionGranted: boolean;
  preferredContactWindow: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  resolutionNotes: string | null;
  laborCost: string | null;
  partsCost: string | null;
  totalCost: string | null;
  chargedToTenant: boolean | null;
  tenantChargeAmount: string | null;
  createdAt: string;
  updatedAt: string;
  unit: {
    id: string;
    unitNumber: string;
    property: { id: string; name: string };
  };
  tenant: { id: string; name: string; email: string; phone: string | null } | null;
  assignedTo: { id: string; name: string; email: string } | null;
  submittedByUser: { id: string; name: string; role: string } | null;
  vendor: { id: string; companyName: string; contactName: string; phonePrimary: string } | null;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Vendor {
  id: string;
  companyName: string;
  contactName: string;
  phonePrimary: string;
  preferred: boolean | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  emergency: 'badge-danger',
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

const NEXT_STATUSES: Record<string, string[]> = {
  new_order: ['assigned', 'in_progress', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['pending_parts', 'completed', 'cancelled'],
  pending_parts: ['in_progress', 'completed', 'cancelled'],
  completed: ['closed'],
  closed: [],
  cancelled: [],
};

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const isMaintenance = profile?.role === 'maintenance';
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [priorityReminder, setPriorityReminder] = useState(false);

  // Edit form state
  const [showEdit, setShowEdit] = useState(false);
  const [editResolutionNotes, setEditResolutionNotes] = useState('');
  const [editLaborCost, setEditLaborCost] = useState('');
  const [editPartsCost, setEditPartsCost] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Assign modal state
  const [showAssign, setShowAssign] = useState(false);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [vendorList, setVendorList] = useState<Vendor[]>([]);
  const [assignStaffId, setAssignStaffId] = useState('');
  const [assignVendorId, setAssignVendorId] = useState('');
  const [assignError, setAssignError] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);

  async function load() {
    try {
      const data = await api.workOrders.get(id);
      setWorkOrder(data);
    } catch (err) {
      console.error('Failed to load work order:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function updateStatus(newStatus: string) {
    if (!workOrder) return;
    setUpdating(true);
    try {
      const updated = await api.workOrders.update(workOrder.id, { status: newStatus });
      setWorkOrder(updated);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdating(false);
    }
  }

  // Normalize legacy DB enum value 'normal' → 'routine' for display/comparison
  const normalizePriority = (p: string) => (p === 'normal' ? 'routine' : p);
  const PRIORITY_ORDER: Record<string, number> = { emergency: 2, urgent: 1, routine: 0, normal: 0 };

  async function updatePriority(newPriority: string) {
    if (!workOrder || newPriority === workOrder.priority) return;
    const wasLowered = PRIORITY_ORDER[newPriority] < PRIORITY_ORDER[workOrder.priority];
    setUpdating(true);
    try {
      const updated = await api.workOrders.update(workOrder.id, { priority: newPriority });
      setWorkOrder(updated);
      if (wasLowered) setPriorityReminder(true);
    } catch (err) {
      console.error('Failed to update priority:', err);
    } finally {
      setUpdating(false);
    }
  }

  function openEdit() {
    if (!workOrder) return;
    setEditResolutionNotes(workOrder.resolutionNotes ?? '');
    setEditLaborCost(workOrder.laborCost ? String(Number(workOrder.laborCost)) : '');
    setEditPartsCost(workOrder.partsCost ? String(Number(workOrder.partsCost)) : '');
    setEditScheduledAt(workOrder.scheduledAt ? workOrder.scheduledAt.slice(0, 16) : '');
    setEditError('');
    setShowEdit(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEditError('');
    setEditSubmitting(true);
    try {
      const laborCost = editLaborCost ? parseFloat(editLaborCost) : null;
      const partsCost = editPartsCost ? parseFloat(editPartsCost) : null;
      const updated = await api.workOrders.update(workOrder!.id, {
        resolutionNotes: editResolutionNotes || null,
        laborCost,
        partsCost,
        totalCost: laborCost != null || partsCost != null ? (laborCost ?? 0) + (partsCost ?? 0) : null,
        scheduledAt: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
      });
      setWorkOrder(updated);
      setShowEdit(false);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function openAssign() {
    if (!workOrder) return;
    setAssignStaffId(workOrder.assignedTo?.id ?? '');
    setAssignVendorId(workOrder.vendor?.id ?? '');
    setAssignError('');
    setShowAssign(true);
    setAssignLoading(true);
    try {
      const [staff, vendors] = await Promise.all([
        api.staff.list(),
        api.vendors.list({ activeOnly: true }),
      ]);
      setStaffList(staff);
      setVendorList(vendors);
    } catch (err) {
      console.error('Failed to load staff/vendors:', err);
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleAssignSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAssignError('');
    setAssignSubmitting(true);
    try {
      const updated = await api.workOrders.update(workOrder!.id, {
        assignedToUserId: assignStaffId || null,
        vendorId: assignVendorId || null,
      });
      setWorkOrder(updated);
      setShowAssign(false);
    } catch (err: any) {
      setAssignError(err.message || 'Failed to assign');
    } finally {
      setAssignSubmitting(false);
    }
  }

  if (loading) return <div className="loading">Loading work order…</div>;
  if (!workOrder) return <div className="empty-state"><h3>Work order not found</h3></div>;

  const isOverdue = workOrder.slaDeadlineAt
    && new Date(workOrder.slaDeadlineAt) < new Date()
    && !['completed', 'closed', 'cancelled'].includes(workOrder.status);

  const nextStatuses = NEXT_STATUSES[workOrder.status] ?? [];
  const isAssigned = !!workOrder.assignedTo || !!workOrder.vendor;

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
            <Link href="/work-orders">Work Orders</Link> /
          </div>
          <h1 className="page-title">
            {workOrder.title || `Work Order — Unit ${workOrder.unit.unitNumber}`}
          </h1>
          <p className="page-subtitle">
            <Link href={`/properties/${workOrder.unit.property.id}/units/${workOrder.unit.id}`}>
              Unit {workOrder.unit.unitNumber} — {workOrder.unit.property.name}
            </Link>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isMaintenance && !['completed', 'closed', 'cancelled'].includes(workOrder.status) && (
            <button
              className={isAssigned ? 'btn btn-secondary' : 'btn btn-primary'}
              onClick={openAssign}
            >
              {isAssigned ? 'Reassign' : 'Assign'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={openEdit}>Edit Details</button>
        </div>
      </div>

      {/* SLA breach banner */}
      {workOrder.slaBreached && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '20px', color: '#991b1b', fontWeight: 500 }}>
          ⚠ SLA breached — this work order exceeded its response deadline
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>
        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Status + actions */}
          <div className="card">
            <div className="card-body">
              {priorityReminder && (
                <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#92400e', marginBottom: '2px' }}>Priority was lowered</div>
                    <div style={{ fontSize: '13px', color: '#78350f' }}>Consider messaging or calling the tenant to explain why the priority was adjusted.</div>
                  </div>
                  <button onClick={() => setPriorityReminder(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontWeight: 700, fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className={`badge ${STATUS_COLORS[workOrder.status] ?? 'badge-vacant'}`}>
                    {STATUS_LABELS[workOrder.status] ?? workOrder.status}
                  </span>
                  <span className={`badge ${PRIORITY_COLORS[workOrder.priority] ?? 'badge-vacant'}`}>
                    {PRIORITY_LABELS[workOrder.priority] ?? workOrder.priority}
                  </span>
                  <span className="badge badge-vacant">{CATEGORY_LABELS[workOrder.category] ?? workOrder.category}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Priority:</label>
                  <select
                    value={normalizePriority(workOrder.priority)}
                    onChange={(e) => updatePriority(e.target.value)}
                    disabled={updating}
                    style={{ fontSize: '13px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
              </div>
              {nextStatuses.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', alignSelf: 'center' }}>Move to:</span>
                  {nextStatuses.map((s) => (
                    <button
                      key={s}
                      className="btn btn-sm btn-secondary"
                      disabled={updating}
                      onClick={() => updateStatus(s)}
                    >
                      {STATUS_LABELS[s] ?? s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>Description</h3>
              <p style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{workOrder.description}</p>
            </div>
          </div>

          {/* Resolution notes */}
          {workOrder.resolutionNotes && (
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>Resolution Notes</h3>
                <p style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{workOrder.resolutionNotes}</p>
              </div>
            </div>
          )}

          {/* Cost breakdown */}
          {(workOrder.laborCost || workOrder.partsCost || workOrder.totalCost) && (
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Cost Breakdown</h3>
                <div style={{ display: 'flex', gap: '24px' }}>
                  {workOrder.laborCost && (
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Labor</div>
                      <div style={{ fontWeight: 600 }}>${Number(workOrder.laborCost).toLocaleString()}</div>
                    </div>
                  )}
                  {workOrder.partsCost && (
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Parts</div>
                      <div style={{ fontWeight: 600 }}>${Number(workOrder.partsCost).toLocaleString()}</div>
                    </div>
                  )}
                  {workOrder.totalCost && (
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Total</div>
                      <div style={{ fontWeight: 700, fontSize: '16px' }}>${Number(workOrder.totalCost).toLocaleString()}</div>
                    </div>
                  )}
                </div>
                {workOrder.chargedToTenant && workOrder.tenantChargeAmount && (
                  <div style={{ marginTop: '8px', color: 'var(--color-warning)', fontSize: '13px' }}>
                    Tenant charged: ${Number(workOrder.tenantChargeAmount).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* SLA */}
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>SLA</h3>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Deadline</div>
                <div style={{ fontWeight: 500, color: isOverdue ? 'var(--color-danger)' : undefined }}>
                  {workOrder.slaDeadlineAt
                    ? new Date(workOrder.slaDeadlineAt).toLocaleString()
                    : '—'}
                </div>
              </div>
              {workOrder.scheduledAt && (
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Scheduled</div>
                  <div style={{ fontWeight: 500 }}>{new Date(workOrder.scheduledAt).toLocaleString()}</div>
                </div>
              )}
              {workOrder.completedAt && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Completed</div>
                  <div style={{ fontWeight: 500 }}>{new Date(workOrder.completedAt).toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>

          {/* Assigned to */}
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Assigned To</h3>
              {workOrder.assignedTo ? (
                <div style={{ marginBottom: workOrder.vendor ? '12px' : 0 }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '2px' }}>Staff</div>
                  <div style={{ fontWeight: 500 }}>{workOrder.assignedTo.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{workOrder.assignedTo.email}</div>
                </div>
              ) : null}
              {workOrder.vendor ? (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '2px' }}>Vendor</div>
                  <div style={{ fontWeight: 500 }}>{workOrder.vendor.companyName}</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{workOrder.vendor.contactName}</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{workOrder.vendor.phonePrimary}</div>
                </div>
              ) : null}
              {!workOrder.assignedTo && !workOrder.vendor && (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Unassigned</div>
              )}
            </div>
          </div>

          {/* Tenant */}
          {workOrder.tenant && (
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Tenant</h3>
                <Link href={`/tenants/${workOrder.tenant.id}`} style={{ fontWeight: 500 }}>
                  {workOrder.tenant.name}
                </Link>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{workOrder.tenant.email}</div>
                {workOrder.tenant.phone && (
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{workOrder.tenant.phone}</div>
                )}
                <div style={{ marginTop: '8px', fontSize: '13px' }}>
                  <span style={{ color: workOrder.entryPermissionGranted ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {workOrder.entryPermissionGranted ? '✓ Entry permitted' : '✗ Entry not permitted'}
                  </span>
                </div>
                {workOrder.preferredContactWindow && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Contact window: {workOrder.preferredContactWindow}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Timeline</h3>
              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div><span style={{ color: 'var(--color-text-muted)' }}>Created:</span> {new Date(workOrder.createdAt).toLocaleString()}</div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)' }}>Created by:</span>{' '}
                  {workOrder.submittedByUser
                    ? <><span style={{ textTransform: 'capitalize' }}>({workOrder.submittedByUser.role})</span> {workOrder.submittedByUser.name}</>
                    : 'Tenant'}
                </div>
                <div><span style={{ color: 'var(--color-text-muted)' }}>Updated:</span> {new Date(workOrder.updatedAt).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Assign Modal */}
      {showAssign && (
        <div className="modal-overlay" onClick={() => setShowAssign(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2>{isAssigned ? 'Reassign Work Order' : 'Assign Work Order'}</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowAssign(false)}>X</button>
            </div>
            <form onSubmit={handleAssignSubmit}>
              <div className="modal-body">
                {assignError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>{assignError}</div>
                )}
                {assignLoading ? (
                  <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Loading staff and vendors…</div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Staff Member</label>
                      <select value={assignStaffId} onChange={(e) => setAssignStaffId(e.target.value)}>
                        <option value="">— None —</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Vendor</label>
                      <select value={assignVendorId} onChange={(e) => setAssignVendorId(e.target.value)}>
                        <option value="">— None —</option>
                        {vendorList.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.companyName}{v.preferred ? ' ★' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!assignStaffId && !assignVendorId && (
                      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Select at least one assignee, or save with both empty to unassign.
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssign(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={assignSubmitting || assignLoading}>
                  {assignSubmitting ? 'Saving…' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Edit Details</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowEdit(false)}>X</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                {editError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>{editError}</div>
                )}
                <div className="form-group">
                  <label>Scheduled Date/Time</label>
                  <input
                    type="datetime-local"
                    value={editScheduledAt}
                    onChange={(e) => setEditScheduledAt(e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Labor Cost ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={editLaborCost}
                      onChange={(e) => setEditLaborCost(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Parts Cost ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={editPartsCost}
                      onChange={(e) => setEditPartsCost(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Resolution Notes</label>
                  <textarea
                    rows={4}
                    placeholder="What was done to resolve the issue..."
                    value={editResolutionNotes}
                    onChange={(e) => setEditResolutionNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editSubmitting}>
                  {editSubmitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
