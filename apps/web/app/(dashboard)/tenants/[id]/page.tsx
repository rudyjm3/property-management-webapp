'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import PhoneInput from '@/components/PhoneInput';
import DocumentPanel from '@/components/DocumentPanel';
import { useAuth } from '@/contexts/AuthContext';

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PORTAL_STATUS_LABELS: Record<string, string> = {
  active: 'Portal Active',
  invited: 'Invited',
  never_logged_in: 'Not Invited',
};

const PORTAL_STATUS_BADGE: Record<string, string> = {
  active: 'occupied',
  invited: 'muted',
  never_logged_in: 'vacant',
};

interface TenantDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  fullLegalName: string | null;
  dateOfBirth: string | null;
  currentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContact1Relationship: string | null;
  portalStatus: string;
  createdAt: string;
  leaseParticipants: Array<{
    isPrimary: boolean;
    lease: {
      id: string;
      startDate: string;
      endDate: string;
      rentAmount: string;
      depositAmount: string;
      moveOutDate: string | null;
      status: string;
      unit: {
        id: string;
        unitNumber: string;
        propertyId: string;
        property: { id: string; name: string; address: string };
      };
    };
  }>;
  payments: Array<{
    id: string;
    amount: string;
    type: string;
    status: string;
    dueDate: string;
    paidDate: string | null;
    createdAt: string;
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

interface MessageThread {
  threadId: string;
  subject: string | null;
  latestMessage: { createdAt: string; body: string };
  tenant: { id: string; name: string } | null;
  unreadCount: number;
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return '--';
  return new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC' });
}

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;
  const { profile } = useAuth();
  const isMaintenance = profile?.role === 'maintenance';
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState('');
  const composeBodyRef = useRef<HTMLTextAreaElement>(null);
  const [showMoveOut, setShowMoveOut] = useState(false);
  const [moveOutLeaseId, setMoveOutLeaseId] = useState<string | null>(null);
  const [moveOutDepositAmount, setMoveOutDepositAmount] = useState(0);
  const [moveOutNoticeDate, setMoveOutNoticeDate] = useState<string | null>(null);
  const [moveOutDate, setMoveOutDate] = useState('');
  const [moveOutDeductions, setMoveOutDeductions] = useState<{ reason: string; amount: string }[]>([]);
  const [moveOutNotes, setMoveOutNotes] = useState('');
  const [moveOutSubmitting, setMoveOutSubmitting] = useState(false);
  const [moveOutError, setMoveOutError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [data, threadData] = await Promise.all([
          api.tenants.get(tenantId),
          api.messages.threads.list(tenantId).catch(() => []),
        ]);
        setTenant(data);
        setThreads(threadData);
      } catch (err) {
        console.error('Failed to load tenant:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantId]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!composeBody.trim() || !profile?.userId) return;
    setComposeError('');
    setComposeSending(true);
    try {
      await api.messages.send({
        senderUserId: profile.userId,
        recipientTenantId: tenantId,
        body: composeBody.trim(),
        subject: composeSubject.trim() || null,
      });
      setComposeSubject('');
      setComposeBody('');
      setShowCompose(false);
      const updated = await api.messages.threads.list(tenantId).catch(() => []);
      setThreads(updated);
    } catch (err: any) {
      setComposeError(err.message || 'Failed to send message');
    } finally {
      setComposeSending(false);
    }
  }

  async function handleMoveOut(e: React.FormEvent) {
    e.preventDefault();
    if (!moveOutLeaseId || !moveOutDate) return;
    const hasPartialRow = moveOutDeductions.some((d) => {
      const hasReason = d.reason.trim().length > 0;
      const hasAmount = d.amount.trim().length > 0;
      return hasReason !== hasAmount;
    });
    if (hasPartialRow) {
      setMoveOutError('Each deduction must have both a reason and an amount.');
      return;
    }
    setMoveOutSubmitting(true);
    setMoveOutError('');
    try {
      const parsedDeductions = moveOutDeductions
        .filter((d) => d.reason.trim() && d.amount)
        .map((d) => ({ reason: d.reason.trim(), amount: parseFloat(d.amount) }));
      await api.leases.moveOut(moveOutLeaseId, {
        moveOutDate,
        deductions: parsedDeductions,
        notes: moveOutNotes.trim() || null,
      });
      const updated = await api.tenants.get(tenantId);
      setTenant(updated);
      setShowMoveOut(false);
    } catch (err: any) {
      setMoveOutError(err.message || 'Failed to process move-out.');
    } finally {
      setMoveOutSubmitting(false);
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    try {
      const updated = await api.tenants.update(tenantId, {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone') || null,
        fullLegalName: (formData.get('fullLegalName') as string) || null,
        dateOfBirth: (formData.get('dateOfBirth') as string) || null,
        currentAddress: (formData.get('currentAddress') as string) || null,
        emergencyContactName: formData.get('emergencyContactName') || null,
        emergencyContactPhone: formData.get('emergencyContactPhone') || null,
        emergencyContact1Relationship:
          (formData.get('emergencyContact1Relationship') as string) || null,
      });
      setTenant((prev) => (prev ? { ...prev, ...updated } : prev));
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update tenant');
    }
  }

  async function handleInvitePortal() {
    if (!confirm(`Send a portal invite email to ${tenant!.email}?`)) return;
    setInviting(true);
    try {
      await api.tenants.invitePortal(tenantId);
      setTenant((prev) => (prev ? { ...prev, portalStatus: 'invited' } : prev));
      alert('Invite sent! The tenant will receive an email to set their password.');
    } catch (err: any) {
      alert(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to remove this tenant? This cannot be undone.')) return;
    try {
      await api.tenants.delete(tenantId);
      router.push('/tenants');
    } catch (err: any) {
      alert(err.message || 'Failed to delete tenant');
    }
  }

  if (loading) return <div className="loading">Loading tenant...</div>;
  if (!tenant) return <div className="loading">Tenant not found</div>;

  const CURRENT_LEASE_STATUSES = ['active', 'month_to_month', 'notice_given'];
  const currentLeases = tenant.leaseParticipants.filter((lp) =>
    CURRENT_LEASE_STATUSES.includes(lp.lease.status)
  );
  const activeLease = currentLeases[0] ?? null;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/tenants">Tenants</Link>
        <span>/</span>
        <span>{tenant.name}</span>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">{tenant.name}</h1>
          <p
            className="page-subtitle"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            Tenant since {new Date(tenant.createdAt).toLocaleDateString()}
            <span className={`badge badge-${PORTAL_STATUS_BADGE[tenant.portalStatus] ?? 'vacant'}`}>
              {PORTAL_STATUS_LABELS[tenant.portalStatus] ?? tenant.portalStatus}
            </span>
          </p>
        </div>
        {!isMaintenance && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {(tenant.portalStatus === 'never_logged_in' || tenant.portalStatus === 'invited') && (
              <button className="btn btn-primary" onClick={handleInvitePortal} disabled={inviting}>
                {inviting
                  ? 'Sending…'
                  : tenant.portalStatus === 'invited'
                    ? 'Resend Invite'
                    : 'Invite to Portal'}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              className="btn btn-secondary"
              style={{ color: 'var(--color-danger)' }}
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Contact Info */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
              Contact Information
            </h3>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Email</label>
                <span>{tenant.email}</span>
              </div>
              <div className="detail-item">
                <label>Phone</label>
                <span>{formatPhone(tenant.phone)}</span>
              </div>
              {!isMaintenance && tenant.fullLegalName && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Full Legal Name</label>
                  <span>{tenant.fullLegalName}</span>
                </div>
              )}
              {!isMaintenance && tenant.dateOfBirth && (
                <div className="detail-item">
                  <label>Date of Birth</label>
                  <span>{new Date(tenant.dateOfBirth).toLocaleDateString()}</span>
                </div>
              )}
              {!isMaintenance && tenant.currentAddress && (
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Current Address</label>
                  <span>{tenant.currentAddress}</span>
                </div>
              )}
              {!isMaintenance && (
                <>
                  <div className="detail-item">
                    <label>Emergency Contact</label>
                    <span>
                      {tenant.emergencyContactName || '--'}
                      {tenant.emergencyContact1Relationship && (
                        <span
                          style={{
                            color: 'var(--color-text-muted)',
                            marginLeft: '6px',
                            fontSize: '13px',
                          }}
                        >
                          ({tenant.emergencyContact1Relationship})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Emergency Phone</label>
                    <span>{formatPhone(tenant.emergencyContactPhone)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Current Lease */}
        {!isMaintenance && (
          <div className="card">
            <div className="card-body">
              <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
                Current Lease
              </h3>
              {currentLeases.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px' }}>
                  <p>No active lease</p>
                </div>
              ) : (
                <>
                  {currentLeases.length > 1 && (
                    <div
                      style={{
                        marginBottom: '12px',
                        fontSize: '13px',
                        color: '#ca8a04',
                        fontWeight: 500,
                      }}
                    >
                      This tenant is on {currentLeases.length} active leases.
                    </div>
                  )}
                  {currentLeases.map((lp, i) => (
                    <div
                      key={lp.lease.id}
                      style={
                        i > 0
                          ? {
                              marginTop: '16px',
                              paddingTop: '16px',
                              borderTop: '1px solid var(--color-border)',
                            }
                          : {}
                      }
                    >
                      <div className="detail-grid">
                        <div className="detail-item">
                          <label>Property</label>
                          <Link
                            href={`/properties/${lp.lease.unit.property.id}`}
                            style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                          >
                            {lp.lease.unit.property.name}
                          </Link>
                        </div>
                        <div className="detail-item">
                          <label>Unit</label>
                          <Link
                            href={`/properties/${lp.lease.unit.property.id}/units/${lp.lease.unit.id}`}
                            style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                          >
                            Unit {lp.lease.unit.unitNumber}
                          </Link>
                        </div>
                        <div className="detail-item">
                          <label>Lease Start</label>
                          <span>{formatDateOnly(lp.lease.startDate)}</span>
                        </div>
                        <div className="detail-item">
                          <label>Lease End</label>
                          <span>{formatDateOnly(lp.lease.endDate)}</span>
                        </div>
                        <div className="detail-item">
                          <label>Monthly Rent</label>
                          <span>${Number(lp.lease.rentAmount).toLocaleString()}</span>
                        </div>
                        <div className="detail-item">
                          <label>Status</label>
                          <span className="badge badge-occupied">
                            {lp.lease.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                      {lp.lease.status === 'notice_given' && (
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              setMoveOutLeaseId(lp.lease.id);
                              setMoveOutDepositAmount(Number(lp.lease.depositAmount));
                              setMoveOutNoticeDate(lp.lease.moveOutDate ? lp.lease.moveOutDate.split('T')[0] : null);
                              setMoveOutDate('');
                              setMoveOutDeductions([]);
                              setMoveOutNotes('');
                              setMoveOutError('');
                              setShowMoveOut(true);
                            }}
                          >
                            Move Out
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lease History */}
      {!isMaintenance && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
              Lease History ({tenant.leaseParticipants.length})
            </h3>
            {tenant.leaseParticipants.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <p>No lease history</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Unit</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Rent</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenant.leaseParticipants.map((lp) => (
                      <tr key={lp.lease.id}>
                        <td>{lp.lease.unit.property.name}</td>
                        <td>Unit {lp.lease.unit.unitNumber}</td>
                        <td>{formatDateOnly(lp.lease.startDate)}</td>
                        <td>{formatDateOnly(lp.lease.endDate)}</td>
                        <td>${Number(lp.lease.rentAmount).toLocaleString()}</td>
                        <td>
                          <span
                            className={`badge badge-${lp.lease.status === 'active' || lp.lease.status === 'month_to_month' ? 'occupied' : lp.lease.status === 'notice_given' ? 'notice' : lp.lease.status === 'expired' ? 'muted' : lp.lease.status === 'terminated' ? 'danger' : 'vacant'}`}
                          >
                            {lp.lease.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Work Orders */}
      {tenant.workOrders.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-body">
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
              Recent Work Orders ({tenant.workOrders.length})
            </h3>
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
                  {tenant.workOrders.map((wo) => (
                    <tr key={wo.id}>
                      <td>{new Date(wo.createdAt).toLocaleDateString()}</td>
                      <td style={{ textTransform: 'capitalize' }}>{wo.category}</td>
                      <td>
                        <span
                          className={`badge badge-${wo.priority === 'urgent' || wo.priority === 'emergency' ? 'notice' : 'occupied'}`}
                        >
                          {wo.priority}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge badge-${wo.status === 'completed' ? 'occupied' : wo.status === 'new_order' ? 'vacant' : 'maintenance'}`}
                        >
                          {wo.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td
                        style={{
                          maxWidth: '300px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {wo.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-body">
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
            Payment History ({tenant.payments.length})
          </h3>
          {tenant.payments.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
              No payment records yet.
            </p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Due Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {new Date(p.dueDate).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{p.type.replace('_', ' ')}</td>
                      <td style={{ fontWeight: 600 }}>${Number(p.amount).toLocaleString()}</td>
                      <td>
                        <span
                          className={`badge badge-${p.status === 'completed' ? 'occupied' : p.status === 'pending' ? 'notice' : 'vacant'}`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-body">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Messages ({threads.length})</h3>
            {!isMaintenance && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setShowCompose(true);
                  setTimeout(() => composeBodyRef.current?.focus(), 50);
                }}
              >
                New Message
              </button>
            )}
          </div>

          {showCompose && (
            <form
              onSubmit={handleSendMessage}
              style={{
                marginBottom: '16px',
                padding: '16px',
                background: 'var(--color-bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
              }}
            >
              {composeError && (
                <p style={{ color: 'var(--color-danger)', fontSize: '13px', marginBottom: '8px' }}>
                  {composeError}
                </p>
              )}
              <div className="form-group" style={{ marginBottom: '10px' }}>
                <label>Subject (optional)</label>
                <input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="e.g. Rent reminder, Maintenance update..."
                />
              </div>
              <div className="form-group" style={{ marginBottom: '10px' }}>
                <label>Message</label>
                <textarea
                  ref={composeBodyRef}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  rows={3}
                  required
                  placeholder="Type your message..."
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-sm btn-primary" disabled={composeSending}>
                  {composeSending ? 'Sending...' : 'Send'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setShowCompose(false);
                    setComposeError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {threads.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>No messages yet.</p>
          ) : (
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {threads.map((thread, i) => (
                <Link
                  key={thread.threadId}
                  href="/messages"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom:
                      i < threads.length - 1 ? '1px solid var(--color-border)' : undefined,
                    textDecoration: 'none',
                    color: 'inherit',
                    background: thread.unreadCount > 0 ? 'var(--color-bg-secondary)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {thread.unreadCount > 0 && (
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--color-primary)',
                          flexShrink: 0,
                          display: 'inline-block',
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: thread.unreadCount > 0 ? 600 : 400,
                          fontSize: '14px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {thread.subject ||
                          (thread.tenant?.name
                            ? `Message from ${thread.tenant.name}`
                            : 'No subject')}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--color-text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {thread.latestMessage.body}
                      </div>
                    </div>
                    {thread.unreadCount > 0 && (
                      <span
                        style={{
                          background: 'var(--color-primary)',
                          color: 'white',
                          borderRadius: '12px',
                          padding: '1px 7px',
                          fontSize: '11px',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-text-muted)',
                      flexShrink: 0,
                      marginLeft: '16px',
                    }}
                  >
                    {thread.latestMessage?.createdAt
                      ? new Date(thread.latestMessage.createdAt).toLocaleDateString()
                      : ''}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Tenant</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setEditing(false)}>
                X
              </button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                {error && (
                  <div
                    style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}
                  >
                    {error}
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input name="name" required defaultValue={tenant.name} />
                  </div>
                  <div className="form-group">
                    <label>Full Legal Name</label>
                    <input name="fullLegalName" defaultValue={tenant.fullLegalName || ''} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input name="email" type="email" required defaultValue={tenant.email} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Phone</label>
                    <PhoneInput name="phone" defaultValue={tenant.phone} />
                  </div>
                  <div className="form-group">
                    <label>Date of Birth</label>
                    <input
                      name="dateOfBirth"
                      type="date"
                      defaultValue={tenant.dateOfBirth ? tenant.dateOfBirth.slice(0, 10) : ''}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Current Address</label>
                  <input
                    name="currentAddress"
                    defaultValue={tenant.currentAddress || ''}
                    placeholder="123 Main St, City, ST 00000"
                  />
                </div>
                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--color-border)',
                  }}
                >
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-text-muted)',
                      marginBottom: '12px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Emergency Contact 1
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Name</label>
                      <input
                        name="emergencyContactName"
                        defaultValue={tenant.emergencyContactName || ''}
                      />
                    </div>
                    <div className="form-group">
                      <label>Phone</label>
                      <PhoneInput
                        name="emergencyContactPhone"
                        defaultValue={tenant.emergencyContactPhone}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Relationship</label>
                    <input
                      name="emergencyContact1Relationship"
                      defaultValue={tenant.emergencyContact1Relationship || ''}
                      placeholder="e.g. Spouse, Parent, Sibling"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditing(false)}
                >
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

      {/* Move-Out Modal */}
      {showMoveOut && (
        <div className="modal-overlay" onClick={() => setShowMoveOut(false)}>
          <div className="modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Process Move-Out</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowMoveOut(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleMoveOut}>
              <div className="modal-body">
                {moveOutError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>
                    {moveOutError}
                  </div>
                )}

                {/* Notice move-out date reference */}
                {moveOutNoticeDate && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--color-surface)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      marginBottom: '16px',
                      fontSize: '13px',
                    }}
                  >
                    <span style={{ color: 'var(--color-text-muted)' }}>Move-Out Date (from Notice)</span>
                    <span style={{ fontWeight: 600 }}>
                      {new Date(moveOutNoticeDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}

                {/* Move-out date */}
                <div className="form-group">
                  <label>
                    Actual Move-Out Date <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    max={localDateStr()}
                    value={moveOutDate}
                    onChange={(e) => setMoveOutDate(e.target.value)}
                  />
                </div>

                {/* Deposit summary */}
                <div
                  style={{
                    background: 'var(--color-surface)',
                    borderRadius: '6px',
                    padding: '12px',
                    marginBottom: '16px',
                    fontSize: '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Security Deposit</span>
                    <span>${moveOutDepositAmount.toFixed(2)}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                      color: 'var(--color-danger)',
                    }}
                  >
                    <span>Total Deductions</span>
                    <span>
                      -$
                      {moveOutDeductions
                        .filter((d) => d.reason.trim() && d.amount).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
                        .toFixed(2)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: 600,
                      borderTop: '1px solid var(--color-border)',
                      paddingTop: '4px',
                      marginTop: '4px',
                    }}
                  >
                    <span>Return Amount</span>
                    <span style={{ color: 'var(--color-success)' }}>
                      $
                      {Math.max(
                        0,
                        moveOutDepositAmount -
                          moveOutDeductions.filter((d) => d.reason.trim() && d.amount).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Deduction line items */}
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <label style={{ fontWeight: 500 }}>Deductions</label>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() =>
                        setMoveOutDeductions([...moveOutDeductions, { reason: '', amount: '' }])
                      }
                    >
                      + Add Deduction
                    </button>
                  </div>
                  {moveOutDeductions.map((d, idx) => (
                    <div
                      key={idx}
                      style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}
                    >
                      <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                        <input
                          placeholder="Reason (e.g. Cleaning)"
                          value={d.reason}
                          onChange={(e) => {
                            const next = [...moveOutDeductions];
                            next[idx] = { ...next[idx], reason: e.target.value };
                            setMoveOutDeductions(next);
                          }}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Amount"
                          value={d.amount}
                          onChange={(e) => {
                            const next = [...moveOutDeductions];
                            next[idx] = { ...next[idx], amount: e.target.value };
                            setMoveOutDeductions(next);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() =>
                          setMoveOutDeductions(moveOutDeductions.filter((_, i) => i !== idx))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {moveOutDeductions.length === 0 && (
                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      No deductions — full deposit will be returned.
                    </p>
                  )}
                </div>

                {/* Notes */}
                <div className="form-group">
                  <label>Notes (optional)</label>
                  <textarea
                    rows={3}
                    value={moveOutNotes}
                    onChange={(e) => setMoveOutNotes(e.target.value)}
                    placeholder="Any additional notes about the move-out..."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowMoveOut(false)}
                  disabled={moveOutSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger" disabled={moveOutSubmitting}>
                  {moveOutSubmitting ? 'Processing...' : 'Confirm Move-Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!isMaintenance && <DocumentPanel entityType="tenant" entityId={tenantId} />}
    </>
  );
}
