import { PrescriptionContent } from './PrescriptionContent';

/** Placeholder layout built ONLY from masked, server-approved fields + dummy text. */
function toPlaceholder(rx) {
  return {
    id: rx.id,
    created_at: rx.created_at,
    diagnosis: 'Hidden until payment',
    notes: null,
    doctor: {
      full_name: rx.doctor?.full_name || 'Licensed Physician',
      specialty: rx.doctor?.specialty,
      clinic_name: rx.doctor?.clinic_name || 'Medical Clinic',
      clinic_address: rx.doctor?.clinic_address || 'Clinic address, City, Philippines',
      phone: rx.doctor?.phone || '0900 000 0000',
      email: rx.doctor?.email,
      prc_no: rx.doctor?.prc_no || '0000000',
      ptr_no: rx.doctor?.ptr_no,
      s2_no: rx.doctor?.s2_no,
    },
    patient: { name: rx.patient_hint || 'P*** N***', sex: 'Male', address: 'Hidden address, City', contact: '0900 000 0000' },
    medicines: Array.from({ length: Math.min(Math.max(rx.medicine_count ?? 1, 1), 6) }, () => ({
      genericName: 'Medicine name here',
      brandName: 'Brand',
      strength: '500 mg',
      form: 'Tablet',
      quantity: '21',
      dose: '1 tablet',
      frequency: 'three times a day',
      duration: '7 days',
      instructions: 'Take after meals',
    })),
  };
}

/**
 * Visual teaser only. The blur is decoration - the real content is simply not
 * in the page, because the server withholds it until payment is confirmed.
 */
export function BlurredPrescription({ rx }) {
  return (
    <div aria-hidden="true" inert="" className="pointer-events-none select-none blur-[7px] saturate-75">
      <PrescriptionContent rx={toPlaceholder(rx)} />
    </div>
  );
}
