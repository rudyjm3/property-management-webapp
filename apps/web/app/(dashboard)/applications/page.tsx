'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

interface ApplicationItem {
  id: string;
  status: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string | null;
  submittedAt: string | null;
  createdAt: string;
  unit: { unitNumber: string; property: { name: string } };
}

export default function ApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // Generate link modal
  const [showModal, setShowModal] = useState(false);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [modalError, setModalError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const result = await api.applications.list({
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setApplications((result as any).data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter, search]);

  async function openModal() {
    setShowModal(true);
    setGeneratedUrl('');
    setModalError('');
    setSelectedUnitId('');
    try {
      // Fetch all properties then units — find vacant units
      const props = await api.properties.list();
      const allUnits: any[] = [];
      for (const p of (props as any[])) {
        const us = await api.units.list(p.id);
        (us as any[]).forEach((u: any) => allUnits.push({ ...u, propertyName: p.name }));
      }
      setUnits(allUnits.filter((u) => u.status === 'vacant' || u.status === 'notice'));
    } catch {
      setModalError('Failed to load units.');
    }
  }

  async function generateLink() {
    if (!selectedUnitId) { setModalError('Please select a unit.'); return; }
    setGenerating(true);
    setModalError('');
    try {
      const result = await api.applications.generateLink(selectedUnitId);
      setGeneratedUrl((result as any).url);
    } catch (err: any) {
      setModalError(err.message || 'Failed to generate link.');
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(generatedUrl).catch(() => {});
  }

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">Review and manage rental applications</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>+ Generate Application Link</button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          className="filter-search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <p style={{ padding: '24px', color: '#6b7280' }}>Loading…</p>
        ) : applications.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: '#6b7280', marginBottom: '8px' }}>No applications yet.</p>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Generate an application link and share it with prospective tenants.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Unit</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} onClick={() => router.push(`/applications/${app.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{app.applicantName || <span style={{ color: '#9ca3af' }}>Not submitted</span>}</div>
                      {app.applicantEmail && <div style={{ fontSize: '13px', color: '#6b7280' }}>{app.applicantEmail}</div>}
                    </td>
                    <td>
                      <div>{app.unit.property.name}</div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>Unit {app.unit.unitNumber}</div>
                    </td>
                    <td style={{ fontSize: '14px', color: '#374151' }}>
                      {app.submittedAt
                        ? new Date(app.submittedAt).toLocaleDateString()
                        : <span style={{ color: '#9ca3af' }}>—</span>
                      }
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[app.status] ?? 'badge'}`}>
                        {STATUS_LABELS[app.status] ?? app.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => { e.stopPropagation(); router.push(`/applications/${app.id}`); }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Link Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Generate Application Link</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {!generatedUrl ? (
                <>
                  <div className="form-group">
                    <label>Select Unit *</label>
                    <select
                      className="form-control"
                      value={selectedUnitId}
                      onChange={(e) => setSelectedUnitId(e.target.value)}
                    >
                      <option value="">Select a unit…</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.propertyName} — Unit {u.unitNumber} (${Number(u.rentAmount).toLocaleString()}/mo)
                        </option>
                      ))}
                    </select>
                    {units.length === 0 && !modalError && (
                      <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Loading vacant units…</p>
                    )}
                  </div>
                  {modalError && <p style={{ color: '#dc2626', fontSize: '14px' }}>{modalError}</p>}
                </>
              ) : (
                <div>
                  <p style={{ fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
                    Share this link with prospective tenants. It's unique to the selected unit.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      className="form-control"
                      value={generatedUrl}
                      readOnly
                      style={{ flex: 1, fontSize: '13px', background: '#f9fafb' }}
                    />
                    <button className="btn btn-secondary btn-sm" onClick={copyToClipboard} style={{ whiteSpace: 'nowrap' }}>
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {generatedUrl ? 'Close' : 'Cancel'}
              </button>
              {!generatedUrl && (
                <button className="btn btn-primary" onClick={generateLink} disabled={generating}>
                  {generating ? 'Generating…' : 'Generate Link'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
