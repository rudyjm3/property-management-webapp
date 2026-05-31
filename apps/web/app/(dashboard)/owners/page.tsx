'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface PropertyOwnership {
  id: string;
  ownershipPct: string;
  property: { id: string; name: string };
}

interface Owner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  propertyOwners: PropertyOwnership[];
  createdAt: string;
}

interface PropertyOption {
  id: string;
  name: string;
}

export default function OwnersPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [ownersData, propsData] = await Promise.all([
        api.owners.list(),
        api.properties.list(),
      ]);
      setOwners(ownersData);
      setProperties(propsData);
    } catch (err) {
      console.error('Failed to load owners:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      await api.owners.create({
        name: fd.get('name'),
        email: fd.get('email'),
        phone: (fd.get('phone') as string) || null,
        address: (fd.get('address') as string) || null,
        taxId: (fd.get('taxId') as string) || null,
        notes: (fd.get('notes') as string) || null,
      });
      setShowForm(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create owner.');
    }
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingOwner) return;
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      await api.owners.update(editingOwner.id, {
        name: fd.get('name'),
        email: fd.get('email'),
        phone: (fd.get('phone') as string) || null,
        address: (fd.get('address') as string) || null,
        taxId: (fd.get('taxId') as string) || null,
        notes: (fd.get('notes') as string) || null,
      });
      setEditingOwner(null);
      if (selectedOwner?.id === editingOwner.id) setSelectedOwner(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update owner.');
    }
  }

  async function handleDelete(owner: Owner) {
    if (!confirm(`Delete owner "${owner.name}"? This cannot be undone.`)) return;
    try {
      await api.owners.delete(owner.id);
      if (selectedOwner?.id === owner.id) setSelectedOwner(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete owner.');
    }
  }

  async function handleAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedOwner) return;
    setError('');
    const fd = new FormData(e.currentTarget);
    const propertyId = fd.get('propertyId') as string;
    const ownershipPct = parseFloat(fd.get('ownershipPct') as string);
    try {
      await api.owners.assignToProperty(propertyId, {
        ownerId: selectedOwner.id,
        ownershipPct,
      });
      setShowAssignForm(false);
      const updated = await api.owners.get(selectedOwner.id);
      setSelectedOwner(updated);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to assign property.');
    }
  }

  async function handleRemoveAssignment(propertyId: string) {
    if (!selectedOwner) return;
    if (!confirm('Remove this property assignment?')) return;
    try {
      await api.owners.removeFromProperty(propertyId, selectedOwner.id);
      const updated = await api.owners.get(selectedOwner.id);
      setSelectedOwner(updated);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to remove assignment.');
    }
  }

  const filtered = owners.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ color: 'var(--color-text-muted)', padding: '2rem' }}>Loading owners…</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Owners</h1>
          <p className="page-subtitle">Manage property owners and ownership assignments</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setError(''); }}>
          + Add Owner
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem' }}>
        {/* Owner List */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: '1rem' }}>
            <input
              className="form-input"
              placeholder="Search owners…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: '320px' }}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <p>{search ? 'No owners match your search.' : 'No owners yet. Add an owner to get started.'}</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Properties</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((owner) => (
                    <tr
                      key={owner.id}
                      className={selectedOwner?.id === owner.id ? 'selected' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedOwner(selectedOwner?.id === owner.id ? null : owner)}
                    >
                      <td style={{ fontWeight: 500 }}>{owner.name}</td>
                      <td>{owner.email}</td>
                      <td>{owner.phone || '—'}</td>
                      <td>
                        {owner.propertyOwners.length > 0 ? (
                          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            {owner.propertyOwners.map((po) => po.property.name).join(', ')}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => { setEditingOwner(owner); setError(''); }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(owner)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Owner Detail Panel */}
        {selectedOwner && (
          <div style={{ width: '320px', flexShrink: 0 }}>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{selectedOwner.name}</h3>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-muted)' }}
                  onClick={() => setSelectedOwner(null)}
                >
                  ×
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
                <div><span style={{ color: 'var(--color-text-muted)' }}>Email:</span> {selectedOwner.email}</div>
                {selectedOwner.phone && <div><span style={{ color: 'var(--color-text-muted)' }}>Phone:</span> {selectedOwner.phone}</div>}
                {selectedOwner.address && <div><span style={{ color: 'var(--color-text-muted)' }}>Address:</span> {selectedOwner.address}</div>}
                {selectedOwner.taxId && <div><span style={{ color: 'var(--color-text-muted)' }}>Tax ID:</span> {selectedOwner.taxId}</div>}
                {selectedOwner.notes && <div><span style={{ color: 'var(--color-text-muted)' }}>Notes:</span> {selectedOwner.notes}</div>}
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>Property Ownership</h4>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => { setShowAssignForm(true); setError(''); }}
                  >
                    + Assign
                  </button>
                </div>

                {selectedOwner.propertyOwners.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No properties assigned.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {selectedOwner.propertyOwners.map((po) => (
                      <div
                        key={po.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.5rem 0.75rem',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500 }}>{po.property.name}</div>
                          <div style={{ color: 'var(--color-text-muted)' }}>{Number(po.ownershipPct)}% ownership</div>
                        </div>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleRemoveAssignment(po.property.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Owner Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Add Owner</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="form-input" name="name" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input className="form-input" name="email" type="email" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="form-input" name="phone" type="tel" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tax ID / SSN</label>
                    <input className="form-input" name="taxId" placeholder="XXX-XX-XXXX" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="form-input" name="address" placeholder="Street, City, State ZIP" />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-input" name="notes" rows={3} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">Create Owner</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Owner Modal */}
      {editingOwner && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Edit Owner</h2>
              <button className="modal-close" onClick={() => setEditingOwner(null)}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Name *</label>
                    <input className="form-input" name="name" defaultValue={editingOwner.name} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input className="form-input" name="email" type="email" defaultValue={editingOwner.email} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="form-input" name="phone" type="tel" defaultValue={editingOwner.phone || ''} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tax ID / SSN</label>
                    <input className="form-input" name="taxId" defaultValue={editingOwner.taxId || ''} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="form-input" name="address" defaultValue={editingOwner.address || ''} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-input" name="notes" rows={3} defaultValue={editingOwner.notes || ''} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingOwner(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Property Modal */}
      {showAssignForm && selectedOwner && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Assign Property to {selectedOwner.name}</h2>
              <button className="modal-close" onClick={() => setShowAssignForm(false)}>×</button>
            </div>
            <form onSubmit={handleAssign}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-group">
                  <label className="form-label">Property *</label>
                  <select className="form-input" name="propertyId" required>
                    <option value="">Select a property…</option>
                    {properties
                      .filter((p) => !selectedOwner.propertyOwners.some((po) => po.property.id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Ownership % *</label>
                  <input
                    className="form-input"
                    name="ownershipPct"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    placeholder="e.g. 100 or 50"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">Assign</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
