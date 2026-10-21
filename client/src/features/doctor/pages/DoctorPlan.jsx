import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { cn, formatDate, formatDateTime, formatPeso } from '../../../lib/utils';
import { usePublicPlans } from '../../billing/usePlans';
import { packsQuery, perRx, planPrice } from '../../billing/api';
import { cancelPlanRequest, fetchMyClinic, requestPlan, requestRxPack } from '../api';
import { PlanUsage, myPlanQuery } from '../components/PlanUsage';
import { PlanCheckout } from '../components/PlanCheckout';

const n = (v) => Number(v).toLocaleString('en-PH');
const isClinicPlan = (p) => p.doctors > 1;

/** Plan price plus extra doctor seats for the same period (the database computes the same figure). */
const priceWithSeats = (plan, period, seats) =>
  planPrice(plan, period) + seats * (plan.extraDoctor ?? 0) * (period === 'yearly' ? 10 : 1);

function RequestStatus({ req, plans }) {
  const qc = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => cancelPlanRequest(req.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: myPlanQuery.queryKey }); toast.success('Payment withdrawn'); },
    onError: (e) => toast.error(e?.message || 'Could not withdraw.'),
  });
  const name = plans.find((p) => p.id === req.plan_id)?.name ?? req.plan_id;
  const what = req.kind === 'extra_seats'
    ? `${req.seats} extra doctor seat${req.seats === 1 ? '' : 's'}`
    : req.kind === 'rx_pack'
      ? `${n(req.pack_rx)} extra prescriptions`
      : `${name}, ${req.billing_period === 'yearly' ? 'one year' : 'one month'}`;

  if (req.status === 'pending') {
    return (
      <div role="status" className="flex flex-wrap items-start justify-between gap-4 rounded-[20px] bg-[#ece7de] p-5">
        <div>
          <p className="font-display text-lg font-semibold text-[#152839]">Waiting for ODYSSEY to confirm your payment</p>
          <p className="mt-1 text-sm text-[#45546a]">
            {what} · {formatPeso(req.amount)} · sent {formatDateTime(req.created_at)}
            {req.reference_end ? ` · reference ending ${req.reference_end}` : ''}
          </p>
          <p className="mt-2 text-sm text-[#152839]">It takes effect as soon as it is confirmed. Your current plan keeps working until then.</p>
        </div>
        <Button variant="ghost" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>Withdraw</Button>
      </div>
    );
  }
  if (req.status === 'rejected') {
    return (
      <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
        <p className="font-semibold">We could not confirm your payment for {what}</p>
        {req.review_note && <p className="mt-1">{req.review_note}</p>}
        <p className="mt-1">Check your receipt and send it again, or reply to our email.</p>
      </div>
    );
  }
  return null;
}

