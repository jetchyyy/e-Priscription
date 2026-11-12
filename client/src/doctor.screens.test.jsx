import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CreatePrescription from './features/doctor/pages/CreatePrescription';
import { PrescriptionHistory } from './features/doctor/components/PrescriptionHistory';

const wrap = (el) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToString(<QueryClientProvider client={qc}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

describe('doctor form is split by kind', () => {
  it('prescription pad', () => {
    const html = wrap(<CreatePrescription kind="rx" />);
    const t = text(html);
    expect(t).toContain('New prescription');
    expect(t).toContain('3. Medicines');
    expect(t).toContain('Review prescription');
    expect(t).toContain('Add contact and address (optional)');
    expect(t).toContain('three times a day'); // frequency chip
    expect(t).toContain('14 days'); // duration chip
    expect(html).not.toContain('radiogroup');
  });

  it('lab request pad', () => {
    const t = text(wrap(<CreatePrescription kind="lab" />));
    expect(t).toContain('New lab request');
    expect(t).toContain('2. Reason for request');
    expect(t).toContain('3. Laboratory tests');
    expect(t).toContain('Review lab request');
    expect(t).not.toContain('3. Medicines');
    expect(t).toContain('Choose a test…'); // lab test dropdown
    expect(t).toContain('Complete Blood Count (CBC)');
    expect(t).toContain('Others (please specify)');
  });
});

describe('history', () => {
  const items = [
    { id: 'aaaaaaaa-1', kind: 'rx', patient_name: 'Juan Santos', amount: 50, payment_status: 'paid', created_at: '2026-11-01T02:00:00Z' },
    { id: 'bbbbbbbb-2', kind: 'lab', patient_name: 'Maria Cruz', amount: 80, payment_status: 'pending', created_at: '2026-11-02T02:00:00Z' },
  ];
  it('shows type filter, Ref. No. and a labelled View link', () => {
    const t = text(wrap(<PrescriptionHistory items={items} />));
    expect(t).toContain('Lab requests');
    expect(t).toContain('Ref. No.');
    expect(t).toContain('View');
  });
  it('empty state offers both documents', () => {
    const t = text(wrap(<PrescriptionHistory items={[]} />));
    expect(t).toContain('New prescription');
    expect(t).toContain('New lab request');
  });
});
