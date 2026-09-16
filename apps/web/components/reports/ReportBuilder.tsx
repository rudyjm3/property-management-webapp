'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { exportCsv } from '@/lib/exportCsv';
import { exportPdf } from '@/lib/exportPdf';

const SOURCES = [
  { id: 'financial-summary', label: 'Financial Summary' },
  { id: 'rent-roll', label: 'Rent Roll' },
  { id: 'spend-by-location', label: 'Spend by Location' },
  { id: 'vacancy-snapshot', label: 'Vacancy Snapshot' },
  { id: 'vacancy-history', label: 'Vacancy History' },
];

interface Props {
  propertyId?: string;
  periodStart: string;
  periodEnd: string;
}

export function ReportBuilder({ propertyId, periodStart, periodEnd }: Props) {
  const [source, setSource] = useState('financial-summary');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    api.reports.savedReports.list().then(setSavedReports).catch(() => {});
  }, []);

  async function runReport(columns?: string[]) {
    setLoading(true);
    setError('');
    try {
      const result = await api.reports.runBuilder({
        source,
        columns,
        filters: { propertyId, periodStart, periodEnd },
      });
      setAvailableColumns(result.availableColumns);
      setSelectedColumns(columns && columns.length > 0 ? columns : result.availableColumns);
      setRows(result.rows);
    } catch (err: any) {
      setError(err.message || 'Failed to run report.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runReport();
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleColumn(col: string) {
    setSelectedColumns((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
  }

  function handleExportCsv() {
    const headers = selectedColumns;
    const dataRows = rows.map((r) => selectedColumns.map((c) => (r[c] as string | number | null | undefined) ?? ''));
    exportCsv(`${source}-custom-report.csv`, headers, dataRows);
  }

  function handleExportPdf() {
    const headers = selectedColumns;
    const dataRows = rows.map((r) => selectedColumns.map((c) => (r[c] as string | number | null | undefined) ?? ''));
    exportPdf(`${source}-custom-report.pdf`, `Custom Report — ${SOURCES.find((s) => s.id === source)?.label}`, headers, dataRows);
  }

  async function handleSave() {
    if (!saveName.trim()) return;
    try {
      const saved = await api.reports.savedReports.create({
        name: saveName.trim(),
        source,
        columns: selectedColumns,
        filters: { propertyId, periodStart, periodEnd },
      });
      setSavedReports((prev) => [saved, ...prev]);
      setSaveName('');
    } catch (err: any) {
      setError(err.message || 'Failed to save report.');
    }
  }

  async function handleLoadSaved(saved: any) {
    setSource(saved.source);
    // Re-run with the saved column selection once the source's data has loaded.
    setTimeout(() => runReport(saved.columns), 0);
  }

  async function handleDeleteSaved(id: string) {
    await api.reports.savedReports.delete(id);
    setSavedReports((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Data Source</label>
          <select className="form-input" value={source} onChange={(e) => setSource(e.target.value)} style={{ width: '220px' }}>
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => runReport(selectedColumns)} disabled={loading}>
          {loading ? 'Running…' : 'Run Report'}
        </button>
        <button className="btn btn-sm btn-secondary" onClick={handleExportCsv} disabled={rows.length === 0}>
          Export CSV
        </button>
        <button className="btn btn-sm btn-secondary" onClick={handleExportPdf} disabled={rows.length === 0}>
          Export PDF
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Columns</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxWidth: '480px' }}>
            {availableColumns.map((col) => (
              <label key={col} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(col)}
                  onChange={() => toggleColumn(col)}
                />
                {col}
              </label>
            ))}
          </div>
        </div>

        <div>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Save this configuration</h4>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="form-input"
              placeholder="Report name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              style={{ width: '180px' }}
            />
            <button className="btn btn-sm btn-secondary" onClick={handleSave}>Save</button>
          </div>
          {savedReports.length > 0 && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {savedReports.map((s) => (
                <div key={s.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleLoadSaved(s)}>{s.name}</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteSaved(s.id)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {selectedColumns.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {selectedColumns.map((c) => <td key={c}>{String(row[c] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !loading && (
          <div className="empty-state"><p>No data for this configuration.</p></div>
        )}
      </div>
    </div>
  );
}
