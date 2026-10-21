import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { EmptyState } from '../../../components/ui/Card';
import { cn, formatDate, formatPeso } from '../../../lib/utils';
import {
  cancelClinicInvite, endClinic, fetchMyClinic, inviteDoctor, leaveClinic, quoteExtraSeats, removeClinicMember,
  renameClinic, requestExtraSeats, setMemberCap, transferClinicOwner,
} from '../api';
import { PlanCheckout } from '../components/PlanCheckout';
import { myPlanQuery } from '../components/PlanUsage';

const n = (v) => Number(v).toLocaleString('en-PH');
const KEY = ['doctor', 'clinic'];

/** Runs a clinic action, refreshes everything that depends on it and says what happened. */
function useClinicAction(fn, message) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: myPlanQuery.queryKey });
      qc.invalidateQueries({ queryKey: ['doctor', 'prescriptions'] });
      const text = typeof message === 'function' ? message(v) : message;
      if (text) toast.success(text);
    },
    onError: (e) => toast.error(e?.message || 'That did not work. Please try again.'),
  });
}

function Stat({ label, value, note }) {
  return (
    <div className="p-6">
      <p className="text-sm font-medium text-[#45546a]">{label}</p>
      <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{value}</p>
      {note && <p className="mt-1 text-sm text-[#45546a]">{note}</p>}
    </div>
  );
}

function Summary({ c }) {
  const left = Math.max(c.rx_limit - c.pool_used, 0);
  return (
    <div className="grid grid-cols-1 divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Stat label="Clinic prescriptions this month" value={`${n(c.pool_used)} of ${n(c.rx_limit)}`} note={`${n(left)} left · restarts ${formatDate(c.resets_at)}${c.credits_left ? ` · plus ${n(c.credits_left)} bought` : ''}`} />
      <Stat label="Doctors" value={`${c.seats_used} of ${c.seats_allowed}`} note={c.extra_seats ? `${c.seats_included} included + ${c.extra_seats} extra` : `${c.seats_included} included`} />
      <Stat
        label={`${c.plan_name} plan`}
        value={c.current_period_end ? formatDate(c.current_period_end, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : 'No end date'}
        note={c.covered ? (c.current_period_end ? 'Paid until' : undefined) : 'Ended. Renew to cover your doctors again.'}
      />
    </div>
  );
}

function RenameForm({ name }) {
  const [value, setValue] = useState(name);
  const save = useClinicAction(renameClinic, 'Clinic renamed');
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(value.trim()); }} className="flex flex-wrap items-end gap-3">
      <Input wrapperClassName="w-full sm:w-80" label="Clinic name" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
      <Button type="submit" variant="secondary" loading={save.isPending} disabled={value.trim() === name || value.trim().length < 2}>Save name</Button>
    </form>
  );
}

function CapEditor({ m }) {
  const [value, setValue] = useState(m.rx_cap == null ? '' : String(m.rx_cap));
  const save = useClinicAction(setMemberCap, 'Share updated');
  const dirty = value !== (m.rx_cap == null ? '' : String(m.rx_cap));
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save.mutate({ doctorId: m.doctor_id, cap: value === '' ? null : Number(value) }); }}
      className="flex items-center gap-2"
    >
      <label className="sr-only" htmlFor={`cap-${m.doctor_id}`}>Monthly share for {m.full_name}</label>
      <input
        id={`cap-${m.doctor_id}`}
        type="number"
        min="0"
        inputMode="numeric"
        value={value}
        placeholder="No cap"
        onChange={(e) => setValue(e.target.value)}
        className="min-h-[40px] w-24 rounded-[14px] border border-[#dce1e8] bg-white px-3 text-sm tabular-nums text-[#152839] placeholder:text-[#5f6a7c] focus:border-[#ff6f07] focus:outline-none focus:ring-2 focus:ring-[#ff6f07]/20"
      />
      {dirty && <Button type="submit" size="sm" variant="secondary" loading={save.isPending}>Save</Button>}
    </form>
  );
}

