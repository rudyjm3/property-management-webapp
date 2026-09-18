'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MAINTENANCE_CADENCES, WORK_ORDER_CATEGORIES, WORK_ORDER_LOCATION_TYPES } from '@propflow/shared';

// Grounds & Property Maintenance (Module 3). Combines the two features that
// live at the property (not unit) level: recurring maintenance schedules
// (net-new — generate real WorkOrder records on a cadence, see
// groundsMaintenanceJob.ts) and the grounds/common-area inspection log
// (reuses Module 6's Inspection/InspectionMedia models, enforcing a
// completion photo requirement — see inspection.service.ts). No standalone
// page for either, mirroring how Modules 2/6 kept everything reachable from
// an existing detail page instead of adding sidebar nav complexity.

interface Props {
  propertyId: string;
}

interface Vendor {
  id: string;
  companyName: string;
}

interface Schedule {
  id: string;
  title: string;
  category: string;
  locationType: string | null;
  cadence: string;
  active: boolean;
  nextDueDate: string;
  lastGeneratedAt: string | null;
  vendor: { id: string; companyName: string } | null;
}

interface GroundsInspection {
  id: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  media: { id: string; mediaType: string }[];
  inspector: { id: string; name: string } | null;
}

const CADENCE_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  annual: 'Annual',
};

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : '—';
}

