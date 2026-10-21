// Placeholder: ODYSSEY's real sales address goes here before launch.
export const CONTACT_EMAIL = 'hello@odyssey.example';

// Built-in copy of the plans, used only until the live plans load (the admin edits them in the
// subscription_plans table). Keep it the same as the seed in 0006_subscription_plans.sql.

export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 0,
    yearly: 0,
    qrLimit: 1,
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
    yearly: 4990,
    qrLimit: 3,
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
    yearly: 19990,
    qrLimit: 10,
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

const count = (n) => Number(n).toLocaleString('en-PH');

// Rows that do not come from the plan's numbers, by plan id. A plan the admin adds later shows "Ask us".
const EXTRA_ROWS = [
  { label: 'Prescription history', values: { starter: 'Last 90 days', solo: 'Everything', clinic: 'Everything' } },
  { label: 'Letterhead on the Rx', values: { starter: 'Standard', solo: 'Your clinic', clinic: 'One per doctor' } },
  { label: 'Security PIN on paid Rx', all: 'Included' },
  { label: 'PRC license check', all: 'Included' },
  { label: 'Export', values: { starter: 'Not included', solo: 'CSV', clinic: 'CSV and monthly report' } },
  { label: 'Support', values: { starter: 'Email', solo: 'Email, next business day', clinic: 'Priority, with onboarding call' } },
];

/** Rows of the limits table for these plans. Each value is in words, never a tick. */
export function limitRows(plans) {
  return [
    { label: 'Prescriptions a month', values: plans.map((p) => `${count(p.rxLimit)}${p.doctors > 1 ? ' shared' : ''}`) },
    {
      label: 'Doctors',
      values: plans.map((p) => (p.doctors > 1
        ? `Up to ${p.doctors}${p.extraDoctor ? `, then ${peso(p.extraDoctor)} each` : ''}`
        : '1')),
    },
    { label: 'Payment QR codes', values: plans.map((p) => count(p.qrLimit)) },
    ...EXTRA_ROWS.map((r) => ({ label: r.label, values: plans.map((p) => r.all ?? r.values[p.id] ?? 'Ask us') })),
  ];
}

/** Smallest plan that covers the volume and the number of doctors (plans sorted from smallest). */
export function recommend(rxPerMonth, doctors, plans = PLANS) {
  const fits = plans.find((p) => rxPerMonth <= p.rxLimit && doctors <= p.doctors);
  if (fits) return { plan: fits, extraDoctors: 0 };
  const shared = [...plans].reverse().find((p) => p.extraDoctor && rxPerMonth <= p.rxLimit && doctors <= 15);
  if (shared) return { plan: shared, extraDoctors: doctors - shared.doctors };
  return { plan: null };
}
