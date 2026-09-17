'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const APPLIANCE_CATEGORY_LABELS: Record<string, string> = {
  hvac: 'HVAC',
  water_heater: 'Water Heater',
  refrigerator: 'Refrigerator',
  dishwasher: 'Dishwasher',
  washer: 'Washer',
  dryer: 'Dryer',
  oven_range: 'Oven / Range',
  microwave: 'Microwave',
  garbage_disposal: 'Garbage Disposal',
  other: 'Other',
};

interface ApplianceQrModalProps {
  appliance: { id: string; category: string; make: string | null; model: string | null };
  unitNumber: string;
  propertyId: string;
  unitId: string;
  onClose: () => void;
}

/**
 * Printable QR label for one appliance. The code links back to this unit's
 * detail page with ?appliance=<id> so scanning it deep-links to (and
 * highlights) that appliance's card — there's no separate per-appliance
 * detail page in the app today.
 */
export default function ApplianceQrModal({ appliance, unitNumber, propertyId, unitId, onClose }: ApplianceQrModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const targetUrl = `${window.location.origin}/properties/${propertyId}/units/${unitId}?appliance=${appliance.id}`;
    let cancelled = false;
    QRCode.toDataURL(targetUrl, { width: 240, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [appliance.id, propertyId, unitId]);

  const label = [
    APPLIANCE_CATEGORY_LABELS[appliance.category] ?? appliance.category,
    [appliance.make, appliance.model].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #appliance-qr-label, #appliance-qr-label * { visibility: visible; }
          #appliance-qr-label {
            position: fixed;
            top: 40px;
            left: 0;
            width: 100%;
          }
        }
      `}</style>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Appliance QR Label</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" id="appliance-qr-label" style={{ textAlign: 'center' }}>
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="Appliance QR code" width={240} height={240} />
          ) : (
            <p>Generating…</p>
          )}
          <p style={{ marginTop: '12px', fontWeight: 600 }}>Unit {unitNumber}</p>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{label}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!dataUrl}>
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
