import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { cn, formatDate } from '../../../lib/utils';
import { env } from '../../../config/env';
import { fetchMyReferrals } from '../api';
import { CopyLinkButton, ShareLinkButton } from '../components/CopyLinkButton';

const n = (v) => Number(v).toLocaleString('en-PH');
const plural = (v, word) => `${n(v)} ${word}${Number(v) === 1 ? '' : 's'}`;

export const myReferralsQuery = { queryKey: ['doctor', 'referrals'], queryFn: fetchMyReferrals };

function status(inv, required) {
  if (inv.outcome === 'rewarded') {
    return {
      label: `You got ${plural(inv.reward_rx, 'prescription')}`,
      detail: inv.expires_at ? `Use them by ${formatDate(inv.expires_at)}` : null,
      tone: 'done',
    };
  }
  if (inv.outcome === 'capped') {
    return { label: 'Qualified after this month’s limit', detail: 'No reward: the monthly limit was already reached', tone: 'muted' };
  }
  if (inv.rejected) return { label: 'Registration not approved', detail: null, tone: 'muted' };
  if (!inv.approved) return { label: 'Waiting for license approval', detail: null, tone: 'wait' };
  return { label: `${n(inv.rx_count)} of ${n(required)} prescriptions`, detail: null, tone: 'wait' };
}

function Invite({ inv, required }) {
  const s = status(inv, required);
  const pct = inv.outcome ? 100 : Math.round((Math.min(inv.rx_count, required) / required) * 100);
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-[#152839]">{inv.name || 'Invited doctor'}</p>
        <p className="text-xs text-[#5f6a7c]">Joined {formatDate(inv.joined_at)}</p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[#ece7de]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Progress for ${inv.name || 'invited doctor'}`}
      >
        <div
          className={cn('h-full rounded-full', s.tone === 'done' ? 'bg-emerald-600' : s.tone === 'muted' ? 'bg-[#a5adba]' : 'bg-[#ff6f07]')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn('text-sm', s.tone === 'done' ? 'font-semibold text-emerald-700' : 'text-[#45546a]')}>
        {s.label}{s.detail ? ` · ${s.detail}` : ''}
      </p>
    </li>
  );
}

export default function DoctorReferrals() {
  const { data, isLoading, isError, refetch } = useQuery(myReferralsQuery);

  if (isLoading) return <div className="h-64 animate-pulse rounded-[20px] bg-[#ece7de]" />;
  if (isError) {
    return (
      <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
        Could not load your referrals. <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
      </div>
    );
  }

  const link = `${env.appUrl}/doctor/register?ref=${data.code}`;
  const invites = data.invites ?? [];
  const rewarded = invites.filter((i) => i.outcome === 'rewarded');
  const earned = rewarded.reduce((sum, i) => sum + (i.reward_rx ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Refer a doctor</h1>
        <p className="mt-1 text-sm text-[#45546a]">
          Invite another doctor. Once their license is approved and they send {plural(data.required_rx, 'prescription')}, you get{' '}
          {plural(data.reward_rx, 'extra prescription')} to use within {n(data.reward_days)} days.
        </p>
      </div>

      {!data.enabled && (
        <div role="status" className="rounded-[18px] bg-[#ece7de] p-4 text-sm text-[#152839]">
          Referral rewards are paused right now. Doctors who sign up with your code are still linked to you.
        </div>
      )}

      <section aria-labelledby="ref-code-h" className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#fff1e6]">
            <Gift className="h-5 w-5 text-[#ff6f07]" aria-hidden="true" />
          </span>
          <h2 id="ref-code-h" className="font-display text-xl font-semibold text-[#152839]">Your referral code</h2>
        </div>

        <p className="font-mono text-3xl font-bold tracking-[0.2em] text-[#152839]" aria-label={`Referral code ${data.code.split('').join(' ')}`}>
          {data.code}
        </p>
        <p className="text-sm text-[#45546a]">
          Send the link, or tell them the code to type when they register.
        </p>
        <p className="break-all rounded-[14px] bg-[#f9f8f3] px-3 py-2 text-sm text-[#152839]">{link}</p>

        <div className="flex flex-wrap gap-2">
          <CopyLinkButton link={link} size="md" variant="primary" copiedMessage="Invite link copied" />
          <CopyLinkButton link={data.code} size="md" label="Copy code" copiedMessage="Referral code copied" />
          <ShareLinkButton
            link={link}
            title="Join me on E-Reseta"
            text={`I use E-Reseta to send e-prescriptions. Register with my code ${data.code}:`}
          />
        </div>
        <p className="text-xs text-[#5f6a7c]">
          Up to {plural(data.monthly_cap, 'reward')} a month. Extra prescriptions are used after your monthly limit runs out.
        </p>
      </section>

      <section aria-labelledby="ref-list-h" className="rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ref-list-h" className="font-display text-xl font-semibold text-[#152839]">Doctors you invited</h2>
          {earned > 0 && <p className="text-sm text-[#45546a]">{plural(earned, 'prescription')} earned so far</p>}
        </div>
        {invites.length === 0 ? (
          <p className="mt-3 text-sm text-[#45546a]">No one has registered with your code yet.</p>
        ) : (
          <ul className="divide-y divide-[#ece7de]">
            {invites.map((inv) => <Invite key={inv.id} inv={inv} required={data.required_rx} />)}
          </ul>
        )}
      </section>
    </div>
  );
}
