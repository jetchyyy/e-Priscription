import { describe, expect, it } from 'vitest';
import { buildSig, computeAge, doctorTitle, extractRxId, maskName } from './utils';
import { prescriptionSchema, registerSchema } from '../features/doctor/schemas';

const validMedicine = {
  genericName: 'Amoxicillin', brandName: '', strength: '500 mg', form: 'Capsule', quantity: '21',
  dose: '1 capsule', frequency: 'three times a day', duration: '7 days', instructions: '',
};
const validRx = { patientName: 'Juan Santos', amount: 50, medicines: [validMedicine] };

describe('buildSig', () => {
  it('composes a Philippine-style Sig line', () => {
    expect(buildSig({ ...validMedicine, instructions: 'take after meals' })).toBe(
      'Take 1 capsule three times a day for 7 days. Take after meals.',
    );
  });
});

describe('helpers', () => {
  it('computes age from a YYYY-MM-DD dob', () => {
    expect(computeAge('2016-08-14', new Date(2026, 7, 13))).toBe(9);
    expect(computeAge('2016-08-14', new Date(2026, 7, 14))).toBe(10);
    expect(computeAge('')).toBeNull();
  });
  it('masks patient names', () => expect(maskName('Juan Dela Cruz')).toBe('J*** D*** C***'));
  it('prefixes Dr. only once', () => {
    expect(doctorTitle('Maria Cruz')).toBe('Dr. Maria Cruz');
    expect(doctorTitle('Dr. Maria Cruz')).toBe('Dr. Maria Cruz');
  });
  it('extracts the 21-char id from a pasted link', () => {
    const id = 'V1StGXR8_Z5jdHi6B-myT';
    expect(extractRxId(`https://app.example.com/rx/${id}`)).toBe(id);
    expect(extractRxId(id)).toBe(id);
    expect(extractRxId('hello')).toBeNull();
  });
});

describe('prescriptionSchema', () => {
  it('accepts a valid prescription', () => expect(prescriptionSchema.safeParse(validRx).success).toBe(true));
  it('requires at least one medicine', () =>
    expect(prescriptionSchema.safeParse({ ...validRx, medicines: [] }).success).toBe(false));
  it('requires a generic name (RA 6675)', () =>
    expect(prescriptionSchema.safeParse({ ...validRx, medicines: [{ ...validMedicine, genericName: '' }] }).success).toBe(false));
  it('limits the fee range', () => {
    expect(prescriptionSchema.safeParse({ ...validRx, amount: 5 }).success).toBe(false);
    expect(prescriptionSchema.safeParse({ ...validRx, amount: 9999 }).success).toBe(false);
  });
  it('validates PH phone numbers', () => {
    expect(prescriptionSchema.safeParse({ ...validRx, patientContact: '0917 123 4567' }).success).toBe(true);
    expect(prescriptionSchema.safeParse({ ...validRx, patientContact: '12345' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('rejects mismatching passwords', () => {
    const r = registerSchema.safeParse({
      fullName: 'Maria Cruz', email: 'm@clinic.ph', password: 'abcdefg1', confirmPassword: 'different1',
      prcNo: '0123456', specialty: 'Pediatrics', clinicName: 'Clinic', clinicAddress: 'Makati City',
      phone: '09171234567', licenseFile: [{ size: 10, type: 'application/pdf' }],
    });
    expect(r.success).toBe(false);
  });
});
