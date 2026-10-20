import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Clock3, FilePlus2, FileText } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { StatCard } from '../../../components/ui/Card';
import { PrescriptionHistory } from '../components/PrescriptionHistory';
import { fetchMyPrescriptions } from '../api';
import { useAuthStore } from '../../../store/authStore';
import { doctorTitle, formatPeso } from '../../../lib/utils';

function getManilaGreeting() {
  const hour = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false });
  const h = parseInt(hour, 10);
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DoctorDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['doctor', 'prescriptions'],
    queryFn: fetchMyPrescriptions,
    refetchInterval: 15_000,
  });

  const items = data ?? [];
  const paid = items.filter((r) => r.payment_status === 'paid');
  const waiting = items.length - paid.length;
  const collected = paid.reduce((sum, r) => sum + Number(r.amount), 0);

  const greeting = getManilaGreeting();
  const doctorName = profile?.full_name ? doctorTitle(profile.full_name) : 'Doctor';

  return (
    <div className="space-y-6">
      {/* Header row (section 11.4) */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-bold text-[#152839] leading-tight">
            {greeting}, {doctorName}
          </h1>
          <p className="mt-1 text-sm text-[#45546a]">
            {[
              profile?.specialty,
              profile?.clinic_name,
              profile?.prc_no && `PRC Lic. ${profile.prc_no}`,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/doctor/profile">
            <Button variant="secondary">Doctor details</Button>
          </Link>
          <Link to="/doctor/new">
            <Button variant="accent">
              <FilePlus2 className="h-4 w-4" aria-hidden="true" /> New prescription
            </Button>
          </Link>
        </div>
      </div>

      {/* This month strip: one white panel with 3 figures (section 11.4) */}
      <div className="grid grid-cols-1 divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-6">
          <p className="text-sm font-medium text-[#45546a]">Prescriptions this month</p>
          <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{items.length}</p>
        </div>
        <div className="p-6">
          <p className="text-sm font-medium text-[#45546a]">Waiting for payment</p>
          <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{waiting}</p>
        </div>
        <div className="p-6">
          <p className="text-sm font-medium text-[#45546a]">Collected this month</p>
          <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{formatPeso(collected)}</p>
        </div>
      </div>

      {/* Prescription history */}
      <section aria-labelledby="history-h">
        <h2 id="history-h" className="mb-4 font-display text-xl font-semibold text-[#152839]">Prescription history</h2>
        {isError ? (
          <div role="alert" className="rounded-[18px] border border-[#f3c2af] bg-[#fbe9e1] p-5 text-sm text-[#7a2406]">
            We couldn’t load your prescriptions. <button className="font-semibold underline ml-1" onClick={() => refetch()}>Try again</button>
          </div>
        ) : (
          <PrescriptionHistory items={items} loading={isLoading} />
        )}
      </section>
    </div>
  );
}
