'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

const CATEGORY_LABELS: Record<string, string> = {
  lease: 'Lease',
  inspection: 'Inspection',
  insurance: 'Insurance',
  id: 'ID',
  photo: 'Photo',
  other: 'Other',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface Document {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  docCategory: string | null;
  label: string | null;
  visibleToTenant: boolean;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

interface Props {
  entityType: 'property' | 'unit' | 'lease' | 'tenant' | 'work_order' | 'vendor';
  entityId: string;
}

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

export default function DocumentPanel({ entityType, entityId }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState('other');
  const [label, setLabel] = useState('');
  const [visibleToTenant, setVisibleToTenant] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
  }, [entityId]);

  async function loadDocuments() {
    try {
      const docs = await api.documents.list({ entityType, entityId });
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File exceeds 50 MB limit.');
      return;
    }
    setUploadError(null);
    setSelectedFile(file);
    setShowUploadForm(true);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);

    try {
      // Resolve once so step 1 and step 2 both use the identical value
      const resolvedMimeType = selectedFile.type || 'application/octet-stream';

      // Step 1: Get presigned URL
      const { uploadUrl, s3Key } = await api.documents.requestUploadUrl({
        entityType,
        entityId,
        fileName: selectedFile.name,
        mimeType: resolvedMimeType,
        sizeBytes: selectedFile.size,
        docCategory: category || null,
        label: label.trim() || null,
        visibleToTenant,
      });

      // Step 2: Upload directly to S3 — Content-Type must match the signed value
      await api.documents.uploadToS3(uploadUrl, selectedFile, resolvedMimeType);

      // Step 3: Confirm upload and persist metadata
      await api.documents.confirmUpload({
        s3Key,
        entityType,
        entityId,
        fileName: selectedFile.name,
        mimeType: resolvedMimeType,
        sizeBytes: selectedFile.size,
        docCategory: category || null,
        label: label.trim() || null,
        visibleToTenant,
      });

      // Reset form and reload
      setSelectedFile(null);
      setLabel('');
      setCategory('other');
      setVisibleToTenant(false);
      setShowUploadForm(false);
      await loadDocuments();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
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
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    try {
      await api.documents.delete(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  }

  return (
    <div className="card" style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Documents</h3>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => {
            setShowUploadForm(true);
            setSelectedFile(null);
          }}
        >
          + Upload
        </button>
      </div>

      {/* Drop zone / file picker */}
      {showUploadForm && (
        <div style={{ marginBottom: '16px' }}>
          {!selectedFile ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: '8px',
                padding: '32px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'var(--color-bg-hover, #f8f9fa)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
              <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
                Drag and drop a file here, or click to browse
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Max 50 MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '24px' }}>{fileIcon(selectedFile.type)}</span>
                <div>
                  <div style={{ fontWeight: 500 }}>{selectedFile.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    {formatBytes(selectedFile.size)}
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => { setSelectedFile(null); setUploadError(null); }}
                >
                  Change
                </button>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORY_OPTIONS.map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Label <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Signed Lease 2024"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <input
                  id="visibleToTenant"
                  type="checkbox"
                  checked={visibleToTenant}
                  onChange={(e) => setVisibleToTenant(e.target.checked)}
                />
                <label htmlFor="visibleToTenant" style={{ margin: 0, cursor: 'pointer' }}>
                  Visible to tenant
                </label>
              </div>

              {uploadError && (
                <p style={{ color: 'var(--color-danger, #ef4444)', marginBottom: '12px', fontSize: '14px' }}>
                  {uploadError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setShowUploadForm(false); setSelectedFile(null); setUploadError(null); }}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="loading" style={{ padding: '24px 0' }}>Loading documents…</div>
      ) : documents.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          <p style={{ margin: 0 }}>No documents yet.</p>
        </div>
      ) : (
        <div>
          {documents.map((doc) => (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 0',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span style={{ fontSize: '22px' }}>{fileIcon(doc.mimeType)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.label || doc.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  {doc.docCategory ? CATEGORY_LABELS[doc.docCategory] : 'Other'}
                  {' · '}
                  {formatBytes(doc.sizeBytes)}
                  {' · '}
                  {new Date(doc.createdAt).toLocaleDateString()}
                  {doc.uploadedBy ? ` · ${doc.uploadedBy.name}` : ''}
                </div>
              </div>
              {doc.visibleToTenant && (
                <span style={{ fontSize: '11px', padding: '2px 6px', background: 'var(--color-bg-muted, #f1f5f9)', borderRadius: '4px', color: 'var(--color-text-muted)' }}>
                  Tenant visible
                </span>
              )}
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => handleDownload(doc)}
                title="Download"
              >
                Download
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => handleDelete(doc)}
                title="Delete"
                style={{ color: 'var(--color-danger, #ef4444)', background: 'transparent', border: '1px solid currentColor' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
