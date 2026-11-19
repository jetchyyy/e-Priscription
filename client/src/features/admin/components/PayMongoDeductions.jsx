import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { formatDate, formatPeso } from '../../../lib/utils';
import { fetchDeductions, recordDeduction, removeDeduction } from '../api';

const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // Manila date

/**
 * What PayMongo kept when it settled to ODYSSEY's wallet (the digital tax). Recorded by itself from PayMongo's payouts
 * every 15 minutes; add one by hand only if a payout is missing here (check the PayMongo payout page first).
 */
export function PayMongoDeductions() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'money', 'deductions'], queryFn: fetchDeductions, refetchInterval: 60_000 });
  const [f, setF] = useState({ kind: 'digital_tax', amount: '', date: today(), payout: '', reference: '', note: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'money'] });
  const add = useMutation({
    mutationFn: () => recordDeduction({
      kind: f.kind, amount: Number(f.amount), occurredAt: new Date(`${f.date}T12:00:00+08:00`).toISOString(),
      payoutId: f.payout, reference: f.reference, note: f.note,
    }),
    onSuccess: () => { refresh(); setF({ ...f, amount: '', payout: '', reference: '', note: '' }); toast.success('Deduction recorded'); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({ mutationFn: removeDeduction, onSuccess: () => { refresh(); toast.success('Removed'); }, onError: (e) => toast.error(e.message) });
  const rows = q.data ?? [];
  const total = rows.reduce((t, r) => t + Number(r.amount), 0);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <section className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-[#152839]">PayMongo payout deductions</h2>
        <p className="max-w-3xl text-sm text-[#45546a]">
          What PayMongo keeps when it settles to ODYSSEY’s wallet, such as the digital tax. Recorded by itself from PayMongo every
          15 minutes. Add one by hand only if a payout is missing below. Doctors’ shares already paid their part; the rest is ODYSSEY’s.
        </p>
      </div>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <Select label="Type" value={f.kind} onChange={set('kind')}>
          <option value="digital_tax">Digital tax</option>
          <option value="other">Other</option>
        </Select>
        <Input label="Amount (₱)" type="number" min="0.01" step="0.01" required value={f.amount} onChange={set('amount')} />
        <Input label="Date" type="date" required value={f.date} onChange={set('date')} />
        <Input label="PayMongo payout ID" placeholder="po_…" value={f.payout} onChange={set('payout')} />
        <Input label="Adjustment ID" placeholder="adj_…" value={f.reference} onChange={set('reference')} />
        <div className="flex items-end"><Button type="submit" className="w-full" loading={add.isPending} disabled={!(Number(f.amount) > 0)}>Record</Button></div>
        <Input wrapperClassName="sm:col-span-2 lg:col-span-6" label="Note (optional)" placeholder="e.g. Digital tax on the Nov 26 payout" value={f.note} onChange={set('note')} />
      </form>

      {q.isLoading ? <div className="h-24 animate-pulse rounded-[16px] bg-[#ece7de]" /> : q.isError ? (
        <p role="alert" className="text-sm text-[#7a2406]">Could not load the deductions. Has migration 0019 been applied?</p>
      ) : !rows.length ? (
        <p className="text-sm text-[#5f6a7c]">None yet. They appear after PayMongo’s first settlement.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[#45546a]"><tr>
              <th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">PayMongo ID</th><th className="py-2 pr-3 font-medium">Note</th>
              <th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2"><span className="sr-only">Remove</span></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#dce1e8] text-[#152839]">
                  <td className="py-2 pr-3">{formatDate(r.occurred_at)}</td>
                  <td className="py-2 pr-3">{r.kind === 'digital_tax' ? 'Digital tax' : 'Other'}
                    {r.source === 'auto' && <span className="ml-2 rounded-full bg-[#e7f1ea] px-2 py-0.5 text-xs font-semibold text-[#173d26]">Auto</span>}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.payout_id || r.reference || ''}</td>
                  <td className="py-2 pr-3 text-[#45546a]">{r.note}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">−{formatPeso(r.amount)}</td>
                  <td className="py-2 text-right">
                    <button type="button" aria-label="Remove this deduction" className="rounded-full p-1.5 text-[#5f6a7c] hover:bg-[#fbe9e1] hover:text-[#7a2406]"
                      onClick={() => { if (window.confirm('Remove this deduction? The sync will not add it back.')) remove.mutate(r.id); }}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[#dce1e8] font-semibold text-[#152839]">
                <td className="py-2 pr-3" colSpan={4}>Total</td><td className="py-2 pr-3 text-right tabular-nums">−{formatPeso(total)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
