import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { formatDate } from '../../../lib/utils';
import { fetchAdminReferrals, saveReferralSettings } from '../api';

const referralsQuery = { queryKey: ['admin', 'referrals'], queryFn: fetchAdminReferrals };

const toForm = (s) => ({
  enabled: s.enabled,
  requiredRx: String(s.required_rx),
  rewardRx: String(s.reward_rx),
  rewardDays: String(s.reward_days),
  monthlyCap: String(s.monthly_cap),
});

function SettingsForm({ initial }) {
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: () => saveReferralSettings(f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: referralsQuery.queryKey });
      toast.success('Referral rules saved. Rewards already given keep their size and expiry.');
    },
    onError: (e) => toast.error(e?.message || 'Could not save the referral rules.'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6">
      <h3 className="font-display text-lg font-semibold text-[#152839]">Rules</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Prescriptions the new doctor sends" required type="number" min="1" max="1000" value={f.requiredRx} onChange={set('requiredRx')} />
        <Input label="Reward (prescriptions)" required type="number" min="1" max="10000" value={f.rewardRx} onChange={set('rewardRx')} />
        <Input label="Reward valid for (days)" required type="number" min="1" max="3650" value={f.rewardDays} onChange={set('rewardDays')} />
        <Input label="Rewards per doctor a month" required type="number" min="0" max="1000" value={f.monthlyCap} onChange={set('monthlyCap')} hint="0 stops rewards but keeps the links." />
      </div>
      <label className="flex items-center gap-2 text-[15px] text-[#152839]">
        <input type="checkbox" className="h-4 w-4 accent-[#152839]" checked={f.enabled} onChange={set('enabled')} />
        Referral rewards on
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ece7de] pt-4">
        <p className="text-sm text-[#45546a]">The reward is given once the invited doctor is approved and sends the number above.</p>
        <Button type="submit" loading={save.isPending} disabled={!dirty}>Save changes</Button>
      </div>
    </form>
  );
}

const OUTCOME = { rewarded: 'Rewarded', capped: 'Over the monthly limit' };

/** Referral rules and the latest referrals. */
export function ReferralSettings() {
  const { data, isLoading, isError, refetch } = useQuery(referralsQuery);

  return (
    <section aria-labelledby="rf-h" className="space-y-4">
      <div>
        <h2 id="rf-h" className="font-display text-xl font-semibold text-[#152839]">Referrals</h2>
        <p className="text-sm text-[#45546a]">
          Doctors invite doctors with a link or a code. The reward is extra prescriptions that expire, used after the monthly limit.
        </p>
      </div>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" />
      ) : isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load the referrals. Has migration 0016 been applied? <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : (
        <>
          <SettingsForm key={JSON.stringify(data.settings)} initial={toForm(data.settings)} />
          <div className="rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-[#152839]">Latest referrals</h3>
              <p className="text-sm text-[#45546a]">
                {data.totals.invited} invited · {data.totals.rewarded} rewarded · {data.totals.capped} over the limit
              </p>
            </div>
            {data.recent.length === 0 ? (
              <p className="mt-3 text-sm text-[#45546a]">No referrals yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-[#5f6a7c]">
                    <tr><th className="py-2 pr-3">Invited by</th><th className="py-2 pr-3">New doctor</th><th className="py-2 pr-3">Prescriptions</th><th className="py-2 pr-3">Result</th><th className="py-2">Joined</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#ece7de] text-[#152839]">
                    {data.recent.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3">{r.referrer}</td>
                        <td className="py-2 pr-3">{r.referred}{r.referred_status !== 'approved' ? <span className="text-[#5f6a7c]"> ({r.referred_status})</span> : null}</td>
                        <td className="py-2 pr-3 tabular-nums">{r.rx_count}</td>
                        <td className="py-2 pr-3">{OUTCOME[r.outcome] ?? 'In progress'}{r.reward_rx ? ` · ${r.reward_rx} Rx` : ''}</td>
                        <td className="py-2">{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
