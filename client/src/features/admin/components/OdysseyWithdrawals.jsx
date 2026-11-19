import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { cn, formatDateTime, formatPeso } from '../../../lib/utils';
import { paymongoOps } from '../../billing/gateway';
import { fetchOdysseyWithdrawals, setOdysseyPayoutAccount } from '../api';

const KEY = ['admin', 'money'];
const STATUS = {
  sending: ['Sending', 'bg-[#ece7de] text-[#152839]'],
  processing: ['On its way', 'bg-[#ece7de] text-[#152839]'],
  sent: ['Sent', 'bg-[#e7f1ea] text-[#173d26]'],
  failed: ['Failed, nothing taken out', 'bg-[#fbe9e1] text-[#7a2406]'],
};

function AccountForm({ account, onDone }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState(account?.provider ?? 'instapay');
  const [bankCode, setBankCode] = useState(account?.bank_code ?? '');
  const [name, setName] = useState(account?.account_name ?? '');
  const [number, setNumber] = useState(account?.account_number ?? '');
  const banks = useQuery({
    queryKey: ['payout-banks', provider],
    queryFn: () => paymongoOps({ action: 'banks', provider }).then((r) => r.banks),
    staleTime: 6 * 3600_000,
  });
  const save = useMutation({
    mutationFn: () => setOdysseyPayoutAccount({
      provider, bankCode, bankName: banks.data?.find((b) => b.code === bankCode)?.name ?? account?.bank_name ?? '',
      accountName: name.trim(), accountNumber: number.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success(account ? 'Account changed. Withdrawals are paused for 24 hours, for safety.' : 'Account saved');
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Select label="Send by" value={provider} onChange={(e) => { setProvider(e.target.value); setBankCode(''); }}>
        <option value="instapay">InstaPay (minutes, up to ₱50,000)</option>
        <option value="pesonet">PESONet (next banking day, any amount)</option>
      </Select>
      <Select label="Bank or e-wallet" required value={bankCode} onChange={(e) => setBankCode(e.target.value)}
        disabled={banks.isLoading || banks.isError} hint={banks.isError ? 'Could not load the list. Try again in a moment.' : undefined}>
        <option value="">{banks.isLoading ? 'Loading…' : 'Choose one'}</option>
        {(banks.data ?? []).map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
      </Select>
      <Input label="Account name" required value={name} onChange={(e) => setName(e.target.value)} hint="Exactly as the bank shows it" />
      <Input label="Account or mobile number" required inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
      {account && <p className="text-sm text-[#7a2406] md:col-span-2">Changing the account pauses withdrawals for 24 hours.</p>}
      <div className="flex gap-3 md:col-span-2">
        <Button type="submit" loading={save.isPending} disabled={!bankCode || !name.trim() || !number.trim()}>Save account</Button>
        {account && <Button variant="ghost" onClick={onDone}>Cancel</Button>}
      </div>
    </form>
  );
}

/**
 * ODYSSEY's own revenue out of the PayMongo Wallet to ODYSSEY's bank or e-wallet.
 * `walletSafe` is what the wallet holds beyond doctors' money (from the coverage check), or null before it is read.
 * The Worker checks both limits again before sending.
 */
export function OdysseyWithdrawals({ walletSafe }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...KEY, 'withdrawals'], queryFn: fetchOdysseyWithdrawals, refetchInterval: 30_000 });
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const d = q.data;
  const fee = Number(d?.transfer_fee ?? 0);
  const revenue = Number(d?.revenue_available ?? 0);
  const max = Math.max(Math.min(revenue, walletSafe ?? Infinity) - fee, 0);
  useEffect(() => { if (q.data && !q.data.account) setEditing(true); }, [q.data]);

  const withdraw = useMutation({
    mutationFn: () => paymongoOps({ action: 'withdraw', amount: Number(amount), note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); setAmount(''); setNote(''); toast.success('Withdrawal sent to PayMongo'); },
    onError: (e) => { qc.invalidateQueries({ queryKey: KEY }); toast.error(e.message); },
  });

  if (q.isError) return <p role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">Could not load ODYSSEY’s withdrawals. Has migration 0022 been applied?</p>;

  if (!d) return <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" aria-label="Loading withdrawals" />;

  const paused = d.account?.withdrawals_resume_at;
  const value = Number(amount);
  const tooMuch = value > max + 0.004;

  return (
    <section className="space-y-5 rounded-[20px] border border-[#dce1e8] bg-white p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-[#152839]">Take out ODYSSEY’s revenue</h2>
        <p className="max-w-3xl text-sm text-[#45546a]">
          Send ODYSSEY’s own money from the PayMongo Wallet to ODYSSEY’s bank or e-wallet. Only ODYSSEY’s revenue can leave,
          and only what the wallet holds beyond doctors’ money. PayMongo’s transfer fee ({formatPeso(fee)}) comes out of ODYSSEY’s revenue.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[16px] bg-[#f9f8f3] p-4"><p className="text-sm text-[#45546a]">ODYSSEY’s revenue with PayMongo</p><p className="font-display text-xl font-bold tabular-nums">{formatPeso(revenue)}</p></div>
        <div className="rounded-[16px] bg-[#f9f8f3] p-4"><p className="text-sm text-[#45546a]">Wallet beyond doctors’ money</p>
          <p className="font-display text-xl font-bold tabular-nums">{walletSafe == null ? '—' : formatPeso(walletSafe)}</p>
          {walletSafe == null && <p className="text-xs text-[#5f6a7c]">Press “Check PayMongo wallet now” above</p>}</div>
        <div className="rounded-[16px] bg-[#152839] p-4 text-[#f9f8f3]"><p className="text-sm text-[#f9f8f3]/80">You can take out now</p>
          <p className="font-display text-xl font-bold tabular-nums">{formatPeso(max)}</p><p className="text-xs text-[#f9f8f3]/80">after the transfer fee</p></div>
      </div>

      <div className="space-y-3 rounded-[16px] border border-[#dce1e8] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-[#152839]">ODYSSEY’s payout account</h3>
          {d.account && !editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Change</Button>}
        </div>
        {editing ? <AccountForm account={d.account} onDone={() => setEditing(false)} /> : d.account && (
          <p className="text-sm text-[#152839]">{d.account.bank_name} · {d.account.account_name} · ending {d.account.account_number.slice(-4)}
            <span className="text-[#5f6a7c]"> ({d.account.provider === 'pesonet' ? 'PESONet' : 'InstaPay'})</span></p>
        )}
        {paused && <p className="rounded-[12px] bg-[#fbe9e1] px-3 py-2 text-sm text-[#7a2406]">The account was just changed. Withdrawals resume {formatDateTime(paused)}.</p>}
      </div>

      {d.account && !editing && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (window.confirm(`Send ${formatPeso(value)} to ${d.account.bank_name} ending ${d.account.account_number.slice(-4)}?`)) withdraw.mutate();
        }}>
          <Input label="Amount (₱)" type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}
            wrapperClassName="w-44" hint={<button type="button" className="font-semibold text-[#b8470a] hover:underline" onClick={() => setAmount(max.toFixed(2))}>Use the most: {formatPeso(max)}</button>} />
          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} wrapperClassName="min-w-[220px] flex-1" placeholder="e.g. November revenue" />
          <Button type="submit" variant="accent" loading={withdraw.isPending} disabled={!(value > 0) || tooMuch || Boolean(paused)}>Withdraw</Button>
          {tooMuch && <p className="w-full text-sm text-[#7a2406]">That is more than ODYSSEY can take out now ({formatPeso(max)}).</p>}
        </form>
      )}

      {d.withdrawals.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[#45546a]"><tr>
              <th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">To</th>
              <th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2 pr-3 text-right font-medium">Fee</th>
              <th className="py-2 pr-3 font-medium">Status</th><th className="py-2 font-medium">Reference / note</th>
            </tr></thead>
            <tbody>{d.withdrawals.map((w) => {
              const [label, tone] = STATUS[w.status] ?? [w.status, ''];
              return (
                <tr key={w.id} className="border-t border-[#dce1e8] align-top text-[#152839]">
                  <td className="py-2 pr-3">{formatDateTime(w.created_at)}</td>
                  <td className="py-2 pr-3">{w.bank_name} ending {w.account_end}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(w.amount)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(w.fee)}</td>
                  <td className="py-2 pr-3"><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', tone)}>{label}</span>
                    {w.failure_reason && <span className="mt-1 block text-xs text-[#7a2406]">{w.failure_reason}</span>}</td>
                  <td className="py-2 font-mono text-xs">{w.provider_reference || ''}{w.note && <span className="block font-sans text-[#45546a]">{w.note}</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
