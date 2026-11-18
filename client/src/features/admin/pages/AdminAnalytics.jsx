import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { cn, doctorTitle, formatDateTime, formatPeso } from '../../../lib/utils';
import { downloadCsv, money } from '../../../lib/csv';
import { fetchAppAnalytics } from '../api';
import { AnalyticsTrendChart } from '../components/AnalyticsTrendChart';

const RANGES = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
  { key: '90d', label: '90 days' },
  { key: 'all', label: 'All time' },
];

const METHOD_LABEL = { qrph: 'QR Ph', gcash: 'GCash', paymaya: 'Maya', card: 'Card' };

function formatDurationMinutes(mins) {
  if (mins == null || Number.isNaN(Number(mins))) return '—';
  const m = Number(mins);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)} hr`;
  return `${(h / 24).toFixed(1)} d`;
}

function formatDurationHours(hours) {
  if (hours == null || Number.isNaN(Number(hours))) return '—';
  const h = Number(hours);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) return `${h.toFixed(1)} hr`;
  return `${(h / 24).toFixed(1)} d`;
}

function ODot({ tone = 'navy' }) {
  const color =
    tone === 'orange' ? 'bg-[#ff6f07]' : tone === 'slate' ? 'bg-[#5f6a7c]' : tone === 'sand' ? 'bg-[#c9c1b2]' : 'bg-[#152839]';
  return <span className={cn('inline-block h-2.5 w-2 shrink-0 rounded-[47%/35.6%]', color)} aria-hidden="true" />;
}

function KeyValueList({ rows }) {
  return (
    <dl className="divide-y divide-[#dce1e8] text-sm">
      {rows.map(({ label, value, dot, note }) => (
        <div key={label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <dt className="flex items-center gap-2.5 text-[#45546a]">
            {dot && <ODot tone={dot} />}
            <span>{label}</span>
          </dt>
          <dd className="text-right tabular-nums text-[#152839]">
            <span className="font-semibold">{value}</span>
            {note && <span className="ml-1.5 text-[13px] text-[#5f6a7c]">{note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProgressRow({ label, count, total, tone = 'navy' }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barColor = tone === 'orange' ? 'bg-[#ff6f07]' : tone === 'slate' ? 'bg-[#5f6a7c]' : 'bg-[#152839]';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-[#152839]">{label}</span>
        <span className="tabular-nums text-[#45546a]">
          <strong className="text-[#152839]">{count}</strong> ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#ece7de]">
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${count > 0 ? Math.max(pct, 3) : 0}%` }} />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading analytics">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-[20px] bg-[#ece7de]" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[20px] bg-[#ece7de]" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-[20px] bg-[#ece7de]" />
        <div className="h-64 animate-pulse rounded-[20px] bg-[#ece7de]" />
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [range, setRange] = useState('30d');

  const q = useQuery({
    queryKey: ['admin', 'analytics', range],
    queryFn: () => fetchAppAnalytics(range),
    refetchInterval: 60_000,
  });

  const data = q.data;
  const docs = data?.documents ?? {};
  const payments = data?.payments ?? {};
  const doctors = data?.doctors ?? {};
  const plans = data?.plans_and_clinics ?? {};
  const topDoctors = data?.top_doctors ?? [];
  const topSpecs = data?.top_specialties ?? [];

  const handleExportCsv = () => {
    if (!data) return;
    const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? range;
    if (topDoctors.length > 0) {
      downloadCsv(
        `odyssey-analytics-doctors-${range}.csv`,
        [
          { label: 'Range', value: () => rangeLabel },
          { label: 'Doctor', value: (r) => doctorTitle(r.full_name) },
          { label: 'Specialty', value: (r) => r.specialty || '' },
          { label: 'Clinic', value: (r) => r.clinic_name || '' },
          { label: 'Plan', value: (r) => r.plan_name || '' },
          { label: 'Documents sent', value: (r) => r.sent_count },
          { label: 'Prescriptions', value: (r) => r.rx_count },
          { label: 'Lab requests', value: (r) => r.lab_count },
          { label: 'Paid', value: (r) => r.paid_count },
          { label: 'Conversion %', value: (r) => r.conversion_rate },
          { label: 'Collected (PHP)', value: (r) => money(r.collected_amount) },
        ],
        topDoctors,
      );
      return;
    }

    downloadCsv(
      `odyssey-analytics-summary-${range}.csv`,
      [
        { label: 'Metric', value: (r) => r.metric },
        { label: 'Value', value: (r) => r.value },
      ],
      [
        { metric: 'Range', value: rangeLabel },
        { metric: 'Documents sent', value: docs.total ?? 0 },
        { metric: 'Prescriptions (Rx)', value: docs.rx_count ?? 0 },
        { metric: 'Lab requests', value: docs.lab_count ?? 0 },
        { metric: 'Patients paid', value: docs.paid_count ?? 0 },
        { metric: 'Conversion %', value: docs.conversion_rate ?? 0 },
        { metric: 'Billed (PHP)', value: money(docs.billed_amount) },
        { metric: 'Collected (PHP)', value: money(docs.collected_amount) },
        { metric: 'Active doctors', value: doctors.active_in_range ?? 0 },
      ],
    );
  };

  const totalPaidChannel =
    (Number(payments.paid_via_gateway_count) || 0) +
    (Number(payments.paid_via_manual_count) || 0) +
    (Number(payments.paid_via_other_count) || 0);

  const totalDoctorsOnPlans = (plans.plan_distribution ?? []).reduce((sum, p) => sum + (Number(p.doctors_count) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[32px] font-bold text-[#152839]">App analytics</h1>
          <p className="mt-1 text-sm text-[#45546a]">
            Prescriptions sent, patient payment conversion, and doctor activity across ODYSSEY.
            {data?.meta?.generated_at && (
              <span className="ml-2 text-[13px] text-[#5f6a7c]">Updated {formatDateTime(data.meta.generated_at)}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            role="tablist"
            aria-label="Analytics time range"
            className="flex flex-wrap items-center gap-1 rounded-[22px] border border-[#dce1e8] bg-white p-1 sm:rounded-full"
          >
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={range === r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'min-h-[36px] rounded-full px-3.5 text-[13px] font-semibold transition',
                  range === r.key ? 'bg-[#152839] text-[#f9f8f3]' : 'text-[#45546a] hover:bg-[#ece7de]',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={!data}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>
      </div>

      {q.isError ? (
        <div role="alert" className="rounded-[18px] border border-[#f3c2af] bg-[#fbe9e1] p-5 text-sm text-[#7a2406]">
          We couldn’t load app analytics. Has migration 0013 been applied?
          <button type="button" className="ml-2 font-semibold underline" onClick={() => q.refetch()}>
            Try again
          </button>
        </div>
      ) : q.isLoading || !data ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Headline KPI strip */}
          <div className="grid grid-cols-1 divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            <div className="p-6">
              <p className="text-sm font-medium text-[#45546a]">Documents sent</p>
              <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{docs.total ?? 0}</p>
              <p className="mt-1 text-[13px] tabular-nums text-[#5f6a7c]">
                {docs.rx_count ?? 0} Rx · {docs.lab_count ?? 0} lab
              </p>
            </div>
            <div className="p-6">
              <p className="text-sm font-medium text-[#45546a]">Patients paid</p>
              <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{docs.paid_count ?? 0}</p>
              <p className="mt-1 text-[13px] tabular-nums text-[#5f6a7c]">
                {docs.conversion_rate ?? 0}% conversion · {docs.pending_count ?? 0} verifying
              </p>
            </div>
            <div className="p-6">
              <p className="text-sm font-medium text-[#45546a]">Patient fees collected</p>
              <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">
                {formatPeso(docs.collected_amount)}
              </p>
              <p className="mt-1 text-[13px] tabular-nums text-[#5f6a7c]">
                of {formatPeso(docs.billed_amount)} billed · median {formatPeso(docs.median_fee)}
              </p>
            </div>
            <div className="p-6">
              <p className="text-sm font-medium text-[#45546a]">Active doctors</p>
              <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{doctors.active_in_range ?? 0}</p>
              <p className="mt-1 text-[13px] tabular-nums text-[#5f6a7c]">
                WAU {doctors.wau ?? 0} · MAU {doctors.mau ?? 0}
              </p>
            </div>
          </div>

          {/* Trend chart */}
          <AnalyticsTrendChart series={data?.series ?? []} granularity={data?.meta?.granularity ?? 'day'} />

          {/* Funnel & payment channels */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="font-display text-[20px] font-semibold text-[#152839]">Prescription payment funnel</h2>
                <p className="mt-0.5 text-sm text-[#45546a]">Status of documents created in this period and how quickly patients pay.</p>
              </div>

              {Number(docs.total) > 0 && (
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#ece7de]" aria-hidden="true">
                  <div className="bg-[#152839]" style={{ width: `${(docs.paid_count / docs.total) * 100}%` }} />
                  <div className="bg-[#ff6f07]" style={{ width: `${(docs.pending_count / docs.total) * 100}%` }} />
                  <div className="bg-[#5f6a7c]" style={{ width: `${(docs.unpaid_count / docs.total) * 100}%` }} />
                  <div className="bg-[#c9c1b2]" style={{ width: `${(docs.expired_count / docs.total) * 100}%` }} />
                </div>
              )}

              <KeyValueList
                rows={[
                  {
                    dot: 'navy',
                    label: 'Paid',
                    value: docs.paid_count ?? 0,
                    note: docs.total ? `(${Math.round(((docs.paid_count ?? 0) / docs.total) * 100)}%)` : undefined,
                  },
                  {
                    dot: 'orange',
                    label: 'Waiting verification',
                    value: docs.pending_count ?? 0,
                    note: docs.total ? `(${Math.round(((docs.pending_count ?? 0) / docs.total) * 100)}%)` : undefined,
                  },
                  {
                    dot: 'slate',
                    label: 'Unpaid',
                    value: docs.unpaid_count ?? 0,
                    note: docs.total ? `(${Math.round(((docs.unpaid_count ?? 0) / docs.total) * 100)}%)` : undefined,
                  },
                  {
                    dot: 'sand',
                    label: 'Expired',
                    value: docs.expired_count ?? 0,
                  },
                ]}
              />

              <div className="border-t border-[#dce1e8] pt-4">
                <KeyValueList
                  rows={[
                    { label: 'Median time to pay', value: formatDurationMinutes(docs.median_time_to_pay_minutes) },
                    { label: 'Average time to pay', value: formatDurationMinutes(docs.avg_time_to_pay_minutes) },
                    { label: 'Average fee', value: formatPeso(docs.avg_fee) },
                    { label: 'Median fee', value: formatPeso(docs.median_fee) },
                  ]}
                />
              </div>
            </section>

            <section className="rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="font-display text-[20px] font-semibold text-[#152839]">Payment channels and verification</h2>
                <p className="mt-0.5 text-sm text-[#45546a]">How patients settled fees and how manual receipt checks are performing.</p>
              </div>

              <div className="space-y-3">
                <ProgressRow label="PayMongo online checkout" count={payments.paid_via_gateway_count ?? 0} total={totalPaidChannel} tone="navy" />
                <ProgressRow label="Doctor manual QR verification" count={payments.paid_via_manual_count ?? 0} total={totalPaidChannel} tone="orange" />
                {(payments.paid_via_other_count ?? 0) > 0 && (
                  <ProgressRow label="Other / legacy" count={payments.paid_via_other_count} total={totalPaidChannel} tone="slate" />
                )}
              </div>

              <div className="border-t border-[#dce1e8] pt-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#152839]">Online checkout (PayMongo)</h3>
                  <div className="mt-2">
                    <KeyValueList
                      rows={[
                        { label: 'Checkout completion rate', value: `${payments.gateway_rx_completion_rate ?? 0}%`, note: `(${payments.gateway_rx_paid_count ?? 0} of ${payments.gateway_rx_total_checkouts ?? 0})` },
                        { label: 'Abandoned / open · held · refunded', value: `${payments.gateway_rx_open_count ?? 0} · ${payments.gateway_rx_needs_review ?? 0} · ${payments.gateway_rx_refunded_count ?? 0}` },
                        ...(payments.gateway_methods ?? []).map((m) => ({
                          label: `Method: ${METHOD_LABEL[m.method] ?? m.method}`,
                          value: `${m.count} paid`,
                          note: formatPeso(m.amount),
                        })),
                      ]}
                    />
                  </div>
                </div>

                <div className="border-t border-[#dce1e8] pt-4">
                  <h3 className="text-sm font-semibold text-[#152839]">Manual QR receipt checks</h3>
                  <div className="mt-2">
                    <KeyValueList
                      rows={[
                        { label: 'Confirmed · rejected · pending', value: `${payments.manual_confirmed_count ?? 0} · ${payments.manual_rejected_count ?? 0} · ${payments.manual_pending_count ?? 0}` },
                        { label: 'Receipt approval rate', value: `${payments.manual_confirm_rate ?? 0}%` },
                        { label: 'Median doctor review time', value: formatDurationMinutes(payments.manual_median_review_minutes) },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Doctor activation & plans */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="font-display text-[20px] font-semibold text-[#152839]">Doctor activation and operations</h2>
                <p className="mt-0.5 text-sm text-[#45546a]">Onboarding funnel, repeat usage, and admin review turnaround.</p>
              </div>

              <KeyValueList
                rows={[
                  { label: 'Total registered doctors', value: doctors.total_registered ?? 0, note: `(${doctors.registered_in_range ?? 0} in period)` },
                  { dot: 'navy', label: 'Approved doctors', value: doctors.approved ?? 0 },
                  { label: 'Activated (sent ≥ 1 ever)', value: `${doctors.activation_rate ?? 0}%` },
                  { label: 'Active in period', value: doctors.active_in_range ?? 0, note: `(${doctors.earning_in_range ?? 0} with paid Rx)` },
                  { label: 'Average documents per active doctor', value: doctors.avg_rx_per_active_doctor ?? 0 },
                  { dot: 'orange', label: 'Pending PRC approval', value: doctors.pending_approval ?? 0 },
                  { label: 'Open profile change requests', value: doctors.open_change_requests ?? 0 },
                  { label: 'Median PRC approval turnaround', value: formatDurationHours(doctors.median_approval_hours) },
                ]}
              />
            </section>

            <section className="rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="font-display text-[20px] font-semibold text-[#152839]">Plans, clinics and capacity</h2>
                <p className="mt-0.5 text-sm text-[#45546a]">Current effective plan distribution across approved doctors and upgrade signals.</p>
              </div>

              <div className="space-y-3">
                {(plans.plan_distribution ?? []).length === 0 ? (
                  <p className="text-sm text-[#5f6a7c]">No approved doctors yet.</p>
                ) : (
                  (plans.plan_distribution ?? []).map((p, idx) => (
                    <ProgressRow
                      key={p.plan_id}
                      label={p.plan_name}
                      count={Number(p.doctors_count) || 0}
                      total={totalDoctorsOnPlans}
                      tone={idx === 0 ? 'slate' : idx === 1 ? 'navy' : 'orange'}
                    />
                  ))
                )}
              </div>

              <div className="border-t border-[#dce1e8] pt-4">
                <KeyValueList
                  rows={[
                    { label: 'Active clinics', value: plans.active_clinics_count ?? 0, note: `(${plans.clinic_doctors_count ?? 0} doctors)` },
                    { dot: 'orange', label: 'Doctors at ≥ 80% monthly limit', value: plans.near_quota_doctors_count ?? 0 },
                    { label: 'Unused pack credits remaining', value: plans.active_pack_credits_remaining ?? 0 },
                    {
                      label: 'Plan requests in period',
                      value: `${plans.plan_requests_in_range?.approved ?? 0} approved`,
                      note: `· ${plans.plan_requests_in_range?.pending ?? 0} pending · ${plans.plan_requests_in_range?.rejected ?? 0} rejected`,
                    },
                  ]}
                />
              </div>
            </section>
          </div>

          {/* Top doctors & top specialties */}
          <div className="grid gap-6 xl:grid-cols-3">
            <section className="rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6 xl:col-span-2">
              <div className="mb-4">
                <h2 className="font-display text-[20px] font-semibold text-[#152839]">Most active doctors</h2>
                <p className="mt-0.5 text-sm text-[#45546a]">Aggregate counts and collected fees in the selected period. No patient details are shown.</p>
              </div>

              {topDoctors.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#5f6a7c]">No prescriptions sent during this period.</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-[#dce1e8] text-[13px] font-semibold text-[#45546a]">
                        <tr>
                          <th className="pb-3 pr-4">Doctor</th>
                          <th className="pb-3 pr-4">Plan</th>
                          <th className="pb-3 pr-4 text-right">Sent</th>
                          <th className="pb-3 pr-4 text-right">Paid</th>
                          <th className="pb-3 pr-4 text-right">Conv.</th>
                          <th className="pb-3 text-right">Collected</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#dce1e8]">
                        {topDoctors.map((d) => (
                          <tr key={d.doctor_id}>
                            <td className="py-3 pr-4">
                              <p className="font-semibold text-[#152839]">{doctorTitle(d.full_name)}</p>
                              <p className="text-[13px] text-[#5f6a7c]">
                                {[d.specialty, d.clinic_name].filter(Boolean).join(' · ') || 'Independent practice'}
                              </p>
                            </td>
                            <td className="py-3 pr-4 text-[#45546a]">{d.plan_name}</td>
                            <td className="py-3 pr-4 text-right tabular-nums text-[#152839]">
                              <span className="font-semibold">{d.sent_count}</span>
                              <span className="block text-[13px] text-[#5f6a7c]">
                                {d.rx_count} Rx · {d.lab_count} lab
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-right font-semibold tabular-nums text-[#152839]">{d.paid_count}</td>
                            <td className="py-3 pr-4 text-right tabular-nums text-[#45546a]">{d.conversion_rate}%</td>
                            <td className="py-3 text-right font-semibold tabular-nums text-[#152839]">
                              {formatPeso(d.collected_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="space-y-3 md:hidden">
                    {topDoctors.map((d) => (
                      <li key={d.doctor_id} className="rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[#152839]">{doctorTitle(d.full_name)}</p>
                            <p className="text-[13px] text-[#5f6a7c]">
                              {[d.specialty, d.clinic_name].filter(Boolean).join(' · ') || 'Independent practice'}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-0.5 text-[13px] font-medium text-[#45546a] border border-[#dce1e8]">
                            {d.plan_name}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-1 text-[13px] tabular-nums">
                          <div>
                            <span className="block text-[#5f6a7c]">Sent</span>
                            <strong className="text-[#152839]">{d.sent_count}</strong> ({d.rx_count}/{d.lab_count})
                          </div>
                          <div>
                            <span className="block text-[#5f6a7c]">Paid</span>
                            <strong className="text-[#152839]">{d.paid_count}</strong> ({d.conversion_rate}%)
                          </div>
                          <div className="text-right">
                            <span className="block text-[#5f6a7c]">Collected</span>
                            <strong className="text-[#152839]">{formatPeso(d.collected_amount)}</strong>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6">
              <div className="mb-4">
                <h2 className="font-display text-[20px] font-semibold text-[#152839]">By specialty</h2>
                <p className="mt-0.5 text-sm text-[#45546a]">Volume and collected fees by doctor specialty.</p>
              </div>

              {topSpecs.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#5f6a7c]">No specialty activity in this period.</p>
              ) : (
                <ul className="divide-y divide-[#dce1e8] text-sm">
                  {topSpecs.map((s) => (
                    <li key={s.specialty} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#152839]">{s.specialty}</p>
                        <p className="text-[13px] tabular-nums text-[#5f6a7c]">
                          {s.doctors_count} doctor{s.doctors_count === 1 ? '' : 's'} · {s.paid_count}/{s.sent_count} paid
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-[#152839]">
                        {formatPeso(s.collected_amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
