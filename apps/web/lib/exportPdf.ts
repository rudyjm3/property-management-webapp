import { jsPDF } from 'jspdf';

/**
 * Minimal tabular PDF export — mirrors exportCsv's signature so report pages
 * can offer both formats from the same headers/rows data. Paginates and
 * re-draws the header row when a page fills up.
 */
export function exportPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
  const marginX = 40;
  let y = 50;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const colWidth = (pageWidth - marginX * 2) / Math.max(headers.length, 1);

  doc.setFontSize(16);
  doc.text(title, marginX, y);
  y += 12;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, marginX, y);
  y += 24;
  doc.setTextColor(0);

  function drawHeaderRow() {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    headers.forEach((h, i) => {
      doc.text(String(h), marginX + i * colWidth, y);
    });
    y += 6;
    doc.setLineWidth(0.5);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
  }

  drawHeaderRow();

  for (const row of rows) {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 50;
      drawHeaderRow();
    }
    row.forEach((cell, i) => {
      const text = cell == null ? '' : String(cell);
      doc.text(text, marginX + i * colWidth, y, { maxWidth: colWidth - 6 });
    });
    y += 16;
  }

  doc.save(filename);
}
