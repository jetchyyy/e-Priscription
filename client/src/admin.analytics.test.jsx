import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminAnalytics from './features/admin/pages/AdminAnalytics';
import { AnalyticsTrendChart } from './features/admin/components/AnalyticsTrendChart';

const wrap = (el, seed) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  if (seed) qc.setQueryData(seed.key, seed.data);
  return renderToString(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
};

const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

describe('AdminAnalytics screen', () => {
  it('renders header, range controls, and loading skeleton cleanly', () => {
    const html = wrap(<AdminAnalytics />);
    const t = text(html);
    expect(t).toContain('App analytics');
    expect(t).toContain('7 days');
    expect(t).toContain('30 days');
    expect(t).toContain('90 days');
    expect(t).toContain('This month');
    expect(t).toContain('All time');
    expect(t).toContain('Export CSV');
  });

  it('renders filled analytics metrics and doctor leaderboard without patient PII', () => {
    const sample = {
      meta: { range: '30d', granularity: 'day', generated_at: '2026-11-18T04:00:00Z' },
      documents: {
        total: 42,
        rx_count: 34,
        lab_count: 8,
        paid_count: 30,
        pending_count: 4,
        unpaid_count: 6,
        expired_count: 2,
        conversion_rate: 71.4,
        billed_amount: 8400,
        collected_amount: 6000,
        avg_fee: 200,
        median_fee: 200,
        median_time_to_pay_minutes: 14.5,
        avg_time_to_pay_minutes: 28.2,
      },
      payments: {
        gateway_rx_total_checkouts: 22,
        gateway_rx_paid_count: 18,
        gateway_rx_paid_amount: 3600,
        gateway_rx_open_count: 3,
        gateway_rx_needs_review: 1,
        gateway_rx_refunded_count: 0,
        gateway_rx_completion_rate: 81.8,
        gateway_methods: [{ method: 'gcash', count: 12, amount: 2400 }],
        manual_total_count: 15,
        manual_confirmed_count: 12,
        manual_rejected_count: 1,
        manual_pending_count: 2,
        manual_confirm_rate: 92.3,
        manual_median_review_minutes: 9.0,
        paid_via_gateway_count: 18,
        paid_via_manual_count: 12,
        paid_via_other_count: 0,
      },
      doctors: {
        total_registered: 25,
        approved: 20,
        pending_approval: 3,
        rejected: 2,
        registered_in_range: 5,
        active_in_range: 14,
        earning_in_range: 12,
        wau: 11,
        mau: 15,
        avg_rx_per_active_doctor: 3.0,
        activation_rate: 80.0,
        median_approval_hours: 6.5,
        open_change_requests: 1,
      },
      plans_and_clinics: {
        plan_distribution: [
          { plan_id: 'starter', plan_name: 'Starter', doctors_count: 12 },
          { plan_id: 'solo', plan_name: 'Solo', doctors_count: 8 },
        ],
        active_clinics_count: 2,
        clinic_doctors_count: 6,
        near_quota_doctors_count: 3,
        active_pack_credits_remaining: 150,
        plan_requests_in_range: { approved: 4, pending: 1, rejected: 0 },
      },
      series: [{ bucket: '2026-11-17', sent: 10, rx: 8, lab: 2, paid: 7, collected: 1400, active_doctors: 4 }],
      top_doctors: [
        {
          doctor_id: 'doc-1',
          full_name: 'Maria Santos',
          specialty: 'Internal Medicine',
          clinic_name: 'Santos Clinic',
          plan_name: 'Solo',
          sent_count: 15,
          rx_count: 12,
          lab_count: 3,
          paid_count: 12,
          conversion_rate: 80.0,
          collected_amount: 2400,
        },
      ],
      top_specialties: [
        { specialty: 'Internal Medicine', doctors_count: 5, sent_count: 20, paid_count: 15, collected_amount: 3000 },
      ],
    };

    const t = text(wrap(<AdminAnalytics />, { key: ['admin', 'analytics', '30d'], data: sample }));
    expect(t).toContain('Documents sent');
    expect(t).toContain('42');
    expect(t).toContain('71.4% conversion');
    expect(t).toContain('Dr. Maria Santos');
    expect(t).toContain('Internal Medicine');
    expect(t).toContain('PayMongo online checkout');
    expect(t).toContain('Doctor manual QR verification');
    expect(t).toContain('Doctors at ≥ 80% monthly limit');
  });

  it('renders AnalyticsTrendChart with populated series and empty state', () => {
    const filled = text(
      wrap(
        <AnalyticsTrendChart
          granularity="day"
          series={[
            { bucket: '2026-11-16', sent: 12, rx: 9, lab: 3, paid: 8, collected: 1600, active_doctors: 4 },
            { bucket: '2026-11-17', sent: 15, rx: 11, lab: 4, paid: 10, collected: 2100, active_doctors: 5 },
          ]}
        />,
      ),
    );
    expect(filled).toContain('Documents sent and paid over time');
    expect(filled).toContain('Volume');
    expect(filled).toContain('Collected');

    const empty = text(
      wrap(
        <AnalyticsTrendChart
          granularity="day"
          series={[{ bucket: '2026-11-17', sent: 0, rx: 0, lab: 0, paid: 0, collected: 0, active_doctors: 0 }]}
        />,
      ),
    );
    expect(empty).toContain('No prescriptions or payments recorded in this date range yet.');
  });
});
