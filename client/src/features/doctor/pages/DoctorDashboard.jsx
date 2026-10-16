import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Clock3, FilePlus2, FileText } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { StatCard } from '../../../components/ui/Card';
import { PrescriptionHistory } from '../components/PrescriptionHistory';
import { fetchMyPrescriptions } from '../api';
import { useAuthStore } from '../../../store/authStore';
import { doctorTitle, formatPeso } from '../../../lib/utils';

export default function DoctorDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['doctor', 'prescriptions'],
    queryFn: fetchMyPrescriptions,
    refetchInterval: 15_000, // pick up newly paid prescriptions
  });

  const items = data ?? [];
  const paid = items.filter((r) => r.payment_status === 'paid');
  const collected = paid.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-700">Welcome back</p>
          <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">{doctorTitle(profile?.full_name ?? '')}</h1>
          <p className="mt-1 text-xs text-ink-500">
            {[
              profile?.specialty,
              profile?.clinic_name,
              profile?.prc_no && `PRC Lic. ${profile.prc_no}`,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/doctor/profile">
            <Button variant="secondary">Doctor Details</Button>
          </Link>
          <Link to="/doctor/new">
            <Button size="lg"><FilePlus2 className="h-5 w-5" aria-hidden="true" /> New prescription</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={FileText} label="Prescriptions issued" value={items.length} />
        <StatCard icon={Clock3} label="Awaiting payment" value={items.length - paid.length} tone="gold" />
        <StatCard icon={Banknote} label="Paid by patients" value={formatPeso(collected)} tone="ink" />
      </div>

      <section aria-labelledby="history-h">
        <h2 id="history-h" className="mb-3 text-lg font-semibold text-ink-900">Prescription history</h2>
        {isError ? (
          <div role="alert" className="rounded-2xl bg-rose-50 p-5 text-sm text-rose-700 ring-1 ring-rose-200">
            Could not load your prescriptions. <button className="font-semibold underline" onClick={() => refetch()}>Retry</button>
          </div>
        ) : (
          <PrescriptionHistory items={items} loading={isLoading} />
        )}
      </section>
    </div>
  );
}
