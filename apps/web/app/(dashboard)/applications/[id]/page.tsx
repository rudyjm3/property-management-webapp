'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  approved: 'Approved',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-accent',
  under_review: 'badge-notice',
  approved: 'badge-occupied',
  denied: 'badge-danger',
  withdrawn: 'badge',
};

function fmt(date: string | null | undefined) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Approve modal
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [leaseStartDate, setLeaseStartDate] = useState('');
  const [leaseEndDate, setLeaseEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [approveNotes, setApproveNotes] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');

  // Deny modal
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [denyNotes, setDenyNotes] = useState('');
  const [denying, setDenying] = useState(false);
  const [denyError, setDenyError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const result = await api.applications.get(id);
      setApp(result);
      // Pre-fill lease amounts from unit defaults
      if (result?.unit) {
        setRentAmount(String(Number(result.unit.rentAmount)));
        setDepositAmount(String(Number(result.unit.depositAmount)));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load application.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleApprove() {
    if (!leaseStartDate || !leaseEndDate || !rentAmount) {
      setApproveError('Lease start date, end date, and rent amount are required.');
      return;
    }
    setApproving(true);
    setApproveError('');
    try {
      await api.applications.review(id, {
        status: 'approved',
        reviewNotes: approveNotes || null,
        leaseStartDate,
        leaseEndDate,
        rentAmount: parseFloat(rentAmount),
        depositAmount: depositAmount ? parseFloat(depositAmount) : undefined,
      });
      setShowApproveModal(false);
      await load();
    } catch (err: any) {
      setApproveError(err.message || 'Failed to approve application.');
    } finally {
      setApproving(false);
    }
  }

  async function handleDeny() {
    setDenying(true);
    setDenyError('');
    try {
      await api.applications.review(id, { status: 'denied', reviewNotes: denyNotes || null });
      setShowDenyModal(false);
      await load();
    } catch (err: any) {
      setDenyError(err.message || 'Failed to deny application.');
    } finally {
      setDenying(false);
    }
  }

  if (loading) return <div className="main-content"><p style={{ color: '#6b7280' }}>Loading…</p></div>;
  if (error) return <div className="main-content"><p style={{ color: '#dc2626' }}>{error}</p></div>;
  if (!app) return null;

  const canReview = app.status !== 'approved' && app.status !== 'denied' && app.status !== 'withdrawn' && app.submittedAt;

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <button
              onClick={() => router.push('/applications')}
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, fontSize: '14px' }}
            >
              ← Applications
            </button>
          </div>
          <h1 className="page-title">
            {app.applicantName || 'Pending Submission'}
            <span className={`badge ${STATUS_BADGE[app.status] ?? 'badge'}`} style={{ marginLeft: '10px', verticalAlign: 'middle', fontSize: '13px' }}>
              {STATUS_LABELS[app.status] ?? app.status}
            </span>
          </h1>
          <p className="page-subtitle">
            {app.unit.property.name} — Unit {app.unit.unitNumber}
          </p>
        </div>
        {canReview && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => { setDenyNotes(''); setShowDenyModal(true); }}>
              Deny
            </button>
            <button className="btn btn-primary" onClick={() => setShowApproveModal(true)}>
              Approve
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', alignItems: 'start' }}>
        {/* Left — Applicant Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Personal Info */}
          <div className="card">
            <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Personal Information</h2>
            <div className="detail-grid">
              <div className="detail-item"><span className="detail-label">Full Name</span><span className="detail-value">{app.applicantName || '—'}</span></div>
              <div className="detail-item"><span className="detail-label">Email</span><span className="detail-value">{app.applicantEmail || '—'}</span></div>
              <div className="detail-item"><span className="detail-label">Phone</span><span className="detail-value">{app.applicantPhone || '—'}</span></div>
              <div className="detail-item"><span className="detail-label">Date of Birth</span><span className="detail-value">{fmt(app.dateOfBirth)}</span></div>
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}><span className="detail-label">Current Address</span><span className="detail-value">{app.currentAddress || '—'}</span></div>
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}><span className="detail-label">Previous Address</span><span className="detail-value">{app.previousAddress || '—'}</span></div>
            </div>
          </div>

          {/* Employment */}
          <div className="card">
            <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Employment & Income</h2>
            <div className="detail-grid">
              <div className="detail-item"><span className="detail-label">Employer</span><span className="detail-value">{app.employerName || '—'}</span></div>
              <div className="detail-item"><span className="detail-label">Employer Phone</span><span className="detail-value">{app.employerPhone || '—'}</span></div>
              <div className="detail-item"><span className="detail-label">Monthly Gross Income</span><span className="detail-value">{app.monthlyGrossIncome ? `$${Number(app.monthlyGrossIncome).toLocaleString()}` : '—'}</span></div>
              <div className="detail-item"><span className="detail-label">Income Source</span><span className="detail-value" style={{ textTransform: 'capitalize' }}>{app.incomeSource?.replace('_', ' ') || '—'}</span></div>
            </div>
          </div>

          {/* Household */}
          <div className="card">
            <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Household</h2>
            <div className="detail-grid">
              <div className="detail-item"><span className="detail-label">Occupants</span><span className="detail-value">{app.occupantCount}</span></div>
              <div className="detail-item"><span className="detail-label">Emergency Contact</span><span className="detail-value">{app.emergencyContactName || '—'}{app.emergencyContactPhone ? ` · ${app.emergencyContactPhone}` : ''}</span></div>
            </div>
            {app.pets && (app.pets as any[]).length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Pets</p>
                {(app.pets as any[]).map((pet: any, i: number) => (
                  <p key={i} style={{ margin: '0 0 4px', fontSize: '14px' }}>
                    {pet.name} — {pet.type}{pet.breed ? `, ${pet.breed}` : ''}{pet.weight ? `, ${pet.weight} lbs` : ''}
                  </p>
                ))}
              </div>
            )}
            {app.vehicles && (app.vehicles as any[]).length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>Vehicles</p>
                {(app.vehicles as any[]).map((v: any, i: number) => (
                  <p key={i} style={{ margin: '0 0 4px', fontSize: '14px' }}>
                    {v.color} {v.make} {v.model} — {v.plate} ({v.state})
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Consent */}
          <div className="card">
            <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Authorization</h2>
            <div className="detail-grid">
              <div className="detail-item"><span className="detail-label">Consent Given</span><span className="detail-value">{app.consentGiven ? 'Yes' : 'No'}</span></div>
              <div className="detail-item"><span className="detail-label">Consent Date</span><span className="detail-value">{fmt(app.consentAt)}</span></div>
            </div>
          </div>
        </div>

        {/* Right — Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card">
            <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Timeline</h2>
            <div style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Link created</span>
                <span>{fmt(app.createdAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Submitted</span>
                <span>{app.submittedAt ? fmt(app.submittedAt) : <span style={{ color: '#9ca3af' }}>Not yet</span>}</span>
              </div>
              {app.reviewedAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Reviewed</span>
                  <span>{fmt(app.reviewedAt)}</span>
                </div>
              )}
            </div>

            {app.reviewNotes && (
              <div style={{ marginTop: '12px', padding: '10px', background: '#f9fafb', borderRadius: '6px', fontSize: '13px', lineHeight: '1.5' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>REVIEW NOTES</p>
                <p style={{ margin: 0 }}>{app.reviewNotes}</p>
              </div>
            )}
          </div>

          <div className="card">
            <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600 }}>Unit</h2>
            <div style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><span style={{ color: '#6b7280' }}>Property: </span>{app.unit.property.name}</div>
              <div><span style={{ color: '#6b7280' }}>Unit: </span>{app.unit.unitNumber}</div>
              <div><span style={{ color: '#6b7280' }}>Rent: </span>${Number(app.unit.rentAmount).toLocaleString()}/mo</div>
              <div><span style={{ color: '#6b7280' }}>Deposit: </span>${Number(app.unit.depositAmount).toLocaleString()}</div>
            </div>
          </div>

          {app.createdTenantId && (
            <div className="card">
              <h2 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600 }}>Tenant Created</h2>
              <Link href={`/tenants/${app.createdTenantId}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none', display: 'inline-block' }}>
                View Tenant Profile →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="modal-overlay" onClick={() => setShowApproveModal(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Approve Application</h2>
              <button className="modal-close" onClick={() => setShowApproveModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '14px', color: '#374151', margin: '0 0 16px' }}>
                Approving will create a tenant account for <strong>{app.applicantName}</strong> and generate a draft lease. A signing link will be emailed to them.
              </p>
              <div className="form-row">
                <div className="form-group">
                  <label>Lease Start Date *</label>
                  <input type="date" className="form-control" value={leaseStartDate} onChange={(e) => setLeaseStartDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Lease End Date *</label>
                  <input type="date" className="form-control" value={leaseEndDate} onChange={(e) => setLeaseEndDate(e.target.value)} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Monthly Rent ($) *</label>
                  <input type="number" min="0" step="0.01" className="form-control" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Security Deposit ($)</label>
                  <input type="number" min="0" step="0.01" className="form-control" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea className="form-control" rows={2} value={approveNotes} onChange={(e) => setApproveNotes(e.target.value)} />
              </div>
              {approveError && <p style={{ color: '#dc2626', fontSize: '14px', margin: '8px 0 0' }}>{approveError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowApproveModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleApprove} disabled={approving}>
                {approving ? 'Approving…' : 'Approve & Create Lease'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deny Modal */}
      {showDenyModal && (
        <div className="modal-overlay" onClick={() => setShowDenyModal(false)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Deny Application</h2>
              <button className="modal-close" onClick={() => setShowDenyModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '14px', color: '#374151', margin: '0 0 16px' }}>
                The applicant will receive an email notifying them that the application was not approved.
              </p>
              <div className="form-group">
                <label>Notes (optional — not sent to applicant)</label>
                <textarea className="form-control" rows={3} value={denyNotes} onChange={(e) => setDenyNotes(e.target.value)} />
              </div>
              {denyError && <p style={{ color: '#dc2626', fontSize: '14px', margin: '8px 0 0' }}>{denyError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDenyModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeny} disabled={denying}>
                {denying ? 'Denying…' : 'Deny Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
