import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { cn, formatDate, formatDateTime, formatPeso } from '../../../lib/utils';
import { downloadCsv, money } from '../../../lib/csv';
import { useAuthStore } from '../../../store/authStore';
import { feeFor, gatewayConfigQuery, paymongoOps, rateText } from '../../billing/gateway';
import {
  cancelPayout, earningsQuery, fetchStatement, requestPayout, setOnlinePayments, setPayoutAccount,
} from '../api';

const PAYOUT_STATUS = {
  requested: ['Waiting for ODYSSEY', 'bg-[#ece7de] text-[#152839]'],
  sending: ['Sending', 'bg-[#ece7de] text-[#152839]'],
  processing: ['On its way', 'bg-[#ece7de] text-[#152839]'],
  sent: ['Sent', 'bg-[#152839] text-[#f9f8f3]'],
  failed: ['Failed, money returned', 'bg-[#fbe9e1] text-[#7a2406]'],
  rejected: ['Not sent, money returned', 'bg-[#fbe9e1] text-[#7a2406]'],
  cancelled: ['Cancelled', 'bg-white text-[#45546a] ring-1 ring-[#dce1e8]'],
};

const LINE_TEXT = {
  rx_payment: 'Prescription paid',
  payout: 'Payout requested',
  payout_reversal: 'Payout returned to balance',
  refund: 'Refund to patient',
  refund_reversal: 'Refund failed, returned',
};

function Figure({ label, value, note, strong = false }) {
  return (
    <div className={cn('rounded-[20px] p-5', strong ? 'bg-[#152839] text-[#f9f8f3]' : 'border border-[#dce1e8] bg-white')}>
      <p className={cn('text-sm', strong ? 'text-[#f9f8f3]/80' : 'text-[#45546a]')}>{label}</p>
      <p className="mt-1 font-display text-[26px] font-bold tabular-nums">{formatPeso(value)}</p>
      {note && <p className={cn('mt-1 text-xs', strong ? 'text-[#f9f8f3]/80' : 'text-[#5f6a7c]')}>{note}</p>}
    </div>
  );
}

