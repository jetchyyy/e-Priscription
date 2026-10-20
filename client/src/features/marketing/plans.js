// Placeholder: ODYSSEY's real sales address goes here before launch.
export const CONTACT_EMAIL = 'hello@odyssey.example';

// Sample plans and limits. Prices are placeholders for ODYSSEY to confirm before launch.

export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 0,
    who: 'For trying it in your clinic before you commit.',
    rxLimit: 20,
    doctors: 1,
    cta: 'Start free',
    lines: ['1 doctor', '1 payment QR', '90 days of history'],
  },
  {
    id: 'solo',
    name: 'Solo',
    monthly: 499,
    who: 'For a doctor with their own practice.',
    rxLimit: 250,
    doctors: 1,
    cta: 'Choose Solo',
    lines: ['1 doctor', '3 payment QRs', 'Full history', 'Your clinic letterhead', 'CSV export'],
  },
  {
    id: 'clinic',
    name: 'Clinic',
    monthly: 1999,
    who: 'For a clinic where several doctors share one front desk.',
    rxLimit: 1500,
    doctors: 5,
    extraDoctor: 349,
    cta: 'Choose Clinic',
    lines: [
      'Up to 5 doctors',
      '₱349 per extra doctor',
      '10 payment QRs',
      'Letterhead per doctor',
      'Clinic admin and reports',
      'Onboarding call',
    ],
  },
];

/** Yearly billing: pay for ten months, get twelve. */
export const yearlyPrice = (monthly) => monthly * 10;

export const peso = (n) => `₱${Number(n).toLocaleString('en-PH')}`;

/** Rows of the limits table. Each value is in words, never a tick. */
export const LIMITS = [
  { label: 'Prescriptions a month', values: ['20', '250', '1,500 shared'] },
  { label: 'Doctors', values: ['1', '1', 'Up to 5, then ₱349 each'] },
  { label: 'Payment QR codes', values: ['1', '3', '10'] },
  { label: 'Prescription history', values: ['Last 90 days', 'Everything', 'Everything'] },
  { label: 'Letterhead on the Rx', values: ['Standard', 'Your clinic', 'One per doctor'] },
  { label: 'Security PIN on paid Rx', values: ['Included', 'Included', 'Included'] },
  { label: 'PRC license check', values: ['Included', 'Included', 'Included'] },
  { label: 'Export', values: ['Not included', 'CSV', 'CSV and monthly report'] },
  { label: 'Support', values: ['Email', 'Email, next business day', 'Priority, with onboarding call'] },
];

/** Smallest plan that covers the volume and the number of doctors. */
export function recommend(rxPerMonth, doctors) {
  if (doctors > 1 || rxPerMonth > 250) {
    if (rxPerMonth > 1500 || doctors > 15) return { plan: null };
    const extra = Math.max(0, doctors - 5);
    return { plan: PLANS[2], extraDoctors: extra };
  }
  if (rxPerMonth > 20) return { plan: PLANS[1], extraDoctors: 0 };
  return { plan: PLANS[0], extraDoctors: 0 };
}
