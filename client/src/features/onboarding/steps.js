/**
 * Steps for the interactive setup guide ("Show me around")
 * Exactly per odyssey-design.md Task 2 section 12.
 */

export const SETUP_STEPS = [
  {
    id: 'welcome',
    // Handled by WelcomeModal
    isModal: true,
  },
  {
    id: 'nav-profile',
    tourTarget: 'nav-profile',
    path: '/doctor',
    title: 'Doctor and clinic details',
    text: 'Start with your details. They print on every prescription.',
    stepNumber: 2,
    nextPath: '/doctor/profile',
  },
  {
    id: 'license-fields',
    tourTarget: 'license-fields',
    path: '/doctor/profile',
    title: 'Licenses and credentials',
    text: 'Add your PRC, PTR and, if you prescribe dangerous drugs, your S2 number.',
    stepNumber: 3,
  },
  {
    id: 'clinic-panel',
    tourTarget: 'clinic-panel',
    path: '/doctor/profile',
    title: 'Clinic letterhead',
    text: 'Your clinic name and address form the letterhead. Save when you’re done.',
    stepNumber: 4,
  },
  {
    id: 'nav-qr',
    tourTarget: 'nav-qr',
    path: '/doctor/profile',
    title: 'Payment QR codes',
    text: 'Navigate to your QR codes so patients can pay you directly.',
    stepNumber: 5,
    nextPath: '/doctor/qr-codes',
  },
  {
    id: 'qr-add',
    tourTarget: 'qr-add',
    path: '/doctor/qr-codes',
    title: 'Add payment QR',
    text: 'Upload your GCash, Maya or bank QR. Patients pay the fee into it before the prescription opens.',
    stepNumber: 6,
  },
  {
    id: 'nav-new',
    tourTarget: 'nav-new',
    path: '/doctor/qr-codes',
    title: 'New prescription',
    text: 'Open the prescription form to write your first electronic prescription.',
    stepNumber: 7,
    nextPath: '/doctor/new',
  },
  {
    id: 'rx-patient',
    tourTarget: 'rx-patient',
    path: '/doctor/new',
    title: 'Patient information',
    text: 'Enter your patient’s details. Age is calculated automatically from birth date.',
    stepNumber: 8,
  },
  {
    id: 'rx-create',
    tourTarget: 'rx-create',
    path: '/doctor/new',
    title: 'Create and share',
    text: 'Create the prescription, then copy the link into Viber, Messenger or SMS. It opens once your patient pays.',
    stepNumber: 9,
    isLast: true,
  },
];
