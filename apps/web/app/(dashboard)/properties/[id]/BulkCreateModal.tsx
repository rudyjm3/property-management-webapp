'use client';

import React, { useState, useMemo } from 'react';
import { api } from '@/lib/api';

interface Property {
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface BulkCreateModalProps {
  propertyId: string;
  property: Property;
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = 'range' | 'csv';

interface SharedFields {
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  floor: string;
  bedrooms: string;
  bathrooms: string;
  sqFt: string;
  marketRent: string;
  rentAmount: string;
  depositAmount: string;
  notes: string;
}

interface CSVRow {
  unitNumber: string;
  floor: string;
  type: string;
  bedrooms: string;
  bathrooms: string;
  sqFt: string;
  marketRent: string;
  rentAmount: string;
  depositAmount: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  [key: string]: string;
}

const CSV_TEMPLATE_HEADERS = 'unitNumber,floor,type,bedrooms,bathrooms,sqFt,marketRent,rentAmount,depositAmount,address,city,state,zip,notes';
const CSV_TEMPLATE_EXAMPLE = '101,1,one_bed,1,1,750,1200,1100,1100,,,,,';
const CSV_TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`${CSV_TEMPLATE_HEADERS}\n${CSV_TEMPLATE_EXAMPLE}`)}`;

// Naive RFC 4180 CSV parser — handles quoted fields with embedded commas and newlines.
function parseCSV(text: string): CSVRow[] {
  const headers = CSV_TEMPLATE_HEADERS.split(',');
  const lines = text.trim().split('\n');

  // Skip the header row if it matches our template headers
  const startIdx = lines[0].trim().toLowerCase().startsWith('unitnumber') ? 1 : 0;

  return lines.slice(startIdx).filter((l) => l.trim()).map((line) => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());

    const row: CSVRow = {} as CSVRow;
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

const VALID_UNIT_TYPES = new Set(['studio', 'one_bed', 'two_bed', 'three_bed', 'four_plus_bed', 'commercial']);

function validateCSVRow(row: CSVRow): string | null {
  if (!row.unitNumber) return 'Unit number is required';
  if (!row.rentAmount || isNaN(Number(row.rentAmount))) return 'Valid rent amount is required';
  if (row.bedrooms && isNaN(Number(row.bedrooms))) return 'Bedrooms must be a number';
  if (row.bathrooms && isNaN(Number(row.bathrooms))) return 'Bathrooms must be a number';
  if (row.sqFt && isNaN(Number(row.sqFt))) return 'Sq Ft must be a number';
  if (row.type && !VALID_UNIT_TYPES.has(row.type)) return `Invalid type "${row.type}". Must be: studio, one_bed, two_bed, three_bed, four_plus_bed, commercial`;
  return null;
}

function csvRowToUnit(row: CSVRow) {
  return {
    unitNumber: row.unitNumber,
    floor: row.floor ? parseInt(row.floor) : null,
    type: row.type || null,
    bedrooms: row.bedrooms ? parseInt(row.bedrooms) : 1,
    bathrooms: row.bathrooms ? parseFloat(row.bathrooms) : 1,
    sqFt: row.sqFt ? parseInt(row.sqFt) : null,
    marketRent: row.marketRent ? parseFloat(row.marketRent) : null,
    rentAmount: parseFloat(row.rentAmount),
    depositAmount: row.depositAmount ? parseFloat(row.depositAmount) : 0,
    address: row.address || null,
    city: row.city || null,
    state: row.state || null,
    zip: row.zip || null,
    notes: row.notes || null,
  };
}

export default function BulkCreateModal({ propertyId, property, onClose, onSuccess }: BulkCreateModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('range');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ created: number; skipped: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Range generator state
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [shared, setShared] = useState<SharedFields>({
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    type: '',
    floor: '',
    bedrooms: '1',
    bathrooms: '1',
    sqFt: '',
    marketRent: '',
    rentAmount: '',
    depositAmount: '',
    notes: '',
  });

  // CSV state
  const [csvRows, setCSVRows] = useState<CSVRow[]>([]);
  const [csvErrors, setCSVErrors] = useState<Record<number, string>>({});
  const [csvFileName, setCSVFileName] = useState('');

  // Derived range values
  const rangePreviewCount = useMemo(() => {
    const s = parseInt(rangeStart);
    const e = parseInt(rangeEnd);
    if (isNaN(s) || isNaN(e) || e < s) return 0;
    return e - s + 1;
  }, [rangeStart, rangeEnd]);

  const rangeError = useMemo(() => {
    const s = parseInt(rangeStart);
    const e = parseInt(rangeEnd);
    if (rangeStart && rangeEnd && !isNaN(s) && !isNaN(e)) {
      if (e < s) return 'End unit must be greater than or equal to start unit';
      if (e - s + 1 > 500) return 'Maximum 500 units per bulk operation';
    }
    return null;
  }, [rangeStart, rangeEnd]);

  const csvValidRows = useMemo(() => csvRows.filter((_, i) => !csvErrors[i]), [csvRows, csvErrors]);

  function setField(key: keyof SharedFields, value: string) {
    setShared((prev) => ({ ...prev, [key]: value }));
  }

  function handleCSVFile(file: File) {
    setCSVFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      const errors: Record<number, string> = {};
      rows.forEach((row, i) => {
        const err = validateCSVRow(row);
        if (err) errors[i] = err;
      });
      setCSVRows(rows);
      setCSVErrors(errors);
      setSubmitResult(null);
      setSubmitError(null);
    };
    reader.readAsText(file);
  }

  async function handleRangeSubmit() {
    if (!rangePreviewCount || rangeError || !shared.rentAmount) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);
    try {
      const s = parseInt(rangeStart);
      const units = Array.from({ length: rangePreviewCount }, (_, i) => ({
        unitNumber: String(s + i),
        floor: shared.floor ? parseInt(shared.floor) : null,
        type: shared.type || null,
        bedrooms: Number.isNaN(parseInt(shared.bedrooms)) ? 1 : parseInt(shared.bedrooms),
        bathrooms: Number.isNaN(parseFloat(shared.bathrooms)) ? 1 : parseFloat(shared.bathrooms),
        sqFt: shared.sqFt ? parseInt(shared.sqFt) : null,
        marketRent: shared.marketRent ? parseFloat(shared.marketRent) : null,
        rentAmount: parseFloat(shared.rentAmount),
        depositAmount: shared.depositAmount ? parseFloat(shared.depositAmount) : 0,
        address: shared.address || null,
        city: shared.city || null,
        state: shared.state || null,
        zip: shared.zip || null,
        notes: shared.notes || null,
      }));
      const result = await api.units.bulkCreate(propertyId, units);
      setSubmitResult(result);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to create units');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCSVSubmit() {
    if (!csvValidRows.length) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);
    try {
      const units = csvValidRows.map(csvRowToUnit);
      const result = await api.units.bulkCreate(propertyId, units);
      setSubmitResult(result);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to import units');
    } finally {
      setSubmitting(false);
    }
  }

  const tabStyle = (tab: Tab) => ({
    padding: '8px 16px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
    color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)',
    marginBottom: '-2px',
    fontWeight: activeTab === tab ? 600 : 400,
    fontSize: '14px',
  } as React.CSSProperties);

  const csvLimitError = csvValidRows.length > 500 ? 'Maximum 500 units per bulk operation' : null;

  const canSubmitRange = rangePreviewCount > 0 && !rangeError && !!shared.rentAmount && !submitting;
  const canSubmitCSV = csvValidRows.length > 0 && !csvLimitError && !submitting;

  return (
    <div className="modal-overlay" onClick={() => { if (!submitting) onClose(); }}>
      <div className="modal" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Bulk Add Units</h2>
          <button className="btn btn-sm btn-secondary" onClick={onClose} disabled={submitting}>
            X
          </button>
        </div>
        <div className="modal-body">
          {/* Tab row */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: '20px' }}>
            <button style={tabStyle('range')} onClick={() => { setActiveTab('range'); setSubmitResult(null); setSubmitError(null); }}>
              Range Generator
            </button>
            <button style={tabStyle('csv')} onClick={() => { setActiveTab('csv'); setSubmitResult(null); setSubmitError(null); }}>
              CSV Upload
            </button>
          </div>

          {/* Success result banner */}
          {submitResult && (
            <div style={{ background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#15803d', fontWeight: 500 }}>
                {submitResult.created} unit{submitResult.created !== 1 ? 's' : ''} created
                {submitResult.skipped > 0 ? `, ${submitResult.skipped} skipped (duplicate unit numbers)` : ''}
              </span>
              <button className="btn btn-sm btn-primary" onClick={onSuccess}>Done</button>
            </div>
          )}

          {/* Error banner */}
          {submitError && (
            <div style={{ background: '#fff5f5', border: '1px solid var(--color-danger)', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', color: 'var(--color-danger)', fontSize: '14px' }}>
              {submitError}
            </div>
          )}

          {/* ── Range Generator tab ── */}
          {activeTab === 'range' && (
            <>
              <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '16px', marginBottom: '20px' }}>
                <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}>
                  Unit Number Range
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Unit Number</label>
                    <input
                      type="number"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      placeholder="e.g. 101"
                      min="1"
                    />
                  </div>
                  <div className="form-group">
                    <label>End Unit Number</label>
                    <input
                      type="number"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      placeholder="e.g. 110"
                      min="1"
                    />
                  </div>
                </div>
                {rangeError && (
                  <p style={{ margin: '4px 0 0', color: 'var(--color-danger)', fontSize: '13px' }}>{rangeError}</p>
                )}
                {rangePreviewCount > 0 && !rangeError && (
                  <p style={{ margin: '8px 0 0', color: 'var(--color-success)', fontSize: '13px', fontWeight: 500 }}>
                    This will create {rangePreviewCount} unit{rangePreviewCount !== 1 ? 's' : ''} ({rangeStart}–{rangeEnd})
                  </p>
                )}
              </div>

              <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}>
                Shared Unit Details
              </p>

              <div className="form-row">
                <div className="form-group">
                  <label>Unit Type</label>
                  <select value={shared.type} onChange={(e) => setField('type', e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="studio">Studio</option>
                    <option value="one_bed">1 Bed</option>
                    <option value="two_bed">2 Bed</option>
                    <option value="three_bed">3 Bed</option>
                    <option value="four_plus_bed">4+ Bed</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Floor</label>
                  <input type="number" value={shared.floor} onChange={(e) => setField('floor', e.target.value)} placeholder="e.g. 1" min="1" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Bedrooms</label>
                  <input type="number" value={shared.bedrooms} onChange={(e) => setField('bedrooms', e.target.value)} min="0" required />
                </div>
                <div className="form-group">
                  <label>Bathrooms</label>
                  <input type="number" value={shared.bathrooms} onChange={(e) => setField('bathrooms', e.target.value)} min="0" step="0.5" required />
                </div>
                <div className="form-group">
                  <label>Sq Ft</label>
                  <input type="number" value={shared.sqFt} onChange={(e) => setField('sqFt', e.target.value)} placeholder="750" min="1" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Market Rent ($)</label>
                  <input type="number" value={shared.marketRent} onChange={(e) => setField('marketRent', e.target.value)} placeholder="1200" min="0" step="0.01" />
                </div>
                <div className="form-group">
                  <label>Monthly Rent ($) <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <input type="number" value={shared.rentAmount} onChange={(e) => setField('rentAmount', e.target.value)} placeholder="1100" min="0" step="0.01" required />
                </div>
                <div className="form-group">
                  <label>Security Deposit ($)</label>
                  <input type="number" value={shared.depositAmount} onChange={(e) => setField('depositAmount', e.target.value)} placeholder="1100" min="0" step="0.01" />
                </div>
              </div>

              <div style={{ marginTop: '4px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Address Override <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>(defaults to property address)</span>
                </p>
                <div className="form-group">
                  <label>Street Address</label>
                  <input value={shared.address} onChange={(e) => setField('address', e.target.value)} placeholder={property.address} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>City</label>
                    <input value={shared.city} onChange={(e) => setField('city', e.target.value)} placeholder={property.city} />
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input value={shared.state} onChange={(e) => setField('state', e.target.value.toUpperCase())} placeholder={property.state} maxLength={2} style={{ textTransform: 'uppercase' }} />
                  </div>
                  <div className="form-group">
                    <label>ZIP</label>
                    <input value={shared.zip} onChange={(e) => setField('zip', e.target.value)} placeholder={property.zip} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input value={shared.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Optional notes for all units" />
                </div>
              </div>
            </>
          )}

          {/* ── CSV Upload tab ── */}
          {activeTab === 'csv' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)' }}>
                  Upload a CSV file to import multiple units at once.
                </p>
                <a
                  href={CSV_TEMPLATE_HREF}
                  download="unit-import-template.csv"
                  className="btn btn-sm btn-secondary"
                >
                  Download Template
                </a>
              </div>

              <div
                style={{ border: '2px dashed var(--color-border)', borderRadius: '8px', padding: '24px', textAlign: 'center', marginBottom: '16px', cursor: 'pointer', position: 'relative' }}
                onClick={() => document.getElementById('csv-file-input')?.click()}
              >
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCSVFile(file);
                  }}
                />
                <svg style={{ width: '32px', height: '32px', color: 'var(--color-text-muted)', margin: '0 auto 8px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {csvFileName ? (
                  <p style={{ margin: 0, fontWeight: 500 }}>{csvFileName}</p>
                ) : (
                  <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>
                    Click to select a CSV file
                  </p>
                )}
              </div>

              {csvRows.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>
                      {csvRows.length} row{csvRows.length !== 1 ? 's' : ''} found
                      {Object.keys(csvErrors).length > 0 && (
                        <span style={{ color: 'var(--color-danger)', marginLeft: '8px' }}>
                          ({Object.keys(csvErrors).length} with errors — will be skipped)
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: '13px', color: csvLimitError ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 500 }}>
                      {csvValidRows.length} valid
                    </span>
                  </div>
                  {csvLimitError && (
                    <p style={{ margin: '4px 0 8px', color: 'var(--color-danger)', fontSize: '13px' }}>{csvLimitError}</p>
                  )}
                  <div className="table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Unit #</th>
                          <th>Type</th>
                          <th>Bed</th>
                          <th>Bath</th>
                          <th>Sq Ft</th>
                          <th>Rent</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map((row, i) => (
                          <tr
                            key={i}
                            style={csvErrors[i] ? { background: '#fff5f5' } : undefined}
                          >
                            <td style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>{i + 1}</td>
                            <td style={{ fontWeight: 500 }}>{row.unitNumber || <span style={{ color: 'var(--color-danger)' }}>missing</span>}</td>
                            <td>{row.type || '—'}</td>
                            <td>{row.bedrooms || '—'}</td>
                            <td>{row.bathrooms || '—'}</td>
                            <td>{row.sqFt || '—'}</td>
                            <td>{row.rentAmount ? `$${row.rentAmount}` : <span style={{ color: 'var(--color-danger)' }}>missing</span>}</td>
                            <td>
                              {csvErrors[i] ? (
                                <span style={{ color: 'var(--color-danger)', fontSize: '12px' }}>{csvErrors[i]}</span>
                              ) : (
                                <span style={{ color: 'var(--color-success)', fontSize: '12px' }}>✓</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          {activeTab === 'range' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRangeSubmit}
              disabled={!canSubmitRange}
            >
              {submitting ? 'Creating…' : `Create ${rangePreviewCount > 0 ? rangePreviewCount : ''} Unit${rangePreviewCount !== 1 ? 's' : ''}`}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCSVSubmit}
              disabled={!canSubmitCSV}
            >
              {submitting ? 'Importing…' : `Import ${csvValidRows.length > 0 ? csvValidRows.length : ''} Unit${csvValidRows.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
