import { describe, expect, it } from 'vitest';
import { labRequestSchema, prescriptionSchema } from './schemas';

const base = { patientName: 'Juan Santos', amount: 50, pin: '1234' };

describe('labRequestSchema', () => {
  it('accepts a lab request with tests and no medicines', () => {
    const r = labRequestSchema.safeParse({ ...base, kind: 'lab', labTests: [{ name: 'Urinalysis', notes: '' }] });
    expect(r.success).toBe(true);
    expect(r.data.medicines).toBeUndefined();
  });
  it('requires at least one test', () =>
    expect(labRequestSchema.safeParse({ ...base, kind: 'lab', labTests: [] }).success).toBe(false));
  it('rejects a blank test name', () =>
    expect(labRequestSchema.safeParse({ ...base, kind: 'lab', labTests: [{ name: ' ' }] }).success).toBe(false));
  it('keeps the same fee and PIN rules as a prescription', () => {
    expect(labRequestSchema.safeParse({ ...base, amount: 5, kind: 'lab', labTests: [{ name: 'CBC' }] }).success).toBe(false);
    expect(labRequestSchema.safeParse({ ...base, pin: '12', kind: 'lab', labTests: [{ name: 'CBC' }] }).success).toBe(false);
  });
});

describe('prescriptionSchema kind', () => {
  it('defaults to rx and drops lab tests', () => {
    const med = { genericName: 'Amoxicillin', strength: '500 mg', form: 'Capsule', quantity: '21', dose: '1', frequency: 'tid', duration: '7 days' };
    const r = prescriptionSchema.safeParse({ ...base, medicines: [med], labTests: [{ name: 'CBC' }] });
    expect(r.success).toBe(true);
    expect(r.data.kind).toBe('rx');
    expect(r.data.labTests).toBeUndefined();
  });
});
