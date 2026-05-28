'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Step = 'personal' | 'employment' | 'history' | 'household' | 'authorization';

interface AppContext {
  id: string;
  status: string;
  alreadySubmitted: boolean;
  unit: {
    unitNumber: string;
    bedrooms: number;
    bathrooms: number;
    rentAmount: number;
    depositAmount: number;
    propertyName: string;
    address: string;
    city: string;
    state: string;
  };
  organizationName: string;
}

interface Pet { type: string; breed: string; weight: string; name: string }
interface Vehicle { make: string; model: string; color: string; plate: string; state: string }

const STEPS: { key: Step; label: string }[] = [
  { key: 'personal', label: 'Personal Info' },
  { key: 'employment', label: 'Employment' },
  { key: 'history', label: 'Rental History' },
  { key: 'household', label: 'Household' },
  { key: 'authorization', label: 'Authorization' },
];

export default function ApplyPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [context, setContext] = useState<AppContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState<Step>('personal');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Step 1
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');

  // Step 2
  const [employerName, setEmployerName] = useState('');
  const [employerPhone, setEmployerPhone] = useState('');
  const [monthlyGrossIncome, setMonthlyGrossIncome] = useState('');
  const [incomeSource, setIncomeSource] = useState('');

  // Step 3
  const [previousAddress, setPreviousAddress] = useState('');

  // Step 4
  const [occupantCount, setOccupantCount] = useState('1');
  const [pets, setPets] = useState<Pet[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Step 5
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [signatureName, setSignatureName] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/v1/apply/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setError(json.error.message); return; }
        setContext(json.data);
        if (json.data.alreadySubmitted) {
          router.replace(`/apply/${token}/submitted`);
        }
      })
      .catch(() => setError('Failed to load application. Please check the link and try again.'))
      .finally(() => setLoading(false));
  }, [token, router]);

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function goNext() {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].key);
  }
  function goBack() {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx > 0) setStep(STEPS[idx - 1].key);
  }

  function addPet() { setPets([...pets, { type: '', breed: '', weight: '', name: '' }]); }
  function removePet(i: number) { setPets(pets.filter((_, idx) => idx !== i)); }
  function updatePet(i: number, field: keyof Pet, value: string) {
    setPets(pets.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  }

  function addVehicle() { setVehicles([...vehicles, { make: '', model: '', color: '', plate: '', state: '' }]); }
  function removeVehicle(i: number) { setVehicles(vehicles.filter((_, idx) => idx !== i)); }
  function updateVehicle(i: number, field: keyof Vehicle, value: string) {
    setVehicles(vehicles.map((v, idx) => idx === i ? { ...v, [field]: value } : v));
  }

  async function handleSubmit() {
    if (!consentGiven) { setSubmitError('You must agree to the authorization statement to submit.'); return; }
    if (!signatureName.trim()) { setSubmitError('Please type your full legal name as your electronic signature.'); return; }

    setSubmitting(true);
    setSubmitError('');
    try {
      const payload: any = {
        applicantName,
        applicantEmail,
        applicantPhone: applicantPhone || null,
        dateOfBirth: dateOfBirth || null,
        currentAddress: currentAddress || null,
        previousAddress: previousAddress || null,
        employerName: employerName || null,
        employerPhone: employerPhone || null,
        monthlyGrossIncome: monthlyGrossIncome ? parseFloat(monthlyGrossIncome) : null,
        incomeSource: incomeSource || null,
        occupantCount: parseInt(occupantCount) || 1,
        pets: pets.length > 0 ? pets.map((p) => ({ ...p, weight: parseFloat(p.weight) || 0 })) : null,
        vehicles: vehicles.length > 0 ? vehicles : null,
        emergencyContactName: emergencyContactName || null,
        emergencyContactPhone: emergencyContactPhone || null,
        consentGiven: true,
      };

      const res = await fetch(`${API_URL}/api/v1/apply/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json.error?.message || 'Submission failed. Please try again.'); return; }
      router.push(`/apply/${token}/submitted`);
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7' }}>
      <p style={{ color: '#6b7280' }}>Loading application…</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7' }}>
      <div style={{ maxWidth: '500px', background: '#fff', padding: '32px', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: '8px' }}>Link not found</p>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>{error}</p>
      </div>
    </div>
  );

  if (!context) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7', padding: '24px 16px' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px 24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#111827' }}>
                Rental Application
              </h1>
              <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                {context.unit.propertyName} — Unit {context.unit.unitNumber}, {context.unit.city}, {context.unit.state}
              </p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '13px', color: '#374151' }}>
              <div style={{ fontWeight: 600 }}>${context.unit.rentAmount.toLocaleString()}/mo</div>
              <div style={{ color: '#6b7280' }}>${context.unit.depositAmount.toLocaleString()} deposit</div>
            </div>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#6b7280' }}>{context.organizationName}</p>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                style={{
                  flex: 1,
                  height: '4px',
                  borderRadius: '2px',
                  background: i <= stepIndex ? '#2563eb' : '#e5e7eb',
                  transition: 'background 0.2s',
                }}
              />
            ))}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#6b7280' }}>
            Step {stepIndex + 1} of {STEPS.length} — {STEPS[stepIndex].label}
          </p>
        </div>

        {/* Form */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '24px' }}>

          {step === 'personal' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 600 }}>Personal Information</h2>
              <div className="form-group">
                <label>Full Legal Name *</label>
                <input className="form-control" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Email Address *</label>
                <input type="email" className="form-control" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input className="form-control" value={applicantPhone} onChange={(e) => setApplicantPhone(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <input type="date" className="form-control" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Current Address</label>
                <input className="form-control" value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} />
              </div>
            </div>
          )}

          {step === 'employment' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 600 }}>Employment & Income</h2>
              <div className="form-row">
                <div className="form-group">
                  <label>Employer Name</label>
                  <input className="form-control" value={employerName} onChange={(e) => setEmployerName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Employer Phone</label>
                  <input className="form-control" value={employerPhone} onChange={(e) => setEmployerPhone(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Monthly Gross Income ($)</label>
                  <input type="number" min="0" className="form-control" value={monthlyGrossIncome} onChange={(e) => setMonthlyGrossIncome(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Income Source</label>
                  <select className="form-control" value={incomeSource} onChange={(e) => setIncomeSource(e.target.value)}>
                    <option value="">Select…</option>
                    <option value="employment">Employment</option>
                    <option value="self_employed">Self-Employed</option>
                    <option value="benefits">Benefits / Assistance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 'history' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 600 }}>Rental History</h2>
              <div className="form-group">
                <label>Previous Address</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Street, City, State, Zip"
                  value={previousAddress}
                  onChange={(e) => setPreviousAddress(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 'household' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 600 }}>Household</h2>
              <div className="form-group" style={{ maxWidth: '160px' }}>
                <label>Total Occupants</label>
                <input type="number" min="1" max="20" className="form-control" value={occupantCount} onChange={(e) => setOccupantCount(e.target.value)} />
              </div>

              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ margin: 0, fontWeight: 600 }}>Pets</label>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addPet}>+ Add Pet</button>
                </div>
                {pets.map((pet, i) => (
                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px', marginBottom: '8px' }}>
                    <div className="form-row">
                      <div className="form-group"><label>Type</label><input className="form-control" placeholder="Cat, Dog…" value={pet.type} onChange={(e) => updatePet(i, 'type', e.target.value)} /></div>
                      <div className="form-group"><label>Breed</label><input className="form-control" value={pet.breed} onChange={(e) => updatePet(i, 'breed', e.target.value)} /></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group"><label>Name</label><input className="form-control" value={pet.name} onChange={(e) => updatePet(i, 'name', e.target.value)} /></div>
                      <div className="form-group"><label>Weight (lbs)</label><input type="number" className="form-control" value={pet.weight} onChange={(e) => updatePet(i, 'weight', e.target.value)} /></div>
                    </div>
                    <button type="button" className="btn btn-sm" style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px' }} onClick={() => removePet(i)}>Remove</button>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ margin: 0, fontWeight: 600 }}>Vehicles</label>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addVehicle}>+ Add Vehicle</button>
                </div>
                {vehicles.map((v, i) => (
                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px', marginBottom: '8px' }}>
                    <div className="form-row">
                      <div className="form-group"><label>Make</label><input className="form-control" value={v.make} onChange={(e) => updateVehicle(i, 'make', e.target.value)} /></div>
                      <div className="form-group"><label>Model</label><input className="form-control" value={v.model} onChange={(e) => updateVehicle(i, 'model', e.target.value)} /></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group"><label>Color</label><input className="form-control" value={v.color} onChange={(e) => updateVehicle(i, 'color', e.target.value)} /></div>
                      <div className="form-group"><label>License Plate</label><input className="form-control" value={v.plate} onChange={(e) => updateVehicle(i, 'plate', e.target.value)} /></div>
                      <div className="form-group"><label>State</label><input className="form-control" maxLength={2} style={{ textTransform: 'uppercase' }} value={v.state} onChange={(e) => updateVehicle(i, 'state', e.target.value.toUpperCase())} /></div>
                    </div>
                    <button type="button" className="btn btn-sm" style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px' }} onClick={() => removeVehicle(i)}>Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'authorization' && (
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 600 }}>Emergency Contact & Authorization</h2>
              <div className="form-row">
                <div className="form-group">
                  <label>Emergency Contact Name</label>
                  <input className="form-control" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Emergency Contact Phone</label>
                  <input className="form-control" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
                </div>
              </div>

              <div style={{ marginTop: '20px', padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '13px', lineHeight: '1.6', color: '#374151' }}>
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Authorization & Electronic Signature Disclosure</p>
                <p style={{ margin: '0 0 8px' }}>
                  By submitting this application, I certify that all information provided is true and complete. I authorize <strong>{context.organizationName}</strong> to verify the information provided, contact references, and conduct a background and credit screening as part of the rental application process.
                </p>
                <p style={{ margin: 0 }}>
                  I understand that submitting this form constitutes an electronic signature under the Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA).
                </p>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                  <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', flexShrink: 0 }} />
                  I have read and agree to the authorization statement above.
                </label>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label>Type your full legal name as your electronic signature *</label>
                <input
                  className="form-control"
                  placeholder="Full legal name"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                />
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
                  By typing your name, you agree this constitutes your electronic signature.
                </p>
              </div>

              {submitError && (
                <p style={{ color: '#dc2626', fontSize: '14px', margin: '12px 0 0' }}>{submitError}</p>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
          {stepIndex > 0
            ? <button type="button" className="btn btn-secondary" onClick={goBack}>Back</button>
            : <span />
          }
          {step !== 'authorization'
            ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={goNext}
                disabled={step === 'personal' && (!applicantName.trim() || !applicantEmail.trim())}
              >
                Continue
              </button>
            )
            : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>
            )
          }
        </div>
      </div>
    </div>
  );
}
