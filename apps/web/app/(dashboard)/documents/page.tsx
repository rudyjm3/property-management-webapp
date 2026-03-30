'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';

const ENTITY_TYPES = [
  { value: '', label: 'All entities' },
  { value: 'property', label: 'Properties' },
  { value: 'unit', label: 'Units' },
  { value: 'tenant', label: 'Tenants' },
  { value: 'lease', label: 'Leases' },
  { value: 'work_order', label: 'Work Orders' },
];

const CATEGORY_LABELS: Record<string, string> = {
  lease: 'Lease',
  inspection: 'Inspection',
  insurance: 'Insurance',
  id: 'ID',
  photo: 'Photo',
  other: 'Other',
};

const CATEGORY_OPTIONS = [
  { value: 'other', label: 'Other' },
  { value: 'lease', label: 'Lease' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'id', label: 'ID / Document' },
  { value: 'photo', label: 'Photo' },
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  return '📎';
}

interface Document {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  docCategory: string | null;
  label: string | null;
  entityType: string;
  entityId: string;
  visibleToTenant: boolean;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntityType, setFilterEntityType] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  // Upload form
  const [uploadEntityType, setUploadEntityType] = useState('property');
  const [uploadEntityId, setUploadEntityId] = useState('');
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadVisible, setUploadVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
  }, [filterEntityType]);

  async function loadDocuments() {
    setLoading(true);
    try {
      const docs = await api.documents.list(filterEntityType ? { entityType: filterEntityType } : undefined);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(doc: Document) {
    try {
      const { downloadUrl } = await api.documents.getDownloadUrl(doc.id);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to get download URL:', err);
    }
  }

  async function handleDelete(doc: Document) {
    if (!confirm(`Delete "${doc.label || doc.fileName}"? This cannot be undone.`)) return;
    try {
      await api.documents.delete(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  }

  async function handleUpload() {
    if (!selectedFile || !uploadEntityId.trim()) {
      setUploadError('Please select a file and enter the entity ID.');
      return;
    }
    setUploading(true);
    setUploadError(null);

    try {
      const mimeType = selectedFile.type || 'application/octet-stream';
      const { uploadUrl, s3Key } = await api.documents.requestUploadUrl({
        entityType: uploadEntityType,
        entityId: uploadEntityId.trim(),
        fileName: selectedFile.name,
        mimeType,
        sizeBytes: selectedFile.size,
        docCategory: uploadCategory,
        label: uploadLabel.trim() || null,
        visibleToTenant: uploadVisible,
      });

      await api.documents.uploadToS3(uploadUrl, selectedFile, mimeType);
      await api.documents.confirmUpload({
        s3Key,
        entityType: uploadEntityType,
        entityId: uploadEntityId.trim(),
        fileName: selectedFile.name,
        mimeType,
        sizeBytes: selectedFile.size,
        docCategory: uploadCategory,
        label: uploadLabel.trim() || null,
        visibleToTenant: uploadVisible,
      });

      setSelectedFile(null);
      setUploadEntityId('');
      setUploadLabel('');
      setUploadCategory('other');
      setUploadVisible(false);
      setShowUpload(false);
      await loadDocuments();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">All files across your portfolio</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          + Upload Document
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Upload Document</h2>
              <button className="modal-close" onClick={() => setShowUpload(false)}>×</button>
            </div>
            <div className="modal-body">
              {uploadError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
                  {uploadError}
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Entity type *</label>
                  <select value={uploadEntityType} onChange={(e) => setUploadEntityType(e.target.value)}>
                    <option value="property">Property</option>
                    <option value="unit">Unit</option>
                    <option value="tenant">Tenant</option>
                    <option value="lease">Lease</option>
                    <option value="work_order">Work Order</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Entity ID *</label>
                  <input
                    type="text"
                    value={uploadEntityId}
                    onChange={(e) => setUploadEntityId(e.target.value)}
                    placeholder="Paste the ID from the URL"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Label (optional)</label>
                  <input
                    type="text"
                    value={uploadLabel}
                    onChange={(e) => setUploadLabel(e.target.value)}
                    placeholder="e.g. Signed Lease 2024"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <input
                  id="visibleToTenant"
                  type="checkbox"
                  checked={uploadVisible}
                  onChange={(e) => setUploadVisible(e.target.checked)}
                />
                <label htmlFor="visibleToTenant" style={{ margin: 0, cursor: 'pointer' }}>
                  Visible to tenant
                </label>
              </div>

              {selectedFile ? (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '24px' }}>{fileIcon(selectedFile.type)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{selectedFile.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{formatBytes(selectedFile.size)}</div>
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={() => setSelectedFile(null)}>Change</button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed var(--color-border)', borderRadius: '8px', padding: '32px',
                    textAlign: 'center', cursor: 'pointer', marginBottom: '16px',
                  }}
                >
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                  <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Click to browse — max 50 MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > MAX_FILE_SIZE) { setUploadError('File exceeds 50 MB limit.'); return; }
                        setSelectedFile(f);
                        setUploadError(null);
                      }
                    }}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUpload(false)} disabled={uploading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !selectedFile}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-body" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="form-group" style={{ margin: 0, minWidth: '200px' }}>
              <select value={filterEntityType} onChange={(e) => setFilterEntityType(e.target.value)}>
                {ENTITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
              {documents.length} document{documents.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Document list */}
      <div className="card">
        <div className="table-container">
          {loading ? (
            <div className="loading" style={{ padding: '48px' }}>Loading documents…</div>
          ) : documents.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px' }}>
              <p>No documents found. Upload one to get started.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Entity</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Tenant visible</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{fileIcon(doc.mimeType)}</span>
                        <span style={{ fontWeight: 500 }}>{doc.label || doc.fileName}</span>
                      </div>
                      {doc.label && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: '24px' }}>
                          {doc.fileName}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-vacant" style={{ textTransform: 'capitalize' }}>
                        {doc.entityType.replace('_', ' ')}
                      </span>
                    </td>
                    <td>{doc.docCategory ? CATEGORY_LABELS[doc.docCategory] : '—'}</td>
                    <td>{formatBytes(doc.sizeBytes)}</td>
                    <td>{new Date(doc.createdAt).toLocaleDateString()}</td>
                    <td>{doc.visibleToTenant ? 'Yes' : 'No'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleDownload(doc)}>
                          Download
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ color: '#ef4444', border: '1px solid #ef4444', background: 'transparent' }}
                          onClick={() => handleDelete(doc)}
                        >
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
    </>
  );
}
