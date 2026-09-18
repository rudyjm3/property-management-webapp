import { jsPDF } from 'jspdf';

interface ChecklistResult {
  section: string;
  item: string;
  condition?: string | null;
  notes?: string | null;
}

interface InspectionMedia {
  storageKey: string;
  mediaType: string;
  capturedAt: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

interface InspectionForPdf {
  id: string;
  type: string;
  status: string;
  completedAt: string | null;
  notes: string | null;
  checklistResults: ChecklistResult[];
  tenantSignatureName: string | null;
  tenantSignatureAt: string | null;
  managerSignatureName: string | null;
  managerSignatureAt: string | null;
  media?: InspectionMedia[];
}

/**
 * Client-side inspection report PDF — mirrors exportPdf.ts's pagination
 * pattern. Follows the repo convention of generating PDFs in the browser
 * (jsPDF, already a web dependency) rather than adding a server-side PDF
 * library. Photos/videos are listed by storage key (not downloaded/embedded
 * as images) to keep this simple — see docs/reference/modules.md.
 */
export function exportInspectionPdf(
  filename: string,
  unitLabel: string,
  inspection: InspectionForPdf
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt' });
  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 50;

  function ensureSpace(lineHeight = 16) {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = 50;
    }
  }

  doc.setFontSize(18);
  doc.text('Inspection Report', marginX, y);
  y += 20;
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text(unitLabel, marginX, y);
  y += 14;
  doc.text(`Type: ${inspection.type.replace(/_/g, ' ')}   Status: ${inspection.status.replace(/_/g, ' ')}`, marginX, y);
  y += 14;
  doc.text(
    `Completed: ${inspection.completedAt ? new Date(inspection.completedAt).toLocaleString() : 'Not yet completed'}`,
    marginX,
    y
  );
  y += 24;
  doc.setTextColor(0);

  doc.setFontSize(13);
  doc.text('Checklist', marginX, y);
  y += 8;
  doc.setLineWidth(0.5);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 16;
  doc.setFontSize(9);

  let currentSection = '';
  for (const result of inspection.checklistResults) {
    ensureSpace();
    if (result.section !== currentSection) {
      currentSection = result.section;
      doc.setFont('helvetica', 'bold');
      doc.text(currentSection, marginX, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
    }
    ensureSpace();
    doc.text(`${result.item} — ${result.condition ?? 'n/a'}`, marginX + 10, y);
    y += 12;
    if (result.notes) {
      ensureSpace();
      doc.setTextColor(100);
      doc.text(`  Notes: ${result.notes}`, marginX + 10, y, { maxWidth: pageWidth - marginX * 2 - 10 });
      doc.setTextColor(0);
      y += 12;
    }
  }

  if (inspection.notes) {
    y += 12;
    ensureSpace();
    doc.setFont('helvetica', 'bold');
    doc.text('Overall Notes', marginX, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.text(inspection.notes, marginX, y, { maxWidth: pageWidth - marginX * 2 });
    y += 20;
  }

  if (inspection.media && inspection.media.length > 0) {
    y += 8;
    ensureSpace();
    doc.setFontSize(13);
    doc.text('Photo/Video Documentation', marginX, y);
    y += 16;
    doc.setFontSize(9);
    for (const m of inspection.media) {
      ensureSpace();
      const gps = m.latitude != null && m.longitude != null ? ` (GPS: ${m.latitude}, ${m.longitude})` : ' (no GPS)';
      doc.text(
        `[${m.mediaType}] ${new Date(m.capturedAt).toLocaleString()}${gps} — ${m.storageKey}`,
        marginX,
        y,
        { maxWidth: pageWidth - marginX * 2 }
      );
      y += 14;
    }
  }

  y += 16;
  ensureSpace(40);
  doc.setFontSize(13);
  doc.text('Signatures', marginX, y);
  y += 16;
  doc.setFontSize(9);
  doc.text(
    inspection.tenantSignatureName
      ? `Tenant: ${inspection.tenantSignatureName} — signed ${
          inspection.tenantSignatureAt ? new Date(inspection.tenantSignatureAt).toLocaleString() : ''
        }`
      : 'Tenant: not signed',
    marginX,
    y
  );
  y += 14;
  doc.text(
    inspection.managerSignatureName
      ? `Manager/Inspector: ${inspection.managerSignatureName} — signed ${
          inspection.managerSignatureAt ? new Date(inspection.managerSignatureAt).toLocaleString() : ''
        }`
      : 'Manager/Inspector: not signed',
    marginX,
    y
  );

  doc.save(filename);
}