function Seats({ plan, value, onChange }) {
  return (
    <div className="mt-4 rounded-[16px] bg-[#f9f8f3] p-3">
      <div className="flex items-center justify-between gap-3">
        <span id={`seats-${plan.id}`} className="text-sm font-medium text-[#152839]">
          Extra doctors <span className="font-normal text-[#5f6a7c]">(after {plan.doctors})</span>
        </span>
        <div role="group" aria-labelledby={`seats-${plan.id}`} className="flex items-center gap-2">
          <button type="button" aria-label="One fewer extra doctor" disabled={value <= 0} onClick={() => onChange(value - 1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold ring-1 ring-[#dce1e8] disabled:opacity-40">−</button>
          <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">{value}</span>
          <button type="button" aria-label="One more extra doctor" disabled={value >= 50} onClick={() => onChange(value + 1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold ring-1 ring-[#dce1e8] disabled:opacity-40">+</button>
        </div>
      </div>
      <p className="mt-1 text-xs text-[#5f6a7c]">{formatPeso(plan.extraDoctor)} each a month. You can add seats later too.</p>
    </div>
  );
}

/** Extra prescriptions without changing plan. Used only after the monthly limit, oldest expiry first. */
function Packs({ owner, pending, onBuy }) {
  const { data: packs = [], isLoading, isError, refetch } = useQuery(packsQuery);
  const [qty, setQty] = useState({});
  const q = (id) => qty[id] ?? 1;

  return (
    <section id="packs" aria-labelledby="packs-h" className="scroll-mt-24 space-y-4">
      <div>
        <h2 id="packs-h" className="font-display text-xl font-semibold text-[#152839]">Need a few more? Buy prescriptions</h2>
        <p className="text-sm text-[#45546a]">
          No plan change needed. Bought prescriptions are used after this month’s limit runs out, so nothing is wasted.
          {owner ? ' They go to your clinic and are shared by all its doctors.' : ''}
        </p>
      </div>
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-[20px] bg-[#ece7de]" />
      ) : isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load the packs. <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : !packs.length ? (
        <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">No packs are on sale right now. You can upgrade your plan instead.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-3">
          {packs.map((p) => {
            const count = q(p.id);
            return (
              <li key={p.id} className="flex flex-col rounded-[20px] border border-[#dce1e8] bg-white p-6">
                <h3 className="font-display text-xl font-bold text-[#152839]">{n(p.rx)} prescriptions</h3>
                <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{formatPeso(p.price * count)}</p>
                <p className="text-sm text-[#45546a]">About {formatPeso(perRx(p))} each · {p.validDays ? `use within ${p.validDays} days` : 'never expires'}</p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-[#f9f8f3] p-3">
                  <span id={`qty-${p.id}`} className="text-sm font-medium text-[#152839]">Packs</span>
                  <div role="group" aria-labelledby={`qty-${p.id}`} className="flex items-center gap-2">
                    <button type="button" aria-label="One fewer pack" disabled={count <= 1} onClick={() => setQty({ ...qty, [p.id]: count - 1 })}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold ring-1 ring-[#dce1e8] disabled:opacity-40">−</button>
                    <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">{count}</span>
                    <button type="button" aria-label="One more pack" disabled={count >= 20} onClick={() => setQty({ ...qty, [p.id]: count + 1 })}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-semibold ring-1 ring-[#dce1e8] disabled:opacity-40">+</button>
                  </div>
                </div>
                <p className="mt-2 flex-1 text-sm text-[#45546a]">{n(p.rx * count)} prescriptions in total</p>
                <Button className="mt-4 w-full" variant="secondary" disabled={pending} onClick={() => onBuy(p, count)}>Buy {n(p.rx * count)} prescriptions</Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function DoctorPlan() {
  const plans = usePublicPlans();
  const { data: current } = useQuery(myPlanQuery);
  const clinicQ = useQuery({ queryKey: ['doctor', 'clinic'], queryFn: fetchMyClinic });
  const [period, setPeriod] = useState('monthly');
  const [seats, setSeats] = useState(null);   // null: use the clinic's current extra seats
  const [checkout, setCheckout] = useState(null);

  const { hash } = useLocation();
  const clinic = clinicQ.data;
  const role = current?.clinic?.role ?? clinic?.role ?? null;
  const pending = current?.latest_request?.status === 'pending';
  const currentPlan = plans.find((p) => p.id === current?.plan_id);
  const seatsFor = (p) => (seats ?? (clinic?.role === 'owner' ? clinic.extra_seats : 0));
  // A clinic owner chooses among clinic plans; everyone else sees every plan.
  const shown = role === 'owner' ? plans.filter(isClinicPlan) : plans;
  const minSeats = role === 'owner' && clinic ? Math.max(clinic.seats_used - (currentPlan?.doctors ?? 0), 0) : 0;

  const open = (p) => {
    const extra = isClinicPlan(p) ? Math.max(seatsFor(p), minSeats) : 0;
    setCheckout({
      title: `${p.name} plan, ${period === 'yearly' ? 'one year' : 'one month'}`,
      description: `${n(p.rxLimit)} prescriptions a month${extra ? ` · ${extra} extra doctor${extra === 1 ? '' : 's'}` : ''}`,
      amount: priceWithSeats(p, period, extra),
      footnote: isClinicPlan(p)
        ? 'We check the payment in our account, usually within one business day. Your clinic starts on the day we confirm it, and you can then invite doctors.'
        : undefined,
      send: (args) => requestPlan({ planId: p.id, period, extraSeats: extra, ...args }),
    });
  };

  // Links such as /doctor/plan#packs scroll to their section once the page has drawn it.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, role]);

  const buyPack = (p, count) => setCheckout({
    title: `${n(p.rx * count)} extra prescriptions`,
    description: `${count} × ${p.name}${p.validDays ? `, valid ${p.validDays} days` : ', never expires'}`,
    amount: p.price * count,
    footnote: 'We check the payment in our account, usually within one business day. The prescriptions are added once we confirm it.',
    send: (args) => requestRxPack({ packId: p.id, quantity: count, ...args }),
  });

  if (role === 'doctor') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-[32px] font-bold text-[#152839]">Your plan</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#45546a]">{clinic?.name ?? 'Your clinic'} pays for your plan.</p>
        </div>
        <PlanUsage />
        <div className="rounded-[20px] border border-[#dce1e8] bg-white p-6">
          <p className="font-display text-lg font-semibold text-[#152839]">Your clinic owner manages the plan</p>
          <p className="mt-1 text-sm text-[#45546a]">
            To raise the limit or change the plan, ask the owner. If you leave the clinic you move back to your own plan.
          </p>
          <Link to="/doctor/clinic" className="mt-4 inline-block"><Button variant="secondary">See your clinic</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Your plan</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#45546a]">
          Each plan is a number of prescriptions a month. The count starts again on the 1st of every month, Manila time.
        </p>
      </div>

      <PlanUsage />

      {current?.latest_request && <RequestStatus req={current.latest_request} plans={plans} />}

      <section aria-labelledby="choose-h" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="choose-h" className="font-display text-xl font-semibold text-[#152839]">{role === 'owner' ? 'Renew or change your clinic plan' : 'Change plan'}</h2>
            <p className="text-sm text-[#45546a]">Pay by GCash, Maya or bank QR. A new plan runs for a month or a year from the day we confirm it.</p>
          </div>
          <div role="group" aria-label="Billing period" className="flex gap-1 rounded-full border border-[#dce1e8] bg-white p-1">
            {[['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={period === k}
                onClick={() => setPeriod(k)}
                className={cn('min-h-[38px] rounded-full px-4 text-sm font-semibold transition',
                  period === k ? 'bg-[#152839] text-[#f9f8f3]' : 'text-[#45546a] hover:bg-[#ece7de]')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ul className="grid gap-4 md:grid-cols-3">
          {shown.map((p) => {
            const isCurrent = p.id === current?.plan_id && (isClinicPlan(p) ? role === 'owner' : true);
            const clinicPlan = isClinicPlan(p);
            const extra = clinicPlan ? Math.max(seatsFor(p), minSeats) : 0;
            const price = clinicPlan ? priceWithSeats(p, period, extra) : planPrice(p, period);
            const bigger = currentPlan && p.rxLimit > currentPlan.rxLimit;
            return (
              <li key={p.id} className={cn('flex flex-col rounded-[20px] border bg-white p-6', isCurrent ? 'border-[#152839] ring-1 ring-[#152839]' : 'border-[#dce1e8]')}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-xl font-bold text-[#152839]">{p.name}</h3>
                  {isCurrent && <span className="rounded-full bg-[#152839] px-3 py-1 text-xs font-semibold text-[#f9f8f3]">Your plan</span>}
                </div>
                <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">
                  {price ? formatPeso(price) : '₱0'}
                  <span className="ml-1 font-sans text-sm font-medium text-[#45546a]">{price ? (period === 'yearly' ? 'a year' : 'a month') : 'forever'}</span>
                </p>
                <p className="mt-3 font-semibold text-[#152839]">{n(p.rxLimit)} prescriptions a month</p>
                <ul className="mt-2 flex-1 space-y-1.5 text-sm text-[#45546a]">
                  {p.lines.map((l) => (
                    <li key={l} className="flex gap-2">
                      <span aria-hidden="true" className="mt-1.5 inline-block h-2.5 w-2 shrink-0 rounded-[47%/35.6%] bg-[#b8470a]" />{l}
                    </li>
                  ))}
                </ul>
                {clinicPlan && p.extraDoctor ? (
                  <Seats plan={p} value={extra} onChange={(v) => setSeats(Math.max(v, minSeats))} />
                ) : null}
                <div className="mt-5">
                  {!price ? (
                    <p className="text-sm text-[#5f6a7c]">{isCurrent ? 'Upgrade any time.' : 'You move back here when a paid plan ends.'}</p>
                  ) : (
                    <Button
                      className="w-full"
                      variant={bigger && !isCurrent ? 'accent' : 'secondary'}
                      disabled={pending}
                      onClick={() => open(p)}
                    >
                      {isCurrent ? `Renew ${p.name}` : bigger ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {pending && <p className="text-sm text-[#45546a]">You can choose another plan once ODYSSEY has reviewed your payment, or withdraw it above.</p>}
        {current?.is_paid && current.current_period_end && (
          <p className="text-sm text-[#45546a]">
            Renewing {current.plan_name} adds the new period after {formatDate(current.current_period_end)}. Switching to another plan starts it on the day we confirm the payment.
          </p>
        )}
        {role !== 'owner' && (
          <p className="text-sm text-[#45546a]">
            Choosing a clinic plan makes you the clinic owner. You can then invite your colleagues, and your own paid days wait until you are done.
          </p>
        )}
      </section>

      <Packs owner={role === 'owner'} pending={pending} onBuy={buyPack} />

      <PlanCheckout request={checkout} onClose={() => setCheckout(null)} />
    </div>
  );
}
