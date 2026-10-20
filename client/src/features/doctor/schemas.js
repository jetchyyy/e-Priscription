import { z } from 'zod';

const MAX_FILE = 5 * 1024 * 1024;
export const LICENSE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const text = (label, min = 2, max = 150) =>
  z.string().trim().min(min, `${label} is required`).max(max, `${label} is too long`);

const optional = (max) => z.string().trim().max(max, 'Too long').optional();

/** PH mobile (09xx / +639xx) or landline with area code. Spaces and dashes allowed. */
const phSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^(\+63|63|0)\d{9,10}$/, 'Enter a valid PH number, e.g. 0917 123 4567'));

export const optionalPhone = z.union([z.literal(''), phSchema]).optional();

const digitsOnly = (label, min, max) =>
  z.string().trim().regex(new RegExp(`^\\d{${min},${max}}$`), `${label} should be ${min}–${max} digits`);

export const registerSchema = z
  .object({
    fullName: text('Full name', 3, 120),
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
    prcNo: digitsOnly('PRC license number', 5, 10),
    ptrNo: z.union([z.literal(''), digitsOnly('PTR number', 1, 12)]).optional(),
    s2No: optional(20),
    specialty: text('Specialty', 2, 100),
    clinicName: text('Clinic / hospital name', 2, 150),
    clinicAddress: text('Clinic address', 5, 250),
    phone: phSchema,
    licenseFile: z
      .any()
      .refine((f) => f?.length === 1, 'Upload a photo or PDF of your PRC license')
      .refine((f) => !f?.[0] || f[0].size <= MAX_FILE, 'File must be 5 MB or smaller')
      .refine((f) => !f?.[0] || LICENSE_TYPES.includes(f[0].type), 'Use a JPG, PNG or PDF file'),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'Agree to the Terms and Conditions and the Privacy Policy to create your account' }),
    }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const medicineSchema = z.object({
  genericName: text('Generic name', 2, 120),
  brandName: optional(120),
  strength: text('Strength', 1, 60),
  form: text('Dosage form', 1, 40),
  quantity: text('Quantity', 1, 20),
  dose: text('Dose', 1, 80),
  frequency: text('Frequency', 1, 80),
  duration: text('Duration', 1, 60),
  instructions: optional(300),
});

export const prescriptionSchema = z.object({
  patientName: text('Patient name', 2, 120),
  patientSex: z.enum(['', 'Male', 'Female']).optional(),
  patientDob: z
    .string()
    .optional()
    .refine((v) => !v || new Date(v) <= new Date(), 'Date of birth cannot be in the future'),
  patientContact: optionalPhone,
  patientAddress: optional(250),
  diagnosis: optional(500),
  notes: optional(1000),
  amount: z
    .number({ invalid_type_error: 'Enter an amount' })
    .min(20, 'Minimum fee is ₱20')
    .max(5000, 'Maximum fee is ₱5,000'),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits'),
  medicines: z.array(medicineSchema).min(1, 'Add at least one medicine').max(15, 'Maximum of 15 medicines'),
});

export const emptyMedicine = {
  genericName: '', brandName: '', strength: '', form: 'Tablet', quantity: '',
  dose: '', frequency: '', duration: '', instructions: '',
};

export const DOSAGE_FORMS = [
  'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Drops', 'Cream', 'Ointment',
  'Gel', 'Inhaler', 'Nebule', 'Injection', 'Sachet', 'Suppository', 'Patch',
];

export const FREQUENCY_SUGGESTIONS = [
  'once a day', 'twice a day', 'three times a day', 'four times a day',
  'every 4 hours', 'every 6 hours', 'every 8 hours', 'every 12 hours',
  'at bedtime', 'once a week', 'as needed (PRN)',
];
