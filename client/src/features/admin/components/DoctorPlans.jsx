import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { cn, formatDate } from '../../../lib/utils';
import { fetchDoctorPlans, setDoctorPlan } from '../api';

const n = (v) => Number(v).toLocaleString('en-PH');

/** Manila calendar date (YYYY-MM-DD) for a date input, and back to the end of that day in Manila. */
const toDateInput = (iso) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(iso)) : '');
const fromDateInput = (d) => (d ? `${d}T23:59:59+08:00` : null);

function Usage({ d }) {
  const pct = d.rx_limit > 0 ? Math.min(100, Math.round((d.rx_used / d.rx_limit) * 100)) : 100;
  const tone = d.rx_left <= 0 ? 'bg-[#b8470a]' : pct >= 80 ? 'bg-[#ff6f07]' : 'bg-[#152839]';
  return (
    <div className="min-w-[140px]">
      <p className="text-sm tabular-nums text-[#152839]">
        <span className="font-semibold">{n(d.rx_used)}</span> of {n(d.rx_limit)}{d.has_override ? ' (custom)' : ''}
      </p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#ece7de]"><div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function EditPlanModal({ doctor, plans, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    planId: doctor?.plan_id ?? plans[0]?.id,
    periodEnd: toDateInput(doctor?.current_period_end),
    rxLimitOverride: doctor?.has_override ? String(doctor.rx_limit) : '',
    billingPeriod: doctor?.billing_period ?? 'monthly',
    note: doctor?.note ?? '',
  }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const plan = plans.find((p) => p.id === form.planId);

  const save = useMutation({
    mutationFn: () => setDoctorPlan({ doctorId: doctor.doctor_id, ...form, periodEnd: fromDateInput(form.periodEnd) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'doctor-plans'] });
      toast.success(`Plan updated for ${doctor.full_name}`);
      onClose();
    },
    onError: (e) => toast.error(e?.message || 'Could not update the plan.'),
  });

  return (
    <Modal open={Boolean(doctor)} onClose={onClose} title={`Plan for ${doctor?.full_name ?? ''}`} description={doctor?.email}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4 pt-2">
        <Select label="Plan" value={form.planId} onChange={set('planId')}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({n(p.rxLimit)} a month){p.isPublic ? '' : ', hidden'}</option>)}
        </Select>
        <Input
          label="Paid until"
          type="date"
          value={form.periodEnd}
          onChange={set('periodEnd')}
          hint="Leave empty for no end date. After this day the doctor moves back to the free plan."
        />
        <Input
          label="Custom prescription limit"
          type="number"
          min="0"
          inputMode="numeric"
          value={form.rxLimitOverride}
          onChange={set('rxLimitOverride')}
          placeholder={plan ? `${n(plan.rxLimit)} from the ${plan.name} plan` : ''}
          hint="Only for this doctor. Leave empty to use the plan’s limit."
        />
        <Select label="Billing" value={form.billingPeriod} onChange={set('billingPeriod')}>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </Select>
        <Input label="Note (only admins see it)" maxLength={300} value={form.note} onChange={set('note')} placeholder="e.g. Free month for onboarding" />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>Save plan</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Approved doctors with their plan, this month's usage and a way to change the plan by hand. */
export function DoctorPlans({ plans }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'doctor-plans'],
    queryFn: fetchDoctorPlans,
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((d) => !q || [d.full_name, d.email, d.clinic_name, d.plan_name].some((v) => v?.toLowerCase().includes(q)));
  }, [data, search]);

  return (
    <section aria-labelledby="dp-h" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="dp-h" className="font-display text-xl font-semibold text-[#152839]">Doctors’ plans</h2>
          <p className="text-sm text-[#45546a]">Prescriptions used this calendar month, Manila time.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6a7c]" aria-hidden="true" />
          <input
            aria-label="Search doctors"
            type="search"
            placeholder="Search name, email, plan…"
            className="w-full rounded-[18px] border border-[#dce1e8] bg-white py-2 pl-10 pr-4 text-sm text-[#152839] placeholder:text-[#5f6a7c] focus:border-[#ff6f07] focus:outline-none focus:ring-2 focus:ring-[#ff6f07]/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" />
      ) : isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load doctors’ plans. <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : !rows.length ? (
        <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">{search ? 'No doctor matches that search.' : 'No approved doctors yet.'}</p>
      ) : (
        <ul className="divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white">
          {rows.map((d) => (
            <li key={d.doctor_id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#152839]">{d.full_name}</p>
                <p className="truncate text-sm text-[#45546a]">{d.email}{d.clinic_name ? ` · ${d.clinic_name}` : ''}</p>
              </div>
              <div>
                <p className="font-semibold text-[#152839]">{d.plan_name}</p>
                <p className="text-sm text-[#45546a]">
                  {d.clinic ? `In clinic: ${d.clinic.name}${d.clinic.role === 'owner' ? ' (owner)' : ''}` : d.is_paid ? (d.current_period_end ? `Paid until ${formatDate(d.current_period_end)}` : 'No end date') : 'Free'}
                  {d.latest_request?.status === 'pending' ? ' · payment waiting' : ''}
                </p>
              </div>
              <Usage d={d} />
              <Button variant="secondary" size="sm" onClick={() => setEditing(d)}>Change plan</Button>
            </li>
          ))}
        </ul>
      )}

      {editing && <EditPlanModal key={editing.doctor_id} doctor={editing} plans={plans} onClose={() => setEditing(null)} />}
    </section>
  );
}
