import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { formatDate } from '../../../lib/utils';
import { fetchMyClinic, fetchMyClinicInvites, fetchMyPlan, respondClinicInvite } from '../api';

export const myPlanQuery = { queryKey: ['doctor', 'plan'], queryFn: fetchMyPlan, refetchInterval: 60_000 };

const n = (v) => Number(v).toLocaleString('en-PH');
const DAY = 864e5;

/** 'ok' below 80% of the month's prescriptions, 'low' from 80%, 'out' when none are left. */
export function usageLevel(plan) {
  if (!plan) return 'ok';
  if (plan.rx_left <= 0) return 'out';
  const c = plan.clinic;
  const share = c?.my_cap ? c.my_used / c.my_cap : 0;
  return Math.max(plan.rx_used / plan.rx_limit, share) >= 0.8 ? 'low' : 'ok';
}

function Bar({ plan, level }) {
  const c = plan.clinic;
  // A capped doctor's bar shows their own share, because that is what stops them first.
  const capped = c?.my_cap != null;
  const used = capped ? c.my_used : plan.rx_used;
  const limit = capped ? c.my_cap : plan.rx_limit;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-[#ece7de]"
      role="progressbar"
      aria-label="Prescriptions used this month"
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={Math.min(used, limit)}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${level === 'ok' ? 'bg-[#152839]' : level === 'low' ? 'bg-[#ff6f07]' : 'bg-[#b8470a]'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function planLine(plan) {
  if (plan.clinic) return `${plan.clinic.name} · ${plan.plan_name} plan${plan.current_period_end ? `, paid until ${formatDate(plan.current_period_end)}` : ''}`;
  if (!plan.is_paid) return `${plan.plan_name} plan, free`;
  if (!plan.current_period_end) return `${plan.plan_name} plan`;
  return `${plan.plan_name} plan, paid until ${formatDate(plan.current_period_end)}`;
}

/** Dashboard panel: this month's prescriptions against the plan's limit, with the way to upgrade. */
export function PlanUsage() {
  const { data: plan, isLoading, isError, refetch } = useQuery(myPlanQuery);

  if (isLoading) return <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" aria-label="Loading your plan" />;
  if (isError || !plan) {
    return (
      <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
        Could not load your plan. <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
      </div>
    );
  }

  const level = usageLevel(plan);
  const clinic = plan.clinic;
  const isMember = clinic?.role === 'doctor';
  const endsSoon = plan.is_paid && plan.current_period_end && new Date(plan.current_period_end) - Date.now() < 7 * DAY;
  const pending = plan.latest_request?.status === 'pending';
  const outText = clinic?.limited_by === 'cap'
    ? `You have used your share of ${n(clinic.my_cap)} prescriptions this month. Ask your clinic owner to raise it, or wait until ${formatDate(plan.resets_at)}.`
    : isMember
      ? `Your clinic has used all ${n(plan.rx_limit)} prescriptions this month. Ask the clinic owner to upgrade, or wait until ${formatDate(plan.resets_at)}. Links you already sent keep working.`
      : `You have used all ${n(plan.rx_limit)} prescriptions this month. Upgrade to keep writing, or wait until ${formatDate(plan.resets_at)}. Links you already sent keep working.`;

  return (
    <section
      aria-labelledby="plan-usage-h"
      className={`rounded-[20px] border bg-white p-6 ${level === 'ok' ? 'border-[#dce1e8]' : 'border-[#f3c2af]'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="plan-usage-h" className="text-sm font-medium text-[#45546a]">{clinic ? 'Clinic prescriptions this month' : 'Prescriptions this month'}</h2>
          <p className="mt-1 font-display text-[28px] font-bold tabular-nums text-[#152839]">
            {n(plan.rx_used)} <span className="text-lg font-semibold text-[#45546a]">of {n(plan.rx_limit)}</span>
          </p>
          <p className="text-sm text-[#45546a]">{planLine(plan)}</p>
          {clinic && (
            <p className="mt-1 text-sm font-medium text-[#152839]">
              You: {n(clinic.my_used)}{clinic.my_cap != null ? ` of ${n(clinic.my_cap)} (your share)` : ' written'}
            </p>
          )}
        </div>
        <Link to={isMember ? '/doctor/clinic' : '/doctor/plan'}>
          <Button variant={level === 'ok' || isMember ? 'secondary' : 'accent'}>
            {isMember ? 'View clinic' : level === 'ok' ? 'View plans' : 'Upgrade plan'}
          </Button>
        </Link>
      </div>

      <div className="mt-4"><Bar plan={plan} level={level} /></div>

      <p className={`mt-3 text-sm ${level === 'ok' ? 'text-[#45546a]' : 'font-medium text-[#7a2406]'}`} role={level === 'ok' ? undefined : 'status'}>
        {level === 'out'
          ? outText
          : level === 'low'
            ? `Only ${n(plan.rx_left)} left for you this month. The count starts again on ${formatDate(plan.resets_at)}.`
            : `${n(plan.rx_left)} left. The count starts again on ${formatDate(plan.resets_at)}.`}
      </p>

      {pending && (
        <p className="mt-2 text-sm text-[#152839]">
          Your payment for a new plan is waiting for ODYSSEY to confirm. It starts as soon as it is confirmed.
        </p>
      )}
      {endsSoon && !pending && !isMember && (
        <p className="mt-2 text-sm font-medium text-[#7a2406]">
          Your {plan.plan_name} plan ends on {formatDate(plan.current_period_end)}. <Link to="/doctor/plan" className="underline">Renew it</Link> to keep your limit.
        </p>
      )}
      {endsSoon && isMember && (
        <p className="mt-2 text-sm font-medium text-[#7a2406]">The clinic plan ends on {formatDate(plan.current_period_end)}. Ask the clinic owner to renew it.</p>
      )}
    </section>
  );
}

/** One line above the prescription form: how many are left, and a way out when there are none. */
export function PlanUsageNotice() {
  const { data: plan } = useQuery(myPlanQuery);
  if (!plan) return null;
  const level = usageLevel(plan);
  const clinic = plan.clinic;
  const isMember = clinic?.role === 'doctor';
  if (level === 'ok') {
    return <p className="text-sm text-[#45546a]">{n(plan.rx_left)} prescriptions left this month{clinic ? ` in ${clinic.name}` : ` on ${plan.plan_name}`}.</p>;
  }
  return (
    <div role={level === 'out' ? 'alert' : 'status'} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#f3c2af] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
      <span>
        {level === 'out'
          ? clinic?.limited_by === 'cap'
            ? `You have used your share of ${n(clinic.my_cap)} prescriptions this month. New ones start again on ${formatDate(plan.resets_at)}.`
            : `${clinic ? 'Your clinic has' : 'You have'} used all ${n(plan.rx_limit)} prescriptions in the ${plan.plan_name} plan this month. New ones start again on ${formatDate(plan.resets_at)}.`
          : `Only ${n(plan.rx_left)} prescriptions left for you this month.`}
      </span>
      {isMember
        ? <Link to="/doctor/clinic"><Button variant="secondary" size="sm">View clinic</Button></Link>
        : <Link to="/doctor/plan"><Button variant="accent" size="sm">Upgrade plan</Button></Link>}
    </div>
  );
}

/** Dashboard notices about the clinic: invitations waiting, and a clinic plan that has ended. */
export function ClinicNotices() {
  const qc = useQueryClient();
  const invites = useQuery({ queryKey: ['doctor', 'clinic-invites'], queryFn: fetchMyClinicInvites, refetchInterval: 60_000 });
  const clinic = useQuery({ queryKey: ['doctor', 'clinic'], queryFn: fetchMyClinic, refetchInterval: 60_000 });

  const respond = useMutation({
    mutationFn: respondClinicInvite,
    onSuccess: (_, v) => {
      ['clinic-invites', 'clinic', 'plan', 'prescriptions'].forEach((k) => qc.invalidateQueries({ queryKey: ['doctor', k] }));
      toast.success(v.accept ? 'You joined the clinic' : 'Invitation declined');
    },
    onError: (e) => toast.error(e?.message || 'Could not answer the invitation.'),
  });

  const list = invites.data ?? [];
  const lapsed = clinic.data && clinic.data.covered === false;
  if (!list.length && !lapsed) return null;

  return (
    <div className="space-y-3">
      {list.map((i) => (
        <div key={i.id} role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[#ece7de] p-5">
          <div>
            <p className="font-display text-lg font-semibold text-[#152839]">{i.owner_name} invited you to {i.clinic_name}</p>
            <p className="text-sm text-[#45546a]">
              {i.has_seat
                ? 'Joining shares the clinic’s monthly prescriptions. Your own paid plan, if you have one, waits until you leave.'
                : 'The clinic has no free doctor seat yet. Ask the clinic owner to add one, then accept.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={respond.isPending} onClick={() => respond.mutate({ id: i.id, accept: false })}>Decline</Button>
            <Button variant="primary" loading={respond.isPending} disabled={!i.has_seat} onClick={() => respond.mutate({ id: i.id, accept: true })}>Join clinic</Button>
          </div>
        </div>
      ))}
      {lapsed && (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          {clinic.data.name}’s plan has ended, so you are on your own plan until it is renewed.{' '}
          <Link to="/doctor/clinic" className="font-semibold underline">See the clinic</Link>
        </div>
      )}
    </div>
  );
}
