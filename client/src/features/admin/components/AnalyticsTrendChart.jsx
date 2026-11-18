import { useMemo, useState } from 'react';
import { cn, formatPeso } from '../../../lib/utils';

const SHORT_MONTH = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
const MONTH_ONLY = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric', timeZone: 'Asia/Manila' });

function formatBucketLabel(bucket, granularity) {
  if (!bucket) return '—';
  const d = new Date(`${bucket}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return bucket;
  if (granularity === 'month') return MONTH_ONLY.format(d);
  if (granularity === 'week') return `Wk of ${SHORT_MONTH.format(d)}`;
  return SHORT_MONTH.format(d);
}

/**
 * Lightweight ODYSSEY-branded bar chart (no gradients, no rainbow palette).
 * Supports Volume (sent vs paid) and Collected (PHP) modes with keyboard/pointer inspection.
 */
export function AnalyticsTrendChart({ series = [], granularity = 'day' }) {
  const [mode, setMode] = useState('volume');
  const [activeIndex, setActiveIndex] = useState(null);

  const items = useMemo(
    () =>
      series.map((row) => ({
        ...row,
        label: formatBucketLabel(row.bucket, granularity),
        sent: Number(row.sent) || 0,
        rx: Number(row.rx) || 0,
        lab: Number(row.lab) || 0,
        paid: Number(row.paid) || 0,
        collected: Number(row.collected) || 0,
        active_doctors: Number(row.active_doctors) || 0,
      })),
    [series, granularity],
  );

  const hasActivity = items.some((d) => d.sent > 0 || d.paid > 0 || d.collected > 0);
  const maxVal = useMemo(() => {
    if (mode === 'collected') return Math.max(1, ...items.map((d) => d.collected));
    return Math.max(1, ...items.map((d) => Math.max(d.sent, d.paid)));
  }, [items, mode]);

  const inspected = activeIndex != null && items[activeIndex] ? items[activeIndex] : null;
  const labelStep = items.length > 18 ? Math.ceil(items.length / 6) : items.length > 10 ? 2 : 1;

  return (
    <section className="rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-[20px] font-semibold text-[#152839]">
            {mode === 'volume' ? 'Documents sent and paid over time' : 'Patient fees collected over time'}
          </h2>
          <p className="mt-0.5 text-sm text-[#45546a]">
            {mode === 'volume'
              ? 'Compares prescriptions and lab requests created against payments completed in each period.'
              : 'Total patient prescription fees marked paid in each period (Asia/Manila).'}
          </p>
        </div>

        <div role="tablist" aria-label="Chart metric" className="inline-flex w-fit items-center gap-1 rounded-full border border-[#dce1e8] bg-[#f9f8f3] p-1">
          {[
            { key: 'volume', label: 'Volume' },
            { key: 'collected', label: 'Collected (₱)' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={mode === t.key}
              onClick={() => setMode(t.key)}
              className={cn(
                'min-h-[36px] rounded-full px-3.5 text-[13px] font-semibold transition',
                mode === t.key ? 'bg-[#152839] text-[#f9f8f3]' : 'text-[#45546a] hover:bg-[#ece7de]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend + live readout strip */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f9f8f3] px-4 py-2.5 text-sm">
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#45546a]">
          {mode === 'volume' ? (
            <>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#152839]" aria-hidden="true" />
                Sent
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#ff6f07]" aria-hidden="true" />
                Paid
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#152839]" aria-hidden="true" />
              Collected fees
            </span>
          )}
        </div>

        <div aria-live="polite" className="text-[13px] tabular-nums text-[#152839]">
          {inspected ? (
            <span>
              <strong>{inspected.label}</strong>
              {' · '}
              {inspected.sent} sent ({inspected.rx} Rx, {inspected.lab} lab)
              {' · '}
              {inspected.paid} paid
              {' · '}
              {formatPeso(inspected.collected)}
              {' · '}
              {inspected.active_doctors} active doctor{inspected.active_doctors === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="text-[#5f6a7c]">Hover or tap any bar to inspect a period</span>
          )}
        </div>
      </div>

      {!hasActivity ? (
        <div className="mt-6 rounded-xl bg-[#f9f8f3] px-4 py-10 text-center text-sm text-[#5f6a7c]">
          No prescriptions or payments recorded in this date range yet.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[460px]">
            <div className="relative flex h-52 items-end gap-1.5 border-b border-[#dce1e8] pb-2 pt-4">
              {/* Subtle horizontal reference lines at 50% and 100% */}
              <div className="pointer-events-none absolute inset-x-0 top-4 border-t border-dashed border-[#dce1e8]" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-[#dce1e8]" aria-hidden="true" />

              {items.map((d, idx) => {
                const isSelected = activeIndex === idx;
                const sentH = Math.round((d.sent / maxVal) * 100);
                const paidH = Math.round((d.paid / maxVal) * 100);
                const colH = Math.round((d.collected / maxVal) * 100);

                return (
                  <button
                    key={d.bucket}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onFocus={() => setActiveIndex(idx)}
                    onClick={() => setActiveIndex(idx)}
                    aria-label={`${d.label}: ${d.sent} sent, ${d.paid} paid, ${formatPeso(d.collected)} collected`}
                    className={cn(
                      'group relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-t-md px-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6f07]',
                      isSelected && 'bg-[#ece7de]/70',
                    )}
                  >
                    {mode === 'volume' ? (
                      <>
                        <span
                          className="w-full max-w-[14px] rounded-t-[4px] bg-[#152839] transition-opacity"
                          style={{ height: `${d.sent > 0 ? Math.max(sentH, 4) : 0}%` }}
                        />
                        <span
                          className="w-full max-w-[14px] rounded-t-[4px] bg-[#ff6f07] transition-opacity"
                          style={{ height: `${d.paid > 0 ? Math.max(paidH, 4) : 0}%` }}
                        />
                      </>
                    ) : (
                      <span
                        className="w-full max-w-[24px] rounded-t-[4px] bg-[#152839]"
                        style={{ height: `${d.collected > 0 ? Math.max(colH, 4) : 0}%` }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-[13px] tabular-nums text-[#5f6a7c]">
              {items.map((d, idx) => {
                const show = idx === 0 || idx === items.length - 1 || idx % labelStep === 0;
                return (
                  <div key={d.bucket} className="flex-1 truncate text-center">
                    {show ? d.label : ''}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
