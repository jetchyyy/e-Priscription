import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { cn, formatDate } from '../../../lib/utils';
import { endClinicAsAdmin, fetchClinics, setClinic } from '../api';

const n = (v) => Number(v).toLocaleString('en-PH');
const toDateInput = (iso) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(iso)) : '');
const fromDateInput = (d) => (d ? `${d}T23:59:59+08:00` : null);

function EditClinic({ clinic, plans, onClose }) {
  const qc = useQueryClient();
  const clinicPlans = plans.filter((p) => p.doctors > 1 || p.id === clinic.plan_id);
  const [form, setForm] = useState({
    planId: clinic.plan_id,
    periodEnd: toDateInput(clinic.current_period_end),
    extraSeats: String(clinic.extra_seats),
    rxLimitOverride: clinic.has_override ? String(clinic.rx_limit) : '',
    billingPeriod: clinic.billing_period,
    note: clinic.note ?? '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'clinics'] }); qc.invalidateQueries({ queryKey: ['admin', 'doctor-plans'] }); };

  const save = useMutation({
    mutationFn: () => setClinic({ id: clinic.id, ...form, periodEnd: fromDateInput(form.periodEnd) }),
    onSuccess: () => { refresh(); toast.success(`${clinic.name} updated`); onClose(); },
    onError: (e) => toast.error(e?.message || 'Could not update the clinic.'),
  });
  const end = useMutation({
    mutationFn: () => endClinicAsAdmin(clinic.id),
    onSuccess: () => { refresh(); toast.success('Clinic ended. Its doctors moved back to their own plans.'); onClose(); },
    onError: (e) => toast.error(e?.message || 'Could not end the clinic.'),
  });

  return (
    <Modal open onClose={onClose} title={clinic.name} description={`Owner: ${clinic.owner_name} · ${clinic.owner_email}`}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4 pt-2">
        <Select label="Plan" value={form.planId} onChange={set('planId')}>
          {clinicPlans.map((p) => <option key={p.id} value={p.id}>{p.name} ({n(p.rxLimit)} a month, {p.doctors} doctors)</option>)}
        </Select>
        <Input label="Paid until" type="date" value={form.periodEnd} onChange={set('periodEnd')}
          hint="Leave empty for no end date. After this day the doctors move back to their own plans." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Extra doctor seats" type="number" min="0" max="100" value={form.extraSeats} onChange={set('extraSeats')} />
          <Input label="Custom prescription limit" type="number" min="0" value={form.rxLimitOverride} onChange={set('rxLimitOverride')} placeholder="Plan’s limit" hint="Shared by the whole clinic." />
        </div>
        <Select label="Billing" value={form.billingPeriod} onChange={set('billingPeriod')}>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </Select>
        <Input label="Note (only admins see it)" maxLength={300} value={form.note} onChange={set('note')} placeholder="e.g. Hospital pilot, invoiced" />
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button variant="danger" loading={end.isPending}
            onClick={() => window.confirm(`End ${clinic.name}? Its doctors move back to their own plans.`) && end.mutate()}>End clinic</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save clinic</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Active clinics, their doctors and usage, with a way to correct a clinic's plan by hand. */
export function AdminClinics({ plans }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'clinics'], queryFn: fetchClinics, refetchInterval: 60_000 });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => !q || [c.name, c.owner_name, c.owner_email].some((v) => v?.toLowerCase().includes(q)));
  }, [data, search]);

  return (
    <section aria-labelledby="ac-h" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="ac-h" className="font-display text-xl font-semibold text-[#152839]">Clinics</h2>
          <p className="text-sm text-[#45546a]">Doctors sharing one plan. Counts only; admins do not see patient details here either.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6a7c]" aria-hidden="true" />
          <input aria-label="Search clinics" type="search" placeholder="Search clinic or owner…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[18px] border border-[#dce1e8] bg-white py-2 pl-10 pr-4 text-sm text-[#152839] placeholder:text-[#5f6a7c] focus:border-[#ff6f07] focus:outline-none focus:ring-2 focus:ring-[#ff6f07]/20" />
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" />
      ) : isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load clinics. Has migration 0007 been applied? <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : !rows.length ? (
        <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">
          {search ? 'No clinic matches that search.' : 'No clinics yet. One appears when a doctor’s Clinic plan payment is approved.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => {
            const pct = c.rx_limit > 0 ? Math.min(100, Math.round((c.pool_used / c.rx_limit) * 100)) : 100;
            const ended = c.current_period_end && new Date(c.current_period_end) <= new Date();
            return (
              <li key={c.id} className="rounded-[20px] border border-[#dce1e8] bg-white p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-semibold text-[#152839]">{c.name}</p>
                    <p className="truncate text-sm text-[#45546a]">{c.owner_name} · {c.owner_email}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[#152839]">{c.plan_name}</p>
                    <p className={cn('text-sm', ended ? 'text-[#7a2406]' : 'text-[#45546a]')}>
                      {c.current_period_end ? `${ended ? 'Ended' : 'Paid until'} ${formatDate(c.current_period_end)}` : 'No end date'}
                    </p>
                    <p className="text-sm text-[#45546a]">Doctors {c.seats_used} of {c.seats_allowed}</p>
                  </div>
                  <div className="min-w-[140px]">
                    <p className="text-sm tabular-nums text-[#152839]"><span className="font-semibold">{n(c.pool_used)}</span> of {n(c.rx_limit)}{c.has_override ? ' (custom)' : ''}</p>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#ece7de]">
                      <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-[#b8470a]' : pct >= 80 ? 'bg-[#ff6f07]' : 'bg-[#152839]')} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>Edit clinic</Button>
                </div>
                <p className="mt-3 text-sm text-[#45546a]">
                  {c.members.map((m) => `${m.full_name}${m.role === 'owner' ? ' (owner)' : ''} ${m.rx_used}`).join(' · ')}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <EditClinic key={editing.id} clinic={editing} plans={plans} onClose={() => setEditing(null)} />}
    </section>
  );
}
