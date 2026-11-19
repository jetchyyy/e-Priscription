import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatPeso } from '../../../lib/utils';
import { fetchRevenueByDay } from '../api';

const DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
const label = (day) => DAY.format(new Date(`${day}T00:00:00+08:00`));

/** ODYSSEY's revenue per day: fees and sales less PayMongo's charges (admin_revenue_by_day, migration 0019). */
export function RevenueByDay() {
  const [days, setDays] = useState(30);
  const [active, setActive] = useState(null);
  const q = useQuery({ queryKey: ['admin', 'money', 'revenue-by-day', days], queryFn: () => fetchRevenueByDay(days), refetchInterval: 60_000 });
  const rows = (q.data ?? []).map((r) => ({ day: r.day, revenue: Number(r.revenue) || 0 }));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.revenue)));
  const total = rows.reduce((t, r) => t + r.revenue, 0);
  const shown = active != null ? rows[active] : null;

  return (
    <section className="space-y-3 rounded-[20px] border border-[#dce1e8] bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#152839]">ODYSSEY’s revenue per day</h2>
          <p className="text-sm text-[#45546a]">
            {shown ? `${label(shown.day)}: ${formatPeso(shown.revenue)}` : `${formatPeso(total)} in the last ${days} days`}
          </p>
        </div>
        <div role="group" aria-label="Range" className="flex gap-1 rounded-full bg-[#ece7de] p-1">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" aria-pressed={d === days} onClick={() => { setDays(d); setActive(null); }}
              className={`min-h-[36px] rounded-full px-3 text-sm font-semibold ${d === days ? 'bg-[#152839] text-[#f9f8f3]' : 'text-[#152839] hover:bg-white'}`}>
              {d} days
            </button>
          ))}
        </div>
      </div>
      {q.isLoading ? (
        <div className="h-40 animate-pulse rounded-[16px] bg-[#ece7de]" aria-label="Loading revenue" />
      ) : q.isError ? (
        <p role="alert" className="text-sm text-[#7a2406]">Could not load the revenue. Has migration 0019 been applied?</p>
      ) : (
        <div className="flex h-40 items-end gap-[2px]" onMouseLeave={() => setActive(null)}>
          {rows.map((r, i) => (
            <button key={r.day} type="button" aria-label={`${label(r.day)}: ${formatPeso(r.revenue)}`}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              className="group flex h-full min-w-0 flex-1 items-end">
              <span className={`block w-full rounded-t-[3px] ${r.revenue < 0 ? 'bg-[#b8470a]' : 'bg-[#152839]'} ${active === i ? 'opacity-70' : ''}`}
                style={{ height: `${r.revenue ? Math.max((Math.abs(r.revenue) / max) * 100, 3) : 0}%` }} />
            </button>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div className="flex justify-between text-xs text-[#5f6a7c]"><span>{label(rows[0].day)}</span><span>{label(rows[rows.length - 1].day)}</span></div>
      )}
    </section>
  );
}
