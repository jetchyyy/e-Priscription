import { Link } from 'react-router-dom';
import { PublicLayout } from '../components/layout/PublicLayout';
import { Button } from '../components/ui/Button';
import { PrescriptionContent } from '../features/patient/components/PrescriptionContent';

const sample = {
  id: 'SAMPLE-ONLY-NOT-REAL-Rx',
  created_at: new Date().toISOString(),
  diagnosis: 'Acute pharyngitis',
  notes: 'Increase fluid intake and rest. Return to the clinic if fever persists beyond 3 days.',
  doctor: {
    full_name: 'Maria Isabel Dela Cruz, MD',
    specialty: 'Pediatrics',
    clinic_name: 'Dela Cruz Family Clinic',
    clinic_address: '2F Rizal Medical Plaza, Rizal Ave., Brgy. Poblacion, Makati City',
    phone: '0917 123 4567',
    prc_no: '0123456',
    ptr_no: '7654321',
    s2_no: null,
  },
  patient: { name: 'Juan Santos', sex: 'Male', dob: '2016-08-14', address: 'Brgy. San Antonio, Pasig City', contact: '0918 765 4321' },
  medicines: [
    { genericName: 'Amoxicillin', brandName: 'Amoxil', strength: '250 mg/5 mL', form: 'Suspension', quantity: '1', dose: '5 mL', frequency: 'three times a day', duration: '7 days', instructions: 'Complete the full course' },
    { genericName: 'Paracetamol', brandName: 'Calpol', strength: '120 mg/5 mL', form: 'Syrup', quantity: '1', dose: '7.5 mL', frequency: 'every 4 hours', duration: '3 days', instructions: 'Only if with fever (38°C and above)' },
  ],
};

export default function SampleRx() {
  return (
    <PublicLayout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">Sample prescription</h1>
          <p className="text-sm text-ink-500">Fictional data — this is what patients see after unlocking.</p>
        </div>
        <Link to="/doctor/register"><Button>Register as a doctor</Button></Link>
      </div>
      <PrescriptionContent rx={sample} />
    </PublicLayout>
  );
}
