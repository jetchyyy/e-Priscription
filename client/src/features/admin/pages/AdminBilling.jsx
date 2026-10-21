import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../../../lib/utils';
import { plansQuery } from '../../billing/api';
import { fetchPlanRequests } from '../api';
import { PlanRequests } from '../components/PlanRequests';
import { DoctorPlans } from '../components/DoctorPlans';
import { PlanEditor } from '../components/PlanEditor';
import { PlatformQrs } from '../components/PlatformQrs';
import { AdminClinics } from '../components/AdminClinics';

const TABS = [
  { key: 'payments', label: 'Payments to verify' },
  { key: 'doctors', label: 'Doctors’ plans' },
  { key: 'clinics', label: 'Clinics' },
  { key: 'plans', label: 'Plans and limits' },
  { key: 'qrs', label: 'Payment QRs' },
];

export default function AdminBilling() {
  const [tab, setTab] = useState('payments');
  const plansQ = useQuery(plansQuery);
  const plans = plansQ.data ?? [];
  const waiting = useQuery({ queryKey: ['admin', 'plan-requests', 'pending'], queryFn: () => fetchPlanRequests('pending'), refetchInterval: 30_000 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Plans and billing</h1>
        <p className="mt-1 text-sm text-[#45546a]">Verify plan payments, set each doctor’s plan, and change the plans everyone sees.</p>
      </div>

      <div role="tablist" aria-label="Plans and billing" className="flex flex-wrap items-center gap-1.5 rounded-[22px] border border-[#dce1e8] bg-white p-1 sm:w-fit sm:rounded-full">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex min-h-[38px] items-center gap-2 rounded-full px-4 text-xs font-semibold transition',
              tab === t.key ? 'bg-[#152839] text-[#f9f8f3]' : 'text-[#45546a] hover:bg-[#ece7de]',
            )}
          >
            {t.label}
            {t.key === 'payments' && waiting.data?.length > 0 && (
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] tabular-nums', tab === t.key ? 'bg-white/20' : 'bg-[#ece7de]')}>{waiting.data.length}</span>
            )}
          </button>
        ))}
      </div>

      {plansQ.isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load the plans. Has migration 0006 been applied? <button className="ml-1 font-semibold underline" onClick={() => plansQ.refetch()}>Try again</button>
        </div>
      ) : plansQ.isLoading ? (
        <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" />
      ) : (
        <div role="tabpanel">
          {tab === 'payments' && <PlanRequests plans={plans} />}
          {tab === 'doctors' && <DoctorPlans plans={plans} />}
          {tab === 'clinics' && <AdminClinics plans={plans} />}
          {tab === 'plans' && <PlanEditor plans={plans} />}
          {tab === 'qrs' && <PlatformQrs />}
        </div>
      )}
    </div>
  );
}
