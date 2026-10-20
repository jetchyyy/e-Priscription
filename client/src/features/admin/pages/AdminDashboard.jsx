import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Search, Stethoscope, XCircle } from 'lucide-react';
import { Card, EmptyState, StatCard } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { cn } from '../../../lib/utils';
import { DoctorTable } from '../components/DoctorTable';
import { DoctorCard } from '../components/DoctorCard';
import { ApprovalModal } from '../components/ApprovalModal';
import { ChangeRequests } from '../components/ChangeRequests';
import { fetchDoctors } from '../api';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function AdminDashboard() {
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'doctors'],
    queryFn: fetchDoctors,
    refetchInterval: 30_000,
  });
  const doctors = useMemo(() => data ?? [], [data]);

  const counts = useMemo(
    () => ({
      all: doctors.length,
      pending: doctors.filter((d) => d.status === 'pending').length,
      approved: doctors.filter((d) => d.status === 'approved').length,
      rejected: doctors.filter((d) => d.status === 'rejected').length,
    }),
    [doctors],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctors.filter(
      (d) =>
        (status === 'all' || d.status === status) &&
        (!q || [d.full_name, d.email, d.prc_no, d.clinic_name].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [doctors, status, search]);

  const selected = doctors.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Doctor approvals</h1>
        <p className="mt-1 text-sm text-[#45546a]">Verify PRC licenses before doctors can issue prescriptions.</p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-6">
          <p className="text-sm font-medium text-[#45546a]">Pending review</p>
          <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{counts.pending}</p>
        </div>
        <div className="p-6">
          <p className="text-sm font-medium text-[#45546a]">Approved doctors</p>
          <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{counts.approved}</p>
        </div>
        <div className="p-6">
          <p className="text-sm font-medium text-[#45546a]">Rejected</p>
          <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{counts.rejected}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Filter by status" className="flex items-center gap-1.5 rounded-full border border-[#dce1e8] bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={status === t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                'inline-flex min-h-[38px] shrink-0 items-center gap-2 rounded-full px-4 text-xs font-semibold transition',
                status === t.key ? 'bg-[#152839] text-[#f9f8f3]' : 'text-[#45546a] hover:bg-[#ece7de]',
              )}
            >
              {t.label}
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] tabular-nums', status === t.key ? 'bg-white/20' : 'bg-[#ece7de]')}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6a7c]" aria-hidden="true" />
          <input
            aria-label="Search doctors"
            type="search"
            placeholder="Search name, email, PRC no…"
            className="w-full rounded-[18px] border border-[#dce1e8] bg-white pl-10 pr-4 py-2 text-sm text-[#152839] placeholder:text-[#5f6a7c] focus:outline-none focus:border-[#ff6f07] focus:ring-2 focus:ring-[#ff6f07]/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-[20px] border border-[#dce1e8] bg-white p-6 space-y-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#ece7de]" />)}
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-[18px] border border-[#f3c2af] bg-[#fbe9e1] p-5 text-sm text-[#7a2406]">
          Could not load registrations. <button className="font-semibold underline ml-1" onClick={() => refetch()}>Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[20px] border border-[#dce1e8] bg-white p-12 text-center text-sm text-[#5f6a7c]">
          {search ? 'Try a different search term or filter.' : `There are no ${status === 'all' ? '' : status} registrations right now.`}
        </div>
      ) : (
        <>
          <DoctorTable doctors={filtered} onReview={(d) => setSelectedId(d.id)} />
          <ul className="space-y-3 md:hidden">
            {filtered.map((d) => (
              <li key={d.id}><DoctorCard doctor={d} onReview={(x) => setSelectedId(x.id)} /></li>
            ))}
          </ul>
        </>
      )}

      <ChangeRequests />

      <ApprovalModal doctor={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
