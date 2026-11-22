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

describe('plan usage with extra prescriptions', () => {
  it('shows plan + extra as one allowance', async () => {
    const { PlanUsage, myPlanQuery } = await import('./features/doctor/components/PlanUsage');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    qc.setQueryData(myPlanQuery.queryKey, {
      plan_id: 'solo', plan_name: 'Solo', is_paid: true, current_period_end: '2027-01-22T00:00:00Z',
      rx_limit: 250, rx_used: 6, rx_left: 319, resets_at: '2026-12-01T00:00:00+08:00', clinic: null,
      credits: { remaining: 75, expires_at: '2027-01-20T00:00:00Z' },
    });
    const t = text(renderToString(<QueryClientProvider client={qc}><MemoryRouter><PlanUsage /></MemoryRouter></QueryClientProvider>));
    expect(t).toContain('319 left of 325');
    expect(t).toContain('250 from your plan this month + 75 extra you bought');
    expect(t).toContain('244 left in your plan');
    expect(t).toContain('75 extra, used after your plan’s run out');
  });
});

describe('change password checklist', () => {
  it('ticks each rule as the password gets stronger', async () => {
    const { checkPassword } = await import('./features/doctor/components/ChangePasswordCard');
    const weak = checkPassword('abc', { current: 'Old#Pass1234', confirm: 'abc' });
    expect(weak.ok).toBe(false);
    expect(weak.items.find((i) => i.id === 'length').ok).toBe(false);
    expect(weak.items.find((i) => i.id === 'lower').ok).toBe(true);

    expect(checkPassword('New#Pass1234', { current: 'Old#Pass1234', confirm: 'New#Pass1234' }).ok).toBe(true);
    expect(checkPassword('Old#Pass1234', { current: 'Old#Pass1234', confirm: 'Old#Pass1234' }).ok).toBe(false); // same as current
    expect(checkPassword('New#Pass1234', { current: 'x', confirm: 'New#Pass123' }).ok).toBe(false); // mismatch
    expect(checkPassword('New# Pass1234', { current: 'x', confirm: 'New# Pass1234' }).ok).toBe(false); // space
  });

  it('renders the card with its checklist', async () => {
    const { ChangePasswordCard } = await import('./features/doctor/components/ChangePasswordCard');
    const t = text(wrap(<ChangePasswordCard />));
    expect(t).toContain('Change password');
    expect(t).toContain('At least 10 characters');
    expect(t).toContain('Both new passwords match');
  });
});

describe('patient agrees to the terms before paying', () => {
  it('shows the checkbox with links to both documents', async () => {
    const { TermsAgreement } = await import('./features/patient/components/PaymentQrModal');
    const html = renderToString(<TermsAgreement checked={false} onChange={() => {}} />);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('href="/terms#patients"');
    expect(html).toContain('href="/privacy"');
    expect(text(html)).toContain('I agree to the Terms and Conditions and have read the Privacy Policy');
  });

  it('terms have a patient section and real dates', async () => {
    const { default: Terms } = await import('./pages/Terms');
    const t = text(wrap(<Terms />));
    expect(t).toContain('For patients');
    expect(t).toContain('Effective November 22, 2026 · Last updated November 22, 2026');
  });
});