/** Turning online payments on, and choosing who pays ODYSSEY's fee. */
function OnlineSettings({ settings, methods, enabled: gatewayOn }) {
  const qc = useQueryClient();
  const [feeMode, setFeeMode] = useState(settings.fee_mode);
  const [accept, setAccept] = useState(false);
  useEffect(() => setFeeMode(settings.fee_mode), [settings.fee_mode]);
  const example = 500;

  const save = useMutation({
    mutationFn: (v) => setOnlinePayments(v),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: earningsQuery.queryKey });
      toast.success(v.enabled ? (settings.online_enabled ? 'Saved' : 'Online payments are on') : 'Online payments are off');
    },
    onError: (e) => toast.error(e?.message || 'Could not save.'),
  });

  const needsTerms = !settings.terms_accepted_at;

  return (
    <section aria-labelledby="online-h" className="space-y-5 rounded-[20px] border border-[#dce1e8] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="online-h" className="font-display text-xl font-semibold text-[#152839]">Online payments</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#45546a]">
            Patients pay through PayMongo and their prescription opens by itself. No receipts to check.
            ODYSSEY keeps your share and sends it to your bank when you ask.
          </p>
        </div>
        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', settings.online_enabled ? 'bg-[#152839] text-[#f9f8f3]' : 'bg-[#ece7de] text-[#152839]')}>
          {settings.online_enabled ? 'On' : 'Off'}
        </span>
      </div>

      {!gatewayOn && (
        <p role="status" className="rounded-[16px] bg-[#ece7de] p-4 text-sm text-[#152839]">
          ODYSSEY has paused online payments for now. Patients can still pay your own QR and send a receipt.
        </p>
      )}

      <fieldset>
        <legend className="text-sm font-semibold text-[#152839]">Who pays ODYSSEY’s fee?</legend>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {[
            ['pass', 'The patient', 'The fee is added on top. You receive your full prescription fee.'],
            ['absorb', 'I do', 'The patient pays only your fee. ODYSSEY’s fee comes out of your share.'],
          ].map(([key, title, text]) => (
            <label key={key} className={cn('flex cursor-pointer gap-3 rounded-[16px] border p-4 transition',
              feeMode === key ? 'border-[#152839] ring-1 ring-[#152839]' : 'border-[#dce1e8] hover:border-[#152839]')}>
              <input type="radio" name="fee-mode" value={key} checked={feeMode === key} onChange={() => setFeeMode(key)} className="mt-1 h-4 w-4 accent-[#152839]" />
              <span>
                <span className="block font-semibold text-[#152839]">{title}</span>
                <span className="block text-sm text-[#45546a]">{text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {methods.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="mb-2 text-left text-sm text-[#45546a]">Example: a {formatPeso(example)} prescription</caption>
            <thead>
              <tr className="text-left text-[#45546a]">
                <th className="py-2 pr-3 font-medium">Method</th>
                <th className="py-2 pr-3 font-medium">ODYSSEY fee</th>
                <th className="py-2 pr-3 text-right font-medium">Patient pays</th>
                <th className="py-2 text-right font-medium">You get</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => {
                const fee = feeFor(m, example);
                return (
                  <tr key={m.method} className="border-t border-[#dce1e8] text-[#152839]">
                    <td className="py-2 pr-3 font-medium">{m.label}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatPeso(fee)} <span className="text-[#5f6a7c]">({rateText(m)})</span></td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(feeMode === 'pass' ? example + fee : example)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatPeso(feeMode === 'pass' ? example : example - fee)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {needsTerms && !settings.online_enabled && (
        <label className="flex gap-3 rounded-[16px] bg-[#f9f8f3] p-4 text-sm text-[#152839]">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#152839]" />
          <span>
            I appoint ODYSSEY to collect my patients’ payments for me as my collecting agent. My share is my income and
            ODYSSEY holds it for me until I ask for a payout. I agree to the fees, the hold period and the refund rules in
            the <Link to="/terms#online-payments" className="font-semibold underline" target="_blank">Terms</Link>.
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-3">
        {settings.online_enabled ? (
          <>
            <Button disabled={feeMode === settings.fee_mode} loading={save.isPending && save.variables?.enabled}
              onClick={() => save.mutate({ enabled: true, feeMode })}>Save</Button>
            <Button variant="secondary" loading={save.isPending && !save.variables?.enabled}
              onClick={() => save.mutate({ enabled: false, feeMode })}>Turn off online payments</Button>
          </>
        ) : (
          <Button variant="accent" disabled={(needsTerms && !accept) || !gatewayOn} loading={save.isPending}
            onClick={() => save.mutate({ enabled: true, feeMode, acceptTerms: needsTerms && accept })}>
            Turn on online payments
          </Button>
        )}
      </div>
    </section>
  );
}

/** Where payouts go. Banks and e-wallets come from PayMongo's own list. */
function PayoutAccount({ account, locked }) {
  const qc = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const [editing, setEditing] = useState(!account);
  const [provider, setProvider] = useState(account?.provider ?? 'instapay');
  const [bankCode, setBankCode] = useState(account?.bank_code ?? '');
  const [name, setName] = useState(account?.account_name ?? profile?.full_name ?? '');
  const [number, setNumber] = useState(account?.account_number ?? '');
  const banks = useQuery({
    queryKey: ['payout-banks', provider],
    queryFn: () => paymongoOps({ action: 'banks', provider }).then((r) => r.banks),
    enabled: editing,
    staleTime: 6 * 3600_000,
  });
  const bank = banks.data?.find((b) => b.code === bankCode);

  const save = useMutation({
    mutationFn: () => setPayoutAccount({ provider, bankCode, bankName: bank?.name ?? account?.bank_name, accountName: name.trim(), accountNumber: number }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: earningsQuery.queryKey }); setEditing(false); toast.success('Payout account saved'); },
    onError: (e) => toast.error(e?.message || 'Could not save the account.'),
  });

  if (!editing && account) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-[#f9f8f3] p-4">
        <div className="text-sm text-[#152839]">
          <p className="font-semibold">{account.bank_name}</p>
          <p className="text-[#45546a]">{account.account_name} · ending {account.account_number.slice(-4)} · {account.provider === 'pesonet' ? 'PESONet, next banking day' : 'InstaPay, usually minutes'}</p>
        </div>
        <Button variant="ghost" disabled={locked} onClick={() => setEditing(true)}>{locked ? 'Payout in progress' : 'Change'}</Button>
      </div>
    );
  }

  return (
    <form className="grid gap-4 rounded-[16px] bg-[#f9f8f3] p-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Select label="Transfer type" value={provider} onChange={(e) => { setProvider(e.target.value); setBankCode(''); }}>
        <option value="instapay">InstaPay (usually minutes, up to ₱50,000)</option>
        <option value="pesonet">PESONet (next banking day, any amount)</option>
      </Select>
      <Select label="Bank or e-wallet" required value={bankCode} onChange={(e) => setBankCode(e.target.value)}
        disabled={banks.isLoading || banks.isError}
        hint={banks.isError ? 'Could not load the list. Try again in a moment.' : undefined}>
        <option value="">{banks.isLoading ? 'Loading…' : 'Choose one'}</option>
        {(banks.data ?? []).map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
      </Select>
      <Input label="Account name" required value={name} onChange={(e) => setName(e.target.value)}
        hint="Exactly as your bank shows it. It should match your verified name, or ODYSSEY may ask before sending." />
      <Input label="Account or mobile number" required inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
      <div className="flex gap-3 md:col-span-2">
        <Button type="submit" loading={save.isPending} disabled={!bankCode || !name.trim() || !number.trim()}>Save account</Button>
        {account && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
      </div>
    </form>
  );
}

function RequestPayout({ balance, rules, account, open }) {
  const qc = useQueryClient();
  const available = Math.max(Number(balance.available), 0);
  const [amount, setAmount] = useState('');
  const value = amount === '' ? available : Number(amount);
  const fee = Number(rules.payout_fee);
  const tooSmall = value < Number(rules.min_payout);

  const ask = useMutation({
    mutationFn: () => requestPayout(value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: earningsQuery.queryKey }); setAmount(''); toast.success('Payout requested. ODYSSEY will send it soon.'); },
    onError: (e) => toast.error(e?.message || 'Could not request the payout.'),
  });

  if (!account) return <p className="text-sm text-[#45546a]">Add your payout account first.</p>;
  if (open) return <p className="text-sm text-[#45546a]">Your payout is in progress. You can ask for the next one once it is sent.</p>;
  if (available < Number(rules.min_payout)) {
    return (
      <p className="text-sm text-[#45546a]">
        You can ask for a payout once {formatPeso(rules.min_payout)} is available. You have {formatPeso(available)} available now.
      </p>
    );
  }

  return (
    <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); ask.mutate(); }}>
      <Input label="Amount" type="number" inputMode="decimal" min={rules.min_payout} max={available} step="0.01"
        value={amount === '' ? available.toFixed(2) : amount} onChange={(e) => setAmount(e.target.value)} wrapperClassName="w-44" />
      <dl className="min-w-[220px] flex-1 space-y-1 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-[#45546a]">Transfer fee</dt><dd className="tabular-nums">−{formatPeso(fee)}</dd></div>
        <div className="flex justify-between gap-3 font-semibold text-[#152839]"><dt>Reaches your account</dt><dd className="tabular-nums">{formatPeso(Math.max(value - fee, 0))}</dd></div>
      </dl>
      <Button type="submit" variant="accent" loading={ask.isPending} disabled={tooSmall || value > available}>Ask for payout</Button>
    </form>
  );
}

function Statement() {
  const months = useMemo(() => {
    const out = [];
    const d = new Date();
    for (let i = 0; i < 18; i++) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }, []);
  const [month, setMonth] = useState(months[0]);
  const get = useMutation({
    mutationFn: () => fetchStatement(month),
    onSuccess: (st) => {
      let run = Number(st.opening);
      const rows = [
        { kind: 'opening', balance: st.opening },
        ...st.lines.map((l) => { run += Number(l.amount); return { kind: 'line', ...l, balance: run }; }),
        { kind: 'closing', balance: st.closing },
      ];
      const line = (fn) => (r) => (r.kind === 'line' ? fn(r) : '');
      downloadCsv(`odyssey-statement-${month}.csv`, [
        { label: 'Date (Manila)', value: line((r) => formatDateTime(r.at)) },
        { label: 'What', value: (r) => (r.kind === 'opening' ? 'Opening balance' : r.kind === 'closing' ? 'Closing balance' : LINE_TEXT[r.type] ?? r.type) },
        { label: 'Prescription', value: line((r) => r.prescription_id ?? '') },
        { label: 'Patient', value: line((r) => r.patient ?? '') },
        { label: 'Method', value: line((r) => r.method ?? '') },
        { label: 'Prescription fee', value: line((r) => money(r.price)) },
        { label: 'ODYSSEY fee', value: line((r) => money(r.fee)) },
        { label: 'Fee paid by', value: line((r) => (r.fee_mode === 'pass' ? 'Patient' : r.fee_mode === 'absorb' ? 'Doctor' : '')) },
        { label: 'Patient paid', value: line((r) => money(r.total)) },
        { label: 'Transfer fee', value: line((r) => money(r.payout_fee)) },
        { label: 'Sent to bank', value: line((r) => money(r.payout_net)) },
        { label: 'Amount', value: line((r) => money(r.amount)) },
        { label: 'Balance', value: (r) => money(r.balance) },
        { label: 'Available from', value: line((r) => (r.available_at ? formatDate(r.available_at) : '')) },
      ], rows);
    },
    onError: (e) => toast.error(e?.message || 'Could not build the statement.'),
  });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select label="Month" value={month} onChange={(e) => setMonth(e.target.value)} wrapperClassName="w-48">
        {months.map((m) => <option key={m} value={m}>{new Date(`${m}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</option>)}
      </Select>
      <Button variant="secondary" loading={get.isPending} onClick={() => get.mutate()}>Download statement (CSV)</Button>
    </div>
  );
}

export default function DoctorEarnings() {
  const qc = useQueryClient();
  const q = useQuery({ ...earningsQuery, refetchInterval: 60_000 });
  const cfg = useQuery(gatewayConfigQuery);
  const cancel = useMutation({
    mutationFn: cancelPayout,
    onSuccess: () => { qc.invalidateQueries({ queryKey: earningsQuery.queryKey }); toast.success('Payout cancelled. The money is back in your balance.'); },
    onError: (e) => toast.error(e?.message || 'Could not cancel.'),
  });

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-[20px] bg-[#ece7de]" aria-label="Loading earnings" />;
  if (q.isError) {
    return (
      <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
        Could not load your earnings. Has migration 0010 been applied?
        <button className="ml-1 font-semibold underline" onClick={() => q.refetch()}>Try again</button>
      </div>
    );
  }

  const { settings, rules, balance, payments, payouts } = q.data;
  const openPayout = payouts.find((p) => ['requested', 'sending', 'processing'].includes(p.status));
  const next = balance.next_release;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Earnings and payouts</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#45546a]">
          Every peso from online payments, where it is now, and what reaches your bank.
          Money becomes available {rules.hold_days} day{rules.hold_days === 1 ? '' : 's'} after the patient pays.
        </p>
      </div>

      <OnlineSettings settings={settings} methods={cfg.data?.methods ?? []} enabled={rules.enabled} />

      <section aria-labelledby="bal-h" className="space-y-4">
        <h2 id="bal-h" className="font-display text-xl font-semibold text-[#152839]">Your balance</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure strong label="Available to pay out" value={balance.available}
            note={Number(balance.available) < 0 ? 'A refund is more than your available money. It comes off your next payments.' : undefined} />
          <Figure label="On hold" value={balance.on_hold}
            note={next ? `${formatPeso(next.amount)} becomes available ${formatDate(next.at)}` : `${rules.hold_days}-day hold after each payment`} />
          <Figure label="Payout in progress" value={balance.requested} />
          <Figure label="Paid out to your bank" value={balance.paid_out}
            note={Number(balance.paid_out) ? `${formatPeso(balance.received)} received after ${formatPeso(balance.transfer_fees)} in transfer fees` : undefined} />
        </div>
        <dl className="grid gap-x-8 gap-y-2 rounded-[20px] border border-[#dce1e8] bg-white p-5 text-sm sm:grid-cols-2">
          {[
            ['Your share of all online payments', balance.earned],
            ['Refunded to patients', -Number(balance.refunded)],
            ['ODYSSEY fees paid by your patients', balance.fees_passed],
            ['ODYSSEY fees you covered', balance.fees_absorbed],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-[#45546a]">{k}</dt><dd className="tabular-nums text-[#152839]">{formatPeso(v)}</dd></div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="payout-h" className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-6">
        <div>
          <h2 id="payout-h" className="font-display text-xl font-semibold text-[#152839]">Get paid</h2>
          <p className="mt-1 text-sm text-[#45546a]">
            The smallest payout is {formatPeso(rules.min_payout)}. Each transfer costs {formatPeso(rules.payout_fee)}, taken from the amount.
            ODYSSEY checks each request, then sends it.
          </p>
        </div>
        <PayoutAccount account={settings.payout_account} locked={Boolean(openPayout)} />
        <RequestPayout balance={balance} rules={rules} account={settings.payout_account} open={Boolean(openPayout)} />
      </section>

      <section aria-labelledby="po-h" className="space-y-3">
        <h2 id="po-h" className="font-display text-xl font-semibold text-[#152839]">Payouts</h2>
        {!payouts.length ? (
          <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">No payouts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[20px] border border-[#dce1e8] bg-white">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-[#f9f8f3] text-left text-[#45546a]">
                <tr>
                  <th className="px-4 py-3 font-medium">Asked</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Transfer fee</th>
                  <th className="px-4 py-3 text-right font-medium">To your account</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => {
                  const [label, tone] = PAYOUT_STATUS[p.status] ?? [p.status, ''];
                  return (
                    <tr key={p.id} className="border-t border-[#dce1e8] align-top text-[#152839]">
                      <td className="px-4 py-3">
                        {formatDateTime(p.created_at)}
                        <span className="block text-xs text-[#5f6a7c]">{p.bank_name} ending {p.account_end}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatPeso(p.amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">−{formatPeso(p.fee)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPeso(p.net_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-block rounded-full px-2.5 py-1 text-xs font-semibold', tone)}>{label}</span>
                        {p.sent_at && <span className="mt-1 block text-xs text-[#5f6a7c]">Sent {formatDateTime(p.sent_at)}</span>}
                        {(p.provider_reference || p.manual_reference) && <span className="block text-xs text-[#5f6a7c]">Ref {p.provider_reference || p.manual_reference}</span>}
                        {(p.failure_reason || p.admin_note) && ['failed', 'rejected'].includes(p.status) && (
                          <span className="block text-xs text-[#7a2406]">{p.admin_note || p.failure_reason}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.status === 'requested' && (
                          <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(p.id)}>Cancel</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="pay-h" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="pay-h" className="font-display text-xl font-semibold text-[#152839]">Online payments</h2>
            <p className="text-sm text-[#45546a]">Each payment, what the patient paid, ODYSSEY’s fee, and your share.</p>
          </div>
          <Statement />
        </div>
        {!payments.length ? (
          <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">
            {settings.online_enabled ? 'No online payments yet. They appear here as soon as a patient pays.' : 'Turn on online payments to see them here.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[20px] border border-[#dce1e8] bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-[#f9f8f3] text-left text-[#45546a]">
                <tr>
                  <th className="px-4 py-3 font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 text-right font-medium">Your fee</th>
                  <th className="px-4 py-3 text-right font-medium">ODYSSEY fee</th>
                  <th className="px-4 py-3 text-right font-medium">Patient paid</th>
                  <th className="px-4 py-3 text-right font-medium">Your share</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const held = p.available_at && new Date(p.available_at) > new Date();
                  return (
                    <tr key={p.id} className="border-t border-[#dce1e8] align-top text-[#152839]">
                      <td className="px-4 py-3">{formatDateTime(p.paid_at)}<span className="block text-xs text-[#5f6a7c]">{p.method_label}</span></td>
                      <td className="px-4 py-3">{p.patient}<span className="block font-mono text-xs text-[#5f6a7c]">{p.prescription_id}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatPeso(p.price)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatPeso(p.fee)}
                        <span className="block text-xs text-[#5f6a7c]">{p.fee_mode === 'pass' ? 'paid by patient' : 'from your share'}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatPeso(p.total)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPeso(p.doctor_share)}</td>
                      <td className="px-4 py-3 text-xs">
                        {p.refund ? (
                          <span className="text-[#7a2406]">Refunded {formatPeso(p.refund.amount)} to patient{p.refund.status === 'succeeded' ? '' : ' (in progress)'}</span>
                        ) : held ? (
                          <span className="text-[#45546a]">On hold until {formatDate(p.available_at)}</span>
                        ) : (
                          <span className="text-[#152839]">Available</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
