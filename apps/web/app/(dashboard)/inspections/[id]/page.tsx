'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { exportInspectionPdf } from '@/lib/exportInspectionPdf';

interface ChecklistResult {
  section: string;
  item: string;
  condition?: string | null;
  notes?: string | null;
}

interface Media {
  id: string;
  storageKey: string;
  mediaType: string;
  capturedAt: string;
  latitude: string | null;
  longitude: string | null;
}

interface Inspection {
  id: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  checklistResults: ChecklistResult[];
  inspector: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
  media: Media[];
  tenantSignatureName: string | null;
  tenantSignatureAt: string | null;
  managerSignatureName: string | null;
  managerSignatureAt: string | null;
}

const CONDITIONS = ['good', 'fair', 'damaged', 'needs_repair', 'n/a'];

export default function InspectionDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const inspectionId = params.id as string;
  const propertyId = searchParams.get('propertyId') || '';
  const unitId = searchParams.get('unitId') || '';

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checklist, setChecklist] = useState<ChecklistResult[]>([]);
  const [notes, setNotes] = useState('');
  const [tenantSignature, setTenantSignature] = useState('');
  const [managerSignature, setManagerSignature] = useState('');
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEditable = inspection && inspection.status !== 'completed' && inspection.status !== 'cancelled';

  const load = useCallback(async () => {
    if (!propertyId || !unitId) {
      setError('Missing property/unit context.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.inspections.get(propertyId, unitId, inspectionId);
      setInspection(data);
      setNotes(data.notes ?? '');

      if (data.checklistResults && data.checklistResults.length > 0) {
        setChecklist(data.checklistResults);
      } else {
        // Seed the checklist from the assigned template, or the org default.
        let items: { section: string; item: string; description?: string }[] = [];
        if (data.template?.id) {
          const tpl = await api.inspectionTemplates.get(data.template.id);
          items = tpl.checklistItems ?? [];
        } else {
          const templates = await api.inspectionTemplates.list();
          const def = templates.find((t: any) => t.isDefault) ?? templates[0];
          items = def?.checklistItems ?? [];
        }
        setChecklist(items.map((i) => ({ section: i.section, item: i.item, condition: '', notes: '' })));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load inspection.');
    } finally {
      setLoading(false);
    }
  }, [propertyId, unitId, inspectionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.staff.list().then(setStaff).catch(() => setStaff([]));
  }, []);

  function updateItem(index: number, field: 'condition' | 'notes', value: string) {
    setChecklist((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  async function handleAssignInspector(userId: string) {
    if (!inspection) return;
    try {
      const updated = await api.inspections.update(propertyId, unitId, inspectionId, {
        inspectorUserId: userId || null,
      });
      setInspection(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to assign inspector.');
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !inspection) return;
    setUploading(true);
    setError('');
    try {
      const { uploadUrl, storageKey } = await api.inspections.requestMediaUploadUrl(
        propertyId,
        unitId,
        inspectionId,
        file.name,
        file.type
      );
      await api.inspections.uploadToStorage(uploadUrl, file, file.type);

      // GPS is best-effort — only populated if the browser grants permission.
      // This is unverified beyond this code path in a non-mobile session;
      // see docs/reference/modules.md.
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        } catch {
          // Permission denied or unavailable — proceed without GPS.
        }
      }

      await api.inspections.attachMedia(propertyId, unitId, inspectionId, {
        storageKey,
        mediaType: file.type.startsWith('video') ? 'video' : 'photo',
        capturedAt: new Date().toISOString(),
        latitude,
        longitude,
      });

      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to upload media.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleComplete() {
    setSubmitting(true);
    setError('');
    try {
      const updated = await api.inspections.complete(propertyId, unitId, inspectionId, {
        checklistResults: checklist,
        notes: notes || null,
        tenantSignatureName: tenantSignature || undefined,
        managerSignatureName: managerSignature || undefined,
      });
      setInspection(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to complete inspection.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel this inspection?')) return;
    try {
      const updated = await api.inspections.cancel(propertyId, unitId, inspectionId);
      setInspection(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to cancel inspection.');
    }
  }

  function handleDownloadPdf() {
    if (!inspection) return;
    exportInspectionPdf(`inspection-${inspection.id}.pdf`, `Unit inspection`, {
      ...inspection,
      checklistResults: checklist,
    });
  }

  if (loading) return <div className="page-content">Loading…</div>;
  if (error && !inspection) return <div className="page-content">{error}</div>;
  if (!inspection) return null;

  return (
    <div className="page-content">
      <button className="btn btn-secondary" onClick={() => router.back()} style={{ marginBottom: '16px' }}>
        ← Back
      </button>

      <div className="card">
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700 }}>
              {inspection.type.replace(/_/g, ' ')} inspection
            </h1>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={handleDownloadPdf}>
                Download Report PDF
              </button>
              {isEditable && (
                <button className="btn btn-secondary" onClick={handleCancel}>
                  Cancel Inspection
                </button>
              )}
            </div>
          </div>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Status: {inspection.status.replace(/_/g, ' ')}
            {inspection.completedAt ? ` · Completed ${new Date(inspection.completedAt).toLocaleString()}` : ''}
          </p>

          {error && <div style={{ color: 'var(--color-danger)', marginTop: '12px' }}>{error}</div>}

          {isEditable && (
            <div className="form-group" style={{ marginTop: '16px', maxWidth: '320px' }}>
              <label>Assigned Inspector</label>
              <select value={inspection.inspector?.id ?? ''} onChange={(e) => handleAssignInspector(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-body">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Checklist</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Item</th>
                <th>Condition</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {checklist.map((it, idx) => (
                <tr key={`${it.section}-${it.item}-${idx}`}>
                  <td>{it.section}</td>
                  <td>{it.item}</td>
                  <td>
                    {isEditable ? (
                      <select value={it.condition ?? ''} onChange={(e) => updateItem(idx, 'condition', e.target.value)}>
                        <option value="">—</option>
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      it.condition || '—'
                    )}
                  </td>
                  <td>
                    {isEditable ? (
                      <input
                        type="text"
                        value={it.notes ?? ''}
                        onChange={(e) => updateItem(idx, 'notes', e.target.value)}
                      />
                    ) : (
                      it.notes || '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label>Overall Notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!isEditable} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-body">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
            Photo/Video Documentation
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Captures a timestamp automatically, and GPS coordinates when your browser grants location
            permission — GPS is best-effort and may not be available on desktop.
          </p>
          {isEditable && (
            <input type="file" accept="image/*,video/*" onChange={handleUpload} disabled={uploading} />
          )}
          {inspection.media.length > 0 && (
            <ul style={{ marginTop: '12px' }}>
              {inspection.media.map((m) => (
                <li key={m.id} style={{ fontSize: '13px', marginBottom: '4px' }}>
                  [{m.mediaType}] {new Date(m.capturedAt).toLocaleString()}
                  {m.latitude != null && m.longitude != null ? ` — GPS ${m.latitude}, ${m.longitude}` : ' — no GPS'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-body">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Signatures</h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Digital signature is a typed attestation name captured with IP address and timestamp
            (the same mechanism used for lease e-signatures) — not a hand-drawn signature.
          </p>
          {isEditable ? (
            <>
              <div className="form-group">
                <label>Tenant Signature (typed name)</label>
                <input type="text" value={tenantSignature} onChange={(e) => setTenantSignature(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Manager/Inspector Signature (typed name)</label>
                <input type="text" value={managerSignature} onChange={(e) => setManagerSignature(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="detail-grid">
              <div className="detail-item">
                <label>Tenant</label>
                <span>
                  {inspection.tenantSignatureName
                    ? `${inspection.tenantSignatureName} (${new Date(inspection.tenantSignatureAt!).toLocaleString()})`
                    : 'Not signed'}
                </span>
              </div>
              <div className="detail-item">
                <label>Manager/Inspector</label>
                <span>
                  {inspection.managerSignatureName
                    ? `${inspection.managerSignatureName} (${new Date(inspection.managerSignatureAt!).toLocaleString()})`
                    : 'Not signed'}
                </span>
              </div>
            </div>
          )}

          {isEditable && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={handleComplete} disabled={submitting}>
                {submitting ? 'Completing…' : 'Complete Inspection'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