function Members({ c }) {
  const remove = useClinicAction(removeClinicMember, 'Doctor removed from the clinic');
  const transfer = useClinicAction(transferClinicOwner, 'Ownership handed over');
  return (
    <section aria-labelledby="mem-h" className="space-y-3">
      <div>
        <h2 id="mem-h" className="font-display text-xl font-semibold text-[#152839]">Doctors</h2>
        <p className="text-sm text-[#45546a]">
          You see how many prescriptions each doctor wrote and the fees they collected this month, never patient details.
          A share limits how many of the clinic’s prescriptions one doctor can use.
        </p>
      </div>
      <ul className="divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white">
        {c.members.map((m) => (
          <li key={m.doctor_id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#152839]">{m.full_name}{m.role === 'owner' ? <span className="ml-2 rounded-full bg-[#ece7de] px-2 py-0.5 text-xs font-semibold">Owner</span> : null}</p>
              <p className="truncate text-sm text-[#45546a]">{m.email}</p>
            </div>
            <div>
              <p className="text-sm text-[#45546a]">This month</p>
              <p className="font-semibold tabular-nums text-[#152839]">{n(m.rx_used)} prescriptions · {formatPeso(m.fees_collected)}</p>
            </div>
            <div>
              <p className="text-sm text-[#45546a]">Monthly share</p>
              {m.role === 'owner' ? <p className="text-sm text-[#152839]">No cap</p> : <CapEditor key={`${m.doctor_id}-${m.rx_cap}`} m={m} />}
            </div>
            {m.role === 'owner' ? <span /> : (
              <div className="flex flex-wrap gap-1">
                <Button variant="ghost" size="sm" onClick={() => window.confirm(`Make ${m.full_name} the clinic owner? You stay in the clinic as a doctor.`) && transfer.mutate(m.doctor_id)}>Make owner</Button>
                <Button variant="ghost" size="sm" className="text-[#a3330a]" onClick={() => window.confirm(`Remove ${m.full_name} from the clinic? Their prescriptions stay theirs.`) && remove.mutate(m.doctor_id)}>Remove</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Invites({ c }) {
  const [email, setEmail] = useState('');
  const send = useClinicAction(inviteDoctor, 'Invitation created');
  const cancel = useClinicAction(cancelClinicInvite, 'Invitation cancelled');
  const full = c.seats_used >= c.seats_allowed;
  const submit = (e) => {
    e.preventDefault();
    send.mutate(email.trim(), { onSuccess: () => setEmail('') });
  };
  return (
    <section aria-labelledby="inv-h" className="space-y-3">
      <div>
        <h2 id="inv-h" className="font-display text-xl font-semibold text-[#152839]">Invite a doctor</h2>
        <p className="text-sm text-[#45546a]">
          Enter the email the doctor uses (or will use) on E-Prescription. They see the invitation on their dashboard once their PRC license is approved,
          and it expires after 7 days. We do not send emails yet, so please tell them it is waiting.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Input wrapperClassName="w-full sm:w-80" label="Doctor’s email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="doctor@example.com" />
        <Button type="submit" variant="primary" loading={send.isPending} disabled={!c.covered}>Invite</Button>
      </form>
      {!c.covered && <p className="text-sm text-[#7a2406]">Renew the clinic plan before inviting doctors.</p>}
      {full && c.covered && <p className="text-sm text-[#45546a]">All {c.seats_allowed} seats are taken. A doctor you invite can join once you add a seat below.</p>}
      {c.invites.length > 0 && (
        <ul className="divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white">
          {c.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span className="font-medium text-[#152839]">{i.email}</span>
              <span className="text-[#45546a]">expires {formatDate(i.expires_at)}</span>
              <Button variant="ghost" size="sm" onClick={() => cancel.mutate(i.id)}>Cancel</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Seats({ c, pending }) {
  const [count, setCount] = useState(1);
  const [checkout, setCheckout] = useState(null);
  const quote = useQuery({ queryKey: ['doctor', 'seat-quote', count, c.current_period_end], queryFn: () => quoteExtraSeats(count), enabled: Boolean(c.extra_seat_price) && c.covered });

  if (!c.extra_seat_price) return null;
  const open = () => setCheckout({
    title: `${count} extra doctor seat${count === 1 ? '' : 's'}`,
    description: `For the rest of your paid period`,
    amount: quote.data,
    footnote: 'We check the payment in our account, usually within one business day. The seats are added once we confirm it.',
    send: (args) => requestExtraSeats({ seats: count, ...args }),
  });

  return (
    <section aria-labelledby="seat-h" className="space-y-3">
      <div>
        <h2 id="seat-h" className="font-display text-xl font-semibold text-[#152839]">Add doctor seats</h2>
        <p className="text-sm text-[#45546a]">
          Your plan includes {c.seats_included} doctors. Each extra doctor is {formatPeso(c.extra_seat_price)} a month, charged for the rest of this paid period and included when you renew.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-[#dce1e8] bg-white p-5">
        <div role="group" aria-label="Number of seats" className="flex items-center gap-2">
          <button type="button" aria-label="One fewer seat" disabled={count <= 1} onClick={() => setCount(count - 1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ece7de] text-lg font-semibold disabled:opacity-40">−</button>
          <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{count}</span>
          <button type="button" aria-label="One more seat" disabled={count >= 50} onClick={() => setCount(count + 1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ece7de] text-lg font-semibold disabled:opacity-40">+</button>
        </div>
        <p className="font-display text-xl font-bold tabular-nums text-[#152839]">{quote.data ? formatPeso(quote.data) : '…'}</p>
        <Button variant="accent" disabled={!quote.data || pending || !c.covered} onClick={open}>Pay for {count} seat{count === 1 ? '' : 's'}</Button>
        {pending && <p className="w-full text-sm text-[#45546a]">You have a payment waiting for ODYSSEY. You can pay for seats once it is reviewed.</p>}
      </div>
      <PlanCheckout request={checkout} onClose={() => setCheckout(null)} />
    </section>
  );
}

function EndClinic() {
  const end = useClinicAction(endClinic, 'Clinic ended. Everyone moved back to their own plan.');
  return (
    <section aria-labelledby="end-h" className="rounded-[20px] border border-[#f3c2af] bg-[#fbe9e1] p-5">
      <h2 id="end-h" className="font-display text-lg font-semibold text-[#7a2406]">End the clinic</h2>
      <p className="mt-1 text-sm text-[#7a2406]">
        Every doctor moves back to their own plan, and their prescriptions stay theirs. The paid days left on the clinic plan are not refunded.
      </p>
      <Button variant="danger" className="mt-3" loading={end.isPending}
        onClick={() => window.confirm('End the clinic for all doctors? This cannot be undone.') && end.mutate()}>End clinic</Button>
    </section>
  );
}

export default function DoctorClinic() {
  const { data: c, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: fetchMyClinic, refetchInterval: 30_000 });
  const { data: plan } = useQuery(myPlanQuery);
  const leave = useClinicAction(leaveClinic, 'You left the clinic. Your own plan applies again.');
  const pending = plan?.latest_request?.status === 'pending';

  if (isLoading) return <div className="h-64 animate-pulse rounded-[20px] bg-[#ece7de]" aria-label="Loading your clinic" />;
  if (isError) {
    return (
      <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
        Could not load your clinic. <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
      </div>
    );
  }

  if (!c) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Clinic</h1>
        <div className="rounded-[20px] border border-[#dce1e8] bg-white">
          <EmptyState title="You are not part of a clinic">
            A clinic lets several doctors share one plan and one monthly pool of prescriptions. Choose a Clinic plan to start one and invite your colleagues,
            or wait for an invitation from a clinic owner. It appears on your dashboard.
          </EmptyState>
          <div className="flex justify-center pb-8"><Link to="/doctor/plan"><Button variant="accent">See clinic plans</Button></Link></div>
        </div>
      </div>
    );
  }

  const owner = c.role === 'owner';
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-bold text-[#152839]">{c.name}</h1>
          <p className="mt-1 text-sm text-[#45546a]">{owner ? 'You own this clinic.' : 'You are a doctor in this clinic.'}</p>
        </div>
        {owner && (
          <div className="flex flex-wrap gap-2">
            <Link to="/doctor/plan#packs"><Button variant="secondary">Buy prescriptions</Button></Link>
            <Link to="/doctor/plan"><Button variant={c.covered ? 'secondary' : 'accent'}>{c.covered ? 'Renew or change plan' : 'Renew clinic plan'}</Button></Link>
          </div>
        )}
      </div>

      {!c.covered && (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          The clinic plan has ended, so doctors are using their own plans for now. {owner ? 'Renew it to bring everyone back.' : 'Ask the owner to renew it.'}
        </div>
      )}

      <Summary c={c} />

      {owner ? (
        <>
          <RenameForm name={c.name} />
          <Members c={c} />
          <Invites c={c} />
          <Seats c={c} pending={pending} />
          <EndClinic />
        </>
      ) : (
        <section className="rounded-[20px] border border-[#dce1e8] bg-white p-6">
          <h2 className="font-display text-xl font-semibold text-[#152839]">Your share</h2>
          <p className="mt-1 text-sm text-[#45546a]">
            You have written <span className="font-semibold text-[#152839]">{n(c.my_used)}</span> prescriptions this month
            {c.my_cap != null ? ` of the ${n(c.my_cap)} the clinic owner set for you` : ', with no limit set for you besides the clinic’s pool'}.
            The clinic owner sees how many prescriptions you write and the fees you collect, never your patients’ details.
          </p>
          <div className={cn('mt-4 flex flex-wrap items-center gap-3')}>
            <Button variant="secondary" loading={leave.isPending}
              onClick={() => window.confirm(`Leave ${c.name}? Your prescriptions stay yours and your own plan applies again.`) && leave.mutate()}>
              Leave clinic
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