export default function GroundsMaintenanceCard({ propertyId }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [inspections, setInspections] = useState<GroundsInspection[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    category: 'grounds',
    locationType: '',
    cadence: 'monthly',
    vendorId: '',
    nextDueDate: '',
  });
  const [submittingSchedule, setSubmittingSchedule] = useState(false);

  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduleData, inspectionData] = await Promise.all([
        api.maintenanceSchedules.list(propertyId),
        api.propertyInspections.list(propertyId),
      ]);
      setSchedules(scheduleData);
      setInspections(inspectionData);
    } catch {
      setSchedules([]);
      setInspections([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    load();
    api.vendors.list({ activeOnly: true }).then(setVendors).catch(() => setVendors([]));
  }, [load]);

  async function handleCreateSchedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmittingSchedule(true);
    setError('');
    try {
      await api.maintenanceSchedules.create(propertyId, {
        title: scheduleForm.title,
        category: scheduleForm.category,
        locationType: scheduleForm.locationType || null,
        cadence: scheduleForm.cadence,
        vendorId: scheduleForm.vendorId || null,
        nextDueDate: scheduleForm.nextDueDate,
      });
      setShowScheduleModal(false);
      setScheduleForm({ title: '', category: 'grounds', locationType: '', cadence: 'monthly', vendorId: '', nextDueDate: '' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to create maintenance schedule.');
    } finally {
      setSubmittingSchedule(false);
    }
  }

  async function handleToggleActive(schedule: Schedule) {
    try {
      await api.maintenanceSchedules.update(propertyId, schedule.id, { active: !schedule.active });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update schedule.');
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    try {
      await api.maintenanceSchedules.delete(propertyId, scheduleId);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to delete schedule.');
    }
  }

  async function handleLogInspection() {
    setError('');
    try {
      await api.propertyInspections.create(propertyId, {});
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to start a grounds inspection.');
    }
  }

  async function handleUploadPhoto(inspectionId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFor(inspectionId);
    setError('');
    try {
      const { uploadUrl, storageKey } = await api.propertyInspections.requestMediaUploadUrl(
        propertyId,
        inspectionId,
        file.name,
        file.type
      );
      await api.inspections.uploadToStorage(uploadUrl, file, file.type);
      await api.propertyInspections.attachMedia(propertyId, inspectionId, {
        storageKey,
        mediaType: file.type.startsWith('video') ? 'video' : 'photo',
        capturedAt: new Date().toISOString(),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to upload photo.');
    } finally {
      setUploadingFor(null);
      e.target.value = '';
    }
  }

  async function handleCompleteInspection(inspectionId: string) {
    setCompletingId(inspectionId);
    setError('');
    try {
      await api.propertyInspections.complete(propertyId, inspectionId, {});
      await load();
    } catch (err: any) {
      // Most common failure: PHOTO_REQUIRED — surfaced verbatim from the API.
      setError(err.message || 'Failed to complete inspection.');
    } finally {
      setCompletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-body">
          <p style={{ color: 'var(--color-text-muted)' }}>Loading grounds & maintenance…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', background: '#fff5f5', border: '1px solid var(--color-danger)', borderRadius: '6px', color: 'var(--color-danger)', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Recurring Maintenance Schedules */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Recurring Maintenance Schedules</h2>
            <button className="btn btn-secondary" onClick={() => setShowScheduleModal(true)}>
              + Add Schedule
            </button>
          </div>

          {schedules.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>
              No recurring schedules yet. Add one for landscaping, HVAC filter changes, pest control, etc.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Cadence</th>
                  <th>Vendor</th>
                  <th>Next Due</th>
                  <th>Last Generated</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{CADENCE_LABELS[s.cadence] ?? s.cadence}</td>
                    <td>{s.vendor?.companyName ?? '—'}</td>
                    <td>{fmtDate(s.nextDueDate)}</td>
                    <td>{fmtDate(s.lastGeneratedAt)}</td>
                    <td>
                      <span className={`badge ${s.active ? 'badge-occupied' : 'badge-neutral'}`}>
                        {s.active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleToggleActive(s)}>
                          {s.active ? 'Pause' : 'Resume'}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteSchedule(s.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Grounds / Common-Area Inspection Log */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Grounds Inspection Log</h2>
            <button className="btn btn-secondary" onClick={handleLogInspection}>
              + Log Inspection
            </button>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginBottom: '12px' }}>
            At least one completion photo is required before an inspection can be marked complete.
          </p>

          {inspections.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>No grounds inspections logged yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Completed</th>
                  <th>Photos/Videos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inspections.map((insp) => (
                  <tr key={insp.id}>
                    <td>{insp.status.replace(/_/g, ' ')}</td>
                    <td>{fmtDate(insp.completedAt)}</td>
                    <td>{insp.media.length}</td>
                    <td>
                      {insp.status !== 'completed' && insp.status !== 'cancelled' && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                            {uploadingFor === insp.id ? 'Uploading…' : 'Add Photo'}
                            <input
                              type="file"
                              accept="image/*,video/*"
                              style={{ display: 'none' }}
                              disabled={uploadingFor === insp.id}
                              onChange={(e) => handleUploadPhoto(insp.id, e)}
                            />
                          </label>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={insp.media.length === 0 || completingId === insp.id}
                            onClick={() => handleCompleteInspection(insp.id)}
                          >
                            {completingId === insp.id ? 'Completing…' : 'Complete'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Recurring Maintenance Schedule</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowScheduleModal(false)}>
                X
              </button>
            </div>
            <form onSubmit={handleCreateSchedule}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Task Title</label>
                  <input
                    required
                    placeholder="e.g. Monthly landscaping"
                    value={scheduleForm.title}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={scheduleForm.category}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, category: e.target.value })}
                    >
                      {WORK_ORDER_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Location</label>
                    <select
                      value={scheduleForm.locationType}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, locationType: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {WORK_ORDER_LOCATION_TYPES.map((l) => (
                        <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Cadence</label>
                    <select
                      value={scheduleForm.cadence}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, cadence: e.target.value })}
                    >
                      {MAINTENANCE_CADENCES.map((c) => (
                        <option key={c} value={c}>{CADENCE_LABELS[c]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Next Due Date</label>
                    <input
                      type="date"
                      required
                      value={scheduleForm.nextDueDate}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, nextDueDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Preferred Vendor (optional)</label>
                  <select
                    value={scheduleForm.vendorId}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, vendorId: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.companyName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowScheduleModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submittingSchedule}>
                  {submittingSchedule ? 'Saving…' : 'Add Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
