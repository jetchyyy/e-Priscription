import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Search, Stethoscope, XCircle } from 'lucide-react';
import { Card, EmptyState, StatCard } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { cn } from '../../../lib/utils';
import { DoctorTable } from '../components/DoctorTable';
import { DoctorCard } from '../components/DoctorCard';
import { ApprovalModal } from '../components/ApprovalModal';
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
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">Doctor approvals</h1>
        <p className="mt-1 text-ink-600">Verify PRC licenses before doctors can issue prescriptions.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Clock3} label="Pending review" value={counts.pending} tone="gold" />
        <StatCard icon={CheckCircle2} label="Approved doctors" value={counts.approved} />
        <StatCard icon={XCircle} label="Rejected" value={counts.rejected} tone="rose" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Filter by status" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={status === t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
                status === t.key ? 'bg-ink-900 text-white shadow-md' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50',
              )}
            >
              {t.label}
              <span className={cn('rounded-full px-2 py-0.5 text-xs', status === t.key ? 'bg-white/20' : 'bg-ink-100')}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <Input aria-label="Search doctors" type="search" placeholder="Search name, email, PRC no…" className="pl-10"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <Card className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-ink-100" />)}</Card>
      ) : isError ? (
        <div role="alert" className="rounded-2xl bg-rose-50 p-5 text-sm text-rose-700 ring-1 ring-rose-200">
          Could not load registrations. <button className="font-semibold underline" onClick={() => refetch()}>Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Stethoscope} title="No doctors found">
            {search ? 'Try a different search term or filter.' : `There are no ${status === 'all' ? '' : status} registrations right now.`}
          </EmptyState>
        </Card>
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

      <ApprovalModal doctor={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
