'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import SettingsShell from '@/components/settings/SettingsShell';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone: string | null;
  invitedAt: string | null;
  lastLoginAt: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  maintenance: 'Maintenance',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'occupied',
  invited: 'notice',
  deactivated: 'vacant',
};

export default function TeamSettingsPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('manager');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    loadStaff();
  }, [includeInactive]);

  async function loadStaff() {
    setLoading(true);
    try {
      const data = await api.staff.list({ includeInactive });
      setStaff(data);
    } catch (err) {
      console.error('Failed to load staff:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);

    try {
      const member = await api.staff.invite({ email: inviteEmail, name: inviteName, role: inviteRole });
      setStaff((prev) => [...prev, member]);
      setShowInvite(false);
      setInviteName('');
      setInviteEmail('');
      setInviteRole('manager');
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  }

  async function handleToggleStatus(member: StaffMember) {
    const newStatus = member.status === 'active' ? 'deactivated' : 'active';
    if (!confirm(`${newStatus === 'deactivated' ? 'Deactivate' : 'Reactivate'} ${member.name}?`)) return;

    try {
      const updated = await api.staff.update(member.id, { status: newStatus });
      setStaff((prev) => prev.map((m) => m.id === member.id ? { ...m, ...updated } : m));
    } catch (err: any) {
      alert(err?.message || 'Failed to update staff status.');
    }
  }

  return (
    <>
      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Invite Team Member</h2>
              <button className="modal-close" onClick={() => setShowInvite(false)}>x</button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="modal-body">
                {inviteError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
                    {inviteError}
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>Full name *</label>
                    <input type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Smith" required />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane@company.com" required />
                  </div>
                </div>
                <div className="form-group">
                  <label>Role *</label>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    <option value="manager">Manager</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowInvite(false)} disabled={inviting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={inviting}>
                  {inviting ? 'Sending invite...' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SettingsShell activeHref="/settings/team">
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Team Members</h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginTop: '2px' }}>
                  {staff.length} member{staff.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
                  Show inactive
                </label>
                <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Invite member</button>
              </div>
            </div>
          </div>

          <div className="card">
            {loading ? (
              <div className="loading" style={{ padding: '32px' }}>Loading team...</div>
            ) : staff.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px' }}>
                <p>No team members yet. Invite someone to get started.</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last login</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((member) => (
                      <tr key={member.id}>
                        <td style={{ fontWeight: 500 }}>{member.name}</td>
                        <td>{member.email}</td>
                        <td>
                          <span className="badge badge-occupied">{ROLE_LABELS[member.role] ?? member.role}</span>
                        </td>
                        <td>
                          <span className={`badge badge-${STATUS_COLORS[member.status] ?? 'vacant'}`}>
                            {member.status}
                          </span>
                        </td>
                        <td>
                          {member.lastLoginAt
                            ? new Date(member.lastLoginAt).toLocaleDateString()
                            : member.invitedAt ? `Invited ${new Date(member.invitedAt).toLocaleDateString()}` : '--'}
                        </td>
                        <td>
                          {member.role !== 'owner' && (
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleToggleStatus(member)}
                            >
                              {member.status === 'active' ? 'Deactivate' : 'Reactivate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </SettingsShell>
    </>
  );
}
