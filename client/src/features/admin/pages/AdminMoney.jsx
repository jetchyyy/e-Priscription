import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { cn, formatDate, formatDateTime, formatPeso } from '../../../lib/utils';
import { downloadCsv, money } from '../../../lib/csv';
import { EIGHT_PCT_LIMIT, EXEMPT, taxOptions } from '../../../lib/tax';
import { feeFor, paymongoOps, rateText } from '../../billing/gateway';
import {
  addExpense, deleteExpense, expenseReceiptUrl, fetchAdminPayouts, fetchDoctorBalances, fetchExpenses,
  fetchGatewayAdminConfig, fetchGatewayPayments, fetchMoneyOverview, fetchTaxSummary, rejectPayout, resolvePayout,
  saveFeeRate, saveGatewaySettings,
} from '../api';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'payments', label: 'Online payments' },
  { key: 'doctors', label: 'Doctor balances' },
  { key: 'fees', label: 'Fees and rules' },
  { key: 'taxes', label: 'Taxes and expenses' },
];

const METHOD = { qrph: 'QR Ph', gcash: 'GCash', paymaya: 'Maya', card: 'Card' };
const KEY = ['admin', 'money'];

const copy = async (text) => {
  try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Could not copy'); }
};

function Loading() {
  return <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" aria-label="Loading" />;
}

function LoadError({ q, what }) {
  return (
    <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
      Could not load {what}. Has migration 0010 been applied?
      <button className="ml-1 font-semibold underline" onClick={() => q.refetch()}>Try again</button>
    </div>
  );
}

function Figure({ label, value, note, strong }) {
  return (
    <div className={cn('rounded-[20px] p-5', strong ? 'bg-[#152839] text-[#f9f8f3]' : 'border border-[#dce1e8] bg-white')}>
      <p className={cn('text-sm', strong ? 'text-[#f9f8f3]/80' : 'text-[#45546a]')}>{label}</p>
      <p className="mt-1 font-display text-[24px] font-bold tabular-nums">{typeof value === 'number' || typeof value === 'string' ? formatPeso(value) : value}</p>
      {note && <p className={cn('mt-1 text-xs', strong ? 'text-[#f9f8f3]/80' : 'text-[#5f6a7c]')}>{note}</p>}
    </div>
  );
}

function Rows({ rows }) {
  return (
    <dl className="divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white text-sm">
      {rows.map(([k, v, strong]) => (
        <div key={k} className={cn('flex justify-between gap-3 px-5 py-3', strong && 'font-semibold')}>
          <dt className="text-[#45546a]">{k}</dt>
          <dd className="tabular-nums text-[#152839]">{formatPeso(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------------------------------------
function Overview() {
  const q = useQuery({ queryKey: [...KEY, 'overview'], queryFn: fetchMoneyOverview, refetchInterval: 60_000 });
  const wallet = useMutation({ mutationFn: () => paymongoOps({ action: 'wallet' }), onError: (e) => toast.error(e.message) });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <LoadError q={q} what="the overview" />;
  const o = q.data;
  const live = wallet.data?.wallets?.[0];
  const liveAvail = live?.available != null ? Number(live.available) / 100 : null;

  return (
    <div className="space-y-6">
      {(Number(o.needs_review) > 0 || Number(o.payouts_waiting) > 0) && (
        <div role="status" className="rounded-[18px] bg-[#ece7de] p-4 text-sm text-[#152839]">
          {Number(o.payouts_waiting) > 0 && <p><strong>{o.payouts_waiting}</strong> payout{o.payouts_waiting == 1 ? '' : 's'} waiting for you in Payouts.</p>}
          {Number(o.needs_review) > 0 && <p><strong>{o.needs_review}</strong> online payment{o.needs_review == 1 ? '' : 's'} held aside. Check them in Online payments.</p>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure strong label="ODYSSEY earned" value={o.odyssey_earned} note="Fees and sales, after PayMongo’s charges" />
        <Figure label="Collected online" value={o.collected} note={`${o.payments_count} payment${o.payments_count == 1 ? '' : 's'}`} />
        <Figure label="Owed to doctors" value={o.owed_to_doctors} note={`${formatPeso(o.doctors_on_hold)} on hold · ${formatPeso(o.doctors_available)} available`} />
        <Figure label="Paid out to doctors" value={o.paid_out} note={Number(o.payouts_requested) ? `${formatPeso(o.payouts_requested)} in progress` : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#152839]">ODYSSEY’s own money</h2>
          <Rows rows={[
            ['ODYSSEY fees on prescriptions', o.odyssey_fees],
            ['Plans, seats and packs sold', o.odyssey_sales],
            ['PayMongo charges', -Number(o.paymongo_cost)],
            ['Transfer fee difference', o.payout_fee_diff],
            ['ODYSSEY earned', o.odyssey_earned, true],
          ]} />
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#152839]">Doctors’ money (held for them)</h2>
          <Rows rows={[
            ['Their shares of prescription payments, less payouts and refunds', o.owed_to_doctors, true],
            ['On hold (inside the hold period)', o.doctors_on_hold],
            ['Available for them to ask for', o.doctors_available],
            ['In payouts being sent', o.payouts_requested],
            ['Owed back by doctors after refunds', o.doctors_owing],
            ['Refunded to patients so far', o.refunded],
          ]} />
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#152839]">Balance check</h2>
        <p className="max-w-3xl text-sm text-[#45546a]">
          The ledger adds up every peso in and out. Compare “should be with PayMongo” with your PayMongo wallet. A gap means
          a payment or transfer the system has not heard about yet, or money moved outside the system.
        </p>
        <Rows rows={[
          ['All money in, less PayMongo charges, payouts and refunds', o.ledger_total],
          ['PayMongo payouts to ODYSSEY’s bank', -Number(o.settled_to_bank)],
          ['Should be with PayMongo', o.expected_with_paymongo, true],
          ['Held aside (needs review)', o.suspense],
        ]} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" loading={wallet.isPending} onClick={() => wallet.mutate()}>Check PayMongo wallet now</Button>
          {liveAvail != null && (
            <p className="text-sm text-[#152839]">
              Wallet available: <strong className="tabular-nums">{formatPeso(liveAvail)}</strong>
              {Math.abs(liveAvail - Number(o.expected_with_paymongo)) >= 0.01
                ? <span className="text-[#7a2406]"> · differs by {formatPeso(liveAvail - Number(o.expected_with_paymongo))}</span>
                : <span> · matches</span>}
            </p>
          )}
          {wallet.data && liveAvail == null && <p className="text-sm text-[#45546a]">PayMongo did not return a wallet balance. Check it in the dashboard.</p>}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
function PayoutCard({ p }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState(null); // reject | manual | failed
  const [text, setText] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const send = useMutation({
    mutationFn: () => paymongoOps({ action: 'send_payout', payout_id: p.id }),
    onSuccess: () => { refresh(); toast.success(`Payout to ${p.doctor_name} sent to PayMongo`); },
    onError: (e) => { refresh(); toast.error(e.message); },
  });
  const reject = useMutation({ mutationFn: rejectPayout, onSuccess: () => { refresh(); setMode(null); toast.success('Payout rejected. The money is back in the doctor’s balance.'); }, onError: (e) => toast.error(e.message) });
  const resolve = useMutation({ mutationFn: resolvePayout, onSuccess: () => { refresh(); setMode(null); toast.success('Saved'); }, onError: (e) => toast.error(e.message) });
  const available = Number(p.doctor_balance?.available ?? 0);

  return (
    <li className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-[#152839]">{p.doctor_name}</p>
          <p className="text-sm text-[#45546a]">{p.doctor_email} · asked {formatDateTime(p.created_at)}</p>
        </div>
        <span className="rounded-full bg-[#ece7de] px-3 py-1 text-xs font-semibold text-[#152839]">{p.status}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-[#45546a]">Taken from balance</dt><dd className="tabular-nums">{formatPeso(p.amount)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#45546a]">Transfer fee (doctor pays)</dt><dd className="tabular-nums">−{formatPeso(p.fee)}</dd></div>
          <div className="flex justify-between gap-3 font-semibold"><dt>Send to doctor</dt><dd className="tabular-nums">{formatPeso(p.net_amount)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#45546a]">Still available after this</dt><dd className="tabular-nums">{formatPeso(available)}</dd></div>
        </dl>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-[#45546a]">Bank</dt><dd className="text-right">{p.bank_name} <span className="text-[#5f6a7c]">({p.provider === 'pesonet' ? 'PESONet' : 'InstaPay'})</span></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#45546a]">Account name</dt><dd className="text-right">{p.account_name}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#45546a]">Account number</dt>
            <dd className="flex items-center gap-2 tabular-nums">{p.account_number}
              <button type="button" aria-label="Copy account number" onClick={() => copy(p.account_number)} className="rounded-full p-1 hover:bg-[#ece7de]"><Copy className="h-3.5 w-3.5" /></button></dd></div>
          <div className={cn('rounded-[12px] px-3 py-2 text-xs', p.name_matches ? 'bg-[#f9f8f3] text-[#152839]' : 'bg-[#fbe9e1] text-[#7a2406]')}>
            {p.name_matches ? 'Account name matches the verified doctor.' : `Account name does not match the verified name “${p.doctor_name}”. Check before sending.`}
          </div>
        </dl>
      </div>
      {p.failure_reason && <p className="rounded-[12px] bg-[#fbe9e1] px-3 py-2 text-sm text-[#7a2406]">{p.failure_reason}</p>}

      {mode ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'reject') reject.mutate({ id: p.id, note: text });
          else resolve.mutate({ id: p.id, sent: mode === 'manual', reference: text, note: mode === 'failed' ? text : 'Sent outside the system' });
        }}>
          <Input wrapperClassName="min-w-[260px] flex-1" value={text} onChange={(e) => setText(e.target.value)}
            label={mode === 'reject' ? 'Reason the doctor will see' : mode === 'manual' ? 'Transfer reference number' : 'What happened'} required />
          <Button type="submit" variant={mode === 'manual' ? 'primary' : 'danger'} loading={reject.isPending || resolve.isPending}>
            {mode === 'reject' ? 'Reject payout' : mode === 'manual' ? 'Mark as sent' : 'Mark as failed'}
          </Button>
          <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          {p.status === 'requested' && (
            <>
              <Button variant="accent" loading={send.isPending} onClick={() => send.mutate()}>Send {formatPeso(p.net_amount)} now</Button>
              <Button variant="secondary" onClick={() => { setMode('manual'); setText(''); }}>I sent it by hand</Button>
              <Button variant="ghost" onClick={() => { setMode('reject'); setText(''); }}>Reject</Button>
            </>
          )}
          {['sending', 'processing'].includes(p.status) && (
            <>
              <p className="w-full text-sm text-[#45546a]">
                {p.status === 'processing' ? 'PayMongo accepted the transfer. It finishes by itself when PayMongo confirms it.' : 'Waiting for PayMongo’s answer.'}
                {' '}Only mark it yourself after checking the transfer in the PayMongo dashboard.
              </p>
              <Button variant="secondary" onClick={() => { setMode('manual'); setText(p.transfer_id ?? ''); }}>Mark as sent</Button>
              <Button variant="ghost" onClick={() => { setMode('failed'); setText(''); }}>Mark as failed</Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Payouts() {
  const [filter, setFilter] = useState('open');
  const q = useQuery({ queryKey: [...KEY, 'payouts', filter], queryFn: () => fetchAdminPayouts(filter), refetchInterval: 30_000 });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[#45546a]">Check the account name, then send. The transfer fee comes out of the amount, so the doctor receives the “send” figure.</p>
        <Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)} wrapperClassName="w-48">
          <option value="open">To do</option>
          <option value="all">All, past year</option>
        </Select>
      </div>
      {q.isLoading ? <Loading /> : q.isError ? <LoadError q={q} what="payouts" /> : !q.data.length ? (
        <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">{filter === 'open' ? 'No payouts waiting.' : 'No payouts yet.'}</p>
      ) : filter === 'open' ? (
        <ul className="space-y-4">{q.data.map((p) => <PayoutCard key={p.id} p={p} />)}</ul>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border border-[#dce1e8] bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#f9f8f3] text-left text-[#45546a]"><tr>
              <th className="px-4 py-3 font-medium">Asked</th><th className="px-4 py-3 font-medium">Doctor</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 text-right font-medium">Fee</th>
              <th className="px-4 py-3 text-right font-medium">Sent</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Reference</th>
            </tr></thead>
            <tbody>{q.data.map((p) => (
              <tr key={p.id} className="border-t border-[#dce1e8] text-[#152839]">
                <td className="px-4 py-3">{formatDateTime(p.created_at)}</td><td className="px-4 py-3">{p.doctor_name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPeso(p.amount)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPeso(p.fee)}{p.actual_fee != null && Number(p.actual_fee) !== Number(p.fee) ? <span className="block text-xs text-[#5f6a7c]">PayMongo {formatPeso(p.actual_fee)}</span> : null}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPeso(p.net_amount)}</td>
                <td className="px-4 py-3">{p.status}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.provider_reference || p.manual_reference || p.transfer_id || ''}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
function RefundModal({ payment, onClose }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('requested_by_customer');
  const [notes, setNotes] = useState('');
  const held = payment?.status === 'needs_review';
  const amount = payment ? (held ? payment.paid_amount : payment.price) : 0;
  const go = useMutation({
    mutationFn: () => paymongoOps({ action: 'refund', payment_id: payment.id, reason, notes }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success(r?.transfer_link ? 'Refund created. Send the claim link to the patient.' : 'Refund sent to PayMongo');
      onClose();
    },
    onError: (e) => { qc.invalidateQueries({ queryKey: KEY }); toast.error(e.message); },
  });
  return (
    <Modal open={Boolean(payment)} onClose={onClose} title="Refund this payment" description={payment ? `${payment.doctor_name} · ${METHOD[payment.method]} · paid ${formatPeso(payment.paid_amount ?? payment.total)}` : ''}>
      {payment && (
        <div className="space-y-4">
          <div className="rounded-[16px] bg-[#f9f8f3] p-4 text-sm text-[#152839]">
            <p className="font-semibold">Refund {formatPeso(amount)}</p>
            <p className="mt-1 text-[#45546a]">
              {held
                ? 'This money was held aside, so all of it goes back.'
                : payment.kind === 'rx'
                  ? `Fees are not refunded. The patient gets the ${formatPeso(payment.price)} prescription fee back, and it comes off ${payment.doctor_name}’s balance.`
                  : 'The doctor gets back what they paid. Remember to undo the plan, seats or prescriptions they received.'}
            </p>
            {payment.method === 'qrph' && <p className="mt-2 text-[#45546a]">QR Ph refunds give you a claim link to send to the payer. It works for 3 days.</p>}
          </div>
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="requested_by_customer">Requested by the payer</option>
            <option value="duplicate">Paid twice</option>
            <option value="fraudulent">Fraud</option>
            <option value="others">Other</option>
          </Select>
          <Input label="Note (kept in PayMongo)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
          <Button variant="danger" className="w-full" loading={go.isPending} onClick={() => go.mutate()}>Refund {formatPeso(amount)}</Button>
        </div>
      )}
    </Modal>
  );
}

function Payments() {
  const [filter, setFilter] = useState('all');
  const [refund, setRefund] = useState(null);
  const q = useQuery({ queryKey: [...KEY, 'payments', filter], queryFn: () => fetchGatewayPayments(filter), refetchInterval: 60_000 });
  const exportCsv = () => downloadCsv(`odyssey-online-payments-${new Date().toISOString().slice(0, 10)}.csv`, [
    { label: 'Paid', value: (p) => (p.paid_at ? formatDateTime(p.paid_at) : '') },
    { label: 'Kind', value: (p) => (p.kind === 'rx' ? 'Prescription' : 'Plan, seats or pack') },
    { label: 'Doctor', value: (p) => p.doctor_name },
    { label: 'Prescription', value: (p) => p.prescription_id ?? '' },
    { label: 'Method', value: (p) => METHOD[p.method] },
    { label: 'Fee paid by', value: (p) => ({ pass: 'Patient', absorb: 'Doctor', odyssey: 'ODYSSEY' })[p.fee_mode] },
    { label: 'Price', value: (p) => money(p.price) },
    { label: 'ODYSSEY fee', value: (p) => money(p.fee) },
    { label: 'Payer paid', value: (p) => money(p.paid_amount ?? p.total) },
    { label: 'PayMongo charge', value: (p) => money(p.paymongo_cost) },
    { label: 'ODYSSEY keeps', value: (p) => money((p.kind === 'rx' ? Number(p.fee) : Number(p.price)) - Number(p.paymongo_cost)) },
    { label: 'Doctor share', value: (p) => money(p.doctor_share) },
    { label: 'Status', value: (p) => p.status },
    { label: 'Refund', value: (p) => (p.refund ? `${money(p.refund.amount)} ${p.refund.status}` : '') },
    { label: 'PayMongo payment', value: (p) => p.paymongo_payment_id ?? '' },
  ], q.data ?? []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)} wrapperClassName="w-56">
          <option value="all">All paid</option>
          <option value="needs_review">Held aside</option>
          <option value="refunded">Refunds</option>
          <option value="open">Checkouts not paid</option>
        </Select>
        <Button variant="secondary" disabled={!q.data?.length} onClick={exportCsv}>Download CSV</Button>
      </div>
      {q.isLoading ? <Loading /> : q.isError ? <LoadError q={q} what="payments" /> : !q.data.length ? (
        <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border border-[#dce1e8] bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[#f9f8f3] text-left text-[#45546a]"><tr>
              <th className="px-4 py-3 font-medium">Paid</th><th className="px-4 py-3 font-medium">For</th>
              <th className="px-4 py-3 text-right font-medium">Price</th><th className="px-4 py-3 text-right font-medium">ODYSSEY fee</th>
              <th className="px-4 py-3 text-right font-medium">Payer paid</th><th className="px-4 py-3 text-right font-medium">PayMongo</th>
              <th className="px-4 py-3 text-right font-medium">ODYSSEY keeps</th><th className="px-4 py-3 text-right font-medium">Doctor share</th>
              <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>{q.data.map((p) => {
              const keeps = (p.kind === 'rx' ? Number(p.fee) : Number(p.price)) - Number(p.paymongo_cost);
              const canRefund = ['paid', 'needs_review'].includes(p.status) && p.paymongo_payment_id && (!p.refund || p.refund.status === 'failed');
              return (
                <tr key={p.id} className="border-t border-[#dce1e8] align-top text-[#152839]">
                  <td className="px-4 py-3">{formatDateTime(p.paid_at ?? p.created_at)}<span className="block text-xs text-[#5f6a7c]">{METHOD[p.method]}{p.livemode === false ? ' · test' : ''}</span></td>
                  <td className="px-4 py-3">{p.doctor_name}<span className="block text-xs text-[#5f6a7c]">{p.kind === 'rx' ? `Prescription ${p.prescription_id}` : 'Plan, seats or pack'}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(p.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.kind === 'rx' ? formatPeso(p.fee) : '—'}<span className="block text-xs text-[#5f6a7c]">{({ pass: 'patient paid', absorb: 'doctor paid', odyssey: 'ODYSSEY covers' })[p.fee_mode]}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(p.paid_amount ?? p.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">−{formatPeso(p.paymongo_cost)}{p.cost_is_estimate && <span className="block text-xs text-[#5f6a7c]">estimate</span>}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{p.status === 'needs_review' ? '—' : formatPeso(keeps)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.kind === 'rx' ? formatPeso(p.doctor_share) : '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {p.status === 'needs_review' ? <span className="text-[#7a2406]">{p.review_note}</span> : p.status}
                    {p.refund && (
                      <span className="mt-1 block">
                        Refund {formatPeso(p.refund.amount)}: {p.refund.status}
                        {p.refund.transfer_link && p.refund.status !== 'succeeded' && (
                          <button type="button" onClick={() => copy(p.refund.transfer_link)} className="ml-1 font-semibold text-[#b8470a] underline">Copy claim link</button>
                        )}
                        {p.refund.failure_reason && <span className="block text-[#7a2406]">{p.refund.failure_reason}</span>}
                      </span>
                    )}
                    {p.available_at && p.kind === 'rx' && p.status === 'paid' && new Date(p.available_at) > new Date() && <span className="block text-[#5f6a7c]">On hold until {formatDate(p.available_at)}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{canRefund && <Button size="sm" variant="ghost" onClick={() => setRefund(p)}>Refund</Button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <RefundModal payment={refund} onClose={() => setRefund(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
function DoctorBalances() {
  const q = useQuery({ queryKey: [...KEY, 'balances'], queryFn: fetchDoctorBalances });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <LoadError q={q} what="doctor balances" />;
  if (!q.data.length) return <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">No doctor has turned on online payments yet.</p>;
  return (
    <div className="overflow-x-auto rounded-[20px] border border-[#dce1e8] bg-white">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-[#f9f8f3] text-left text-[#45546a]"><tr>
          <th className="px-4 py-3 font-medium">Doctor</th><th className="px-4 py-3 font-medium">Fee paid by</th>
          <th className="px-4 py-3 text-right font-medium">Earned</th><th className="px-4 py-3 text-right font-medium">On hold</th>
          <th className="px-4 py-3 text-right font-medium">Available</th><th className="px-4 py-3 text-right font-medium">In payout</th>
          <th className="px-4 py-3 text-right font-medium">Paid out</th><th className="px-4 py-3 text-right font-medium">Refunded</th>
        </tr></thead>
        <tbody>{q.data.map((d) => (
          <tr key={d.doctor_id} className="border-t border-[#dce1e8] text-[#152839]">
            <td className="px-4 py-3">{d.doctor_name}<span className="block text-xs text-[#5f6a7c]">{d.email}{d.online_enabled ? '' : ' · online payments off'}</span></td>
            <td className="px-4 py-3">{d.fee_mode === 'absorb' ? 'Doctor' : 'Patient'}</td>
            {['earned', 'on_hold', 'available', 'requested', 'paid_out', 'refunded'].map((k) => (
              <td key={k} className={cn('px-4 py-3 text-right tabular-nums', k === 'available' && Number(d.balance[k]) < 0 && 'text-[#7a2406]')}>{formatPeso(d.balance[k])}</td>
            ))}
          </tr>))}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
function RateRow({ r }) {
  const qc = useQueryClient();
  const [v, setV] = useState(r);
  useEffect(() => setV(r), [r]);
  const save = useMutation({ mutationFn: saveFeeRate, onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ['gateway-config'] }); toast.success(`${r.label} saved`); }, onError: (e) => toast.error(e.message) });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const fee = feeFor(v, 500);
  const cost = Math.round((500 * Number(v.cost_pct) / 100 + Number(v.cost_fixed)) * 100) / 100;
  const keep = fee - Math.round(((500 + fee) * Number(v.cost_pct) / 100 + Number(v.cost_fixed)) * 100) / 100;
  const keepAbsorb = fee - cost;
  const num = 'w-20 rounded-[10px] border border-[#dce1e8] px-2 py-1.5 text-right tabular-nums';
  return (
    <tr className="border-t border-[#dce1e8] align-top text-[#152839]">
      <td className="px-3 py-3">
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={v.is_enabled} onChange={set('is_enabled')} className="h-4 w-4 accent-[#152839]" />{r.label}</label>
        <span className="mt-1 block text-xs text-[#5f6a7c]">Shown: {rateText(v)}</span>
      </td>
      <td className="px-3 py-3"><input aria-label={`${r.label} fee percent`} className={num} type="number" step="0.001" value={v.fee_pct} onChange={set('fee_pct')} /> %</td>
      <td className="px-3 py-3">₱ <input aria-label={`${r.label} fee fixed`} className={num} type="number" step="0.01" value={v.fee_fixed} onChange={set('fee_fixed')} /></td>
      <td className="px-3 py-3">₱ <input aria-label={`${r.label} fee minimum`} className={num} type="number" step="0.01" value={v.fee_min} onChange={set('fee_min')} /></td>
      <td className="px-3 py-3"><input aria-label={`${r.label} PayMongo percent`} className={num} type="number" step="0.001" value={v.cost_pct} onChange={set('cost_pct')} /> % + ₱ <input aria-label={`${r.label} PayMongo fixed`} className={num} type="number" step="0.01" value={v.cost_fixed} onChange={set('cost_fixed')} /></td>
      <td className="px-3 py-3 text-right tabular-nums">
        {formatPeso(fee)}
        <span className={cn('block text-xs', keep < 0 || keepAbsorb < 0 ? 'text-[#7a2406]' : 'text-[#5f6a7c]')}>keeps {formatPeso(keep)} / {formatPeso(keepAbsorb)}</span>
      </td>
      <td className="px-3 py-3 text-right"><Button size="sm" variant="secondary" loading={save.isPending} onClick={() => save.mutate(v)}>Save</Button></td>
    </tr>
  );
}

function FeesAndRules() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...KEY, 'config'], queryFn: fetchGatewayAdminConfig });
  const [s, setS] = useState(null);
  useEffect(() => { if (q.data) setS(q.data.settings); }, [q.data]);
  const save = useMutation({ mutationFn: saveGatewaySettings, onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ['gateway-config'] }); toast.success('Rules saved'); }, onError: (e) => toast.error(e.message) });
  if (q.isLoading || !s) return q.isError ? <LoadError q={q} what="the settings" /> : <Loading />;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#152839]">Fees by payment method</h2>
        <p className="max-w-3xl text-sm text-[#45546a]">
          ODYSSEY’s fee is what doctors and patients see, with PayMongo’s charge inside it. Keep PayMongo’s column in line with
          your PayMongo pricing, VAT included. Each payment keeps the rates it was made with. The last column shows ODYSSEY’s fee on a
          ₱500 prescription, and what ODYSSEY keeps when the patient pays the fee or the doctor covers it.
        </p>
        <div className="overflow-x-auto rounded-[20px] border border-[#dce1e8] bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-[#f9f8f3] text-left text-[#45546a]"><tr>
              <th className="px-3 py-3 font-medium">Method (on)</th><th className="px-3 py-3 font-medium">ODYSSEY %</th>
              <th className="px-3 py-3 font-medium">Plus fixed</th><th className="px-3 py-3 font-medium">Minimum</th>
              <th className="px-3 py-3 font-medium">PayMongo charge</th><th className="px-3 py-3 text-right font-medium">On ₱500</th><th className="px-3 py-3" />
            </tr></thead>
            <tbody>{q.data.rates.map((r) => <RateRow key={r.method} r={r} />)}</tbody>
          </table>
        </div>
        <p className="text-sm text-[#45546a]">Switch a method on only after PayMongo has activated it on your account.</p>
      </section>

      <form className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-6" onSubmit={(e) => { e.preventDefault(); save.mutate(s); }}>
        <h2 className="font-display text-lg font-semibold text-[#152839]">Rules</h2>
        <label className="flex gap-3 text-sm text-[#152839]"><input type="checkbox" checked={s.enabled} onChange={set('enabled')} className="mt-0.5 h-4 w-4 accent-[#152839]" />
          <span><strong>Online payments on.</strong> Turning this off stops new checkouts. Payments already made and payouts still work.</span></label>
        <label className="flex gap-3 text-sm text-[#152839]"><input type="checkbox" checked={s.manual_fallback} onChange={set('manual_fallback')} className="mt-0.5 h-4 w-4 accent-[#152839]" />
          <span><strong>Also allow QR and receipt.</strong> For when PayMongo is down. Receipts then need checking by hand again.</span></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Hold period (days)" type="number" min={0} max={60} value={s.hold_days} onChange={set('hold_days')} hint="Covers settlement and card disputes" />
          <Input label="Smallest payout (₱)" type="number" min={1} step="0.01" value={s.min_payout} onChange={set('min_payout')} />
          <Input label="Transfer fee charged to doctors (₱)" type="number" min={0} step="0.01" value={s.payout_fee} onChange={set('payout_fee')} hint="PayMongo’s ₱10 plus VAT" />
        </div>
        <Button type="submit" loading={save.isPending}>Save rules</Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
const CATEGORIES = {
  hosting: 'Hosting and servers', software: 'Software and subscriptions', marketing: 'Marketing', staff: 'Staff and contractors',
  office: 'Office and supplies', transport: 'Transport', professional_fees: 'Accountant and legal', bank_fees: 'Bank and transfer fees', other: 'Other',
};

function Expenses({ year }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...KEY, 'expenses', year], queryFn: () => fetchExpenses(year) });
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ spentOn: today, category: 'hosting', description: '', amount: '', file: null });
  const add = useMutation({ mutationFn: addExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); setF({ ...f, description: '', amount: '', file: null }); toast.success('Expense added'); }, onError: (e) => toast.error(e.message) });
  const del = useMutation({ mutationFn: deleteExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Expense removed'); }, onError: (e) => toast.error(e.message) });
  const open = async (path) => { try { window.open(await expenseReceiptUrl(path), '_blank', 'noopener'); } catch { toast.error('Could not open the receipt'); } };

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-[#152839]">Business expenses</h2>
      <p className="max-w-3xl text-sm text-[#45546a]">
        Record what ODYSSEY spends to run the business and attach the official receipt. PayMongo’s charges are already counted
        from the ledger, so do not add them here.
      </p>
      <form className="grid gap-3 rounded-[20px] border border-[#dce1e8] bg-white p-5 md:grid-cols-6" onSubmit={(e) => { e.preventDefault(); add.mutate(f); }}>
        <Input label="Date" type="date" required value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} wrapperClassName="md:col-span-1" />
        <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} wrapperClassName="md:col-span-1">
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input label="What" required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} wrapperClassName="md:col-span-2" placeholder="Supabase Pro, October" />
        <Input label="Amount (₱)" type="number" step="0.01" min="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} wrapperClassName="md:col-span-1" />
        <div className="md:col-span-1">
          <label htmlFor="exp-file" className="mb-1.5 block text-sm font-medium text-[#152839]">Receipt</label>
          <input id="exp-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setF({ ...f, file: e.target.files?.[0] ?? null })} className="block w-full text-sm" />
        </div>
        <div className="md:col-span-6"><Button type="submit" loading={add.isPending}>Add expense</Button></div>
      </form>
      {q.isLoading ? <Loading /> : q.isError ? <LoadError q={q} what="expenses" /> : !q.data.length ? (
        <p className="text-sm text-[#5f6a7c]">No expenses recorded for {year}.</p>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border border-[#dce1e8] bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f9f8f3] text-left text-[#45546a]"><tr>
              <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">What</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3" />
            </tr></thead>
            <tbody>{q.data.map((e) => (
              <tr key={e.id} className="border-t border-[#dce1e8] text-[#152839]">
                <td className="px-4 py-3">{formatDate(e.spent_on)}</td><td className="px-4 py-3">{CATEGORIES[e.category]}</td>
                <td className="px-4 py-3">{e.description}{e.receipt_path && <button type="button" onClick={() => open(e.receipt_path)} className="ml-2 text-xs font-semibold text-[#b8470a] underline">Receipt</button>}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPeso(e.amount)}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" loading={del.isPending && del.variables?.id === e.id} onClick={() => del.mutate(e)}>Remove</Button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Taxes() {
  const thisYear = Number(new Intl.DateTimeFormat('en-PH', { year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date()));
  const [year, setYear] = useState(thisYear);
  const q = useQuery({ queryKey: [...KEY, 'tax', year], queryFn: () => fetchTaxSummary(year) });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <LoadError q={q} what="the tax summary" />;

  const qs = q.data.quarters.map((x) => {
    const gross = Number(x.rx_fees) + Number(x.sales);
    const costs = Number(x.paymongo_cost) - Number(x.payout_fee_diff) + Number(x.expenses);
    return { ...x, gross, costs, profit: gross - costs };
  });
  const tot = qs.reduce((a, x) => ({ gross: a.gross + x.gross, costs: a.costs + x.costs, fees: a.fees + Number(x.rx_fees), sales: a.sales + Number(x.sales) }), { gross: 0, costs: 0, fees: 0, sales: 0 });
  const est = taxOptions({ gross: tot.gross, expenses: tot.costs });
  const bar = (v, max) => `${Math.min(100, (v / max) * 100)}%`;

  const exportCsv = () => downloadCsv(`odyssey-gross-receipts-${year}.csv`, [
    { label: 'Quarter', value: (x) => `Q${x.quarter} ${year}` },
    { label: 'ODYSSEY fees on prescriptions', value: (x) => money(x.rx_fees) },
    { label: 'Plans, seats and packs', value: (x) => money(x.sales) },
    { label: 'Gross receipts', value: (x) => money(x.gross) },
    { label: 'PayMongo charges', value: (x) => money(x.paymongo_cost) },
    { label: 'Other expenses', value: (x) => money(x.expenses) },
    { label: 'Profit before tax', value: (x) => money(x.profit) },
  ], qs);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Select label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} wrapperClassName="w-36">
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Button variant="secondary" onClick={exportCsv}>Download for your accountant (CSV)</Button>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#152839]">Gross receipts</h2>
        <p className="max-w-3xl text-sm text-[#45546a]">
          ODYSSEY’s own income only: its fees on prescription payments and what doctors pay for plans, seats and packs.
          Doctors’ shares pass through to them and are not included.
        </p>
        <div className="overflow-x-auto rounded-[20px] border border-[#dce1e8] bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[#f9f8f3] text-left text-[#45546a]"><tr>
              <th className="px-4 py-3 font-medium">Quarter</th><th className="px-4 py-3 text-right font-medium">ODYSSEY fees</th>
              <th className="px-4 py-3 text-right font-medium">Plans and packs</th><th className="px-4 py-3 text-right font-medium">Gross receipts</th>
              <th className="px-4 py-3 text-right font-medium">PayMongo</th><th className="px-4 py-3 text-right font-medium">Other expenses</th>
              <th className="px-4 py-3 text-right font-medium">Profit</th>
            </tr></thead>
            <tbody>
              {qs.map((x) => (
                <tr key={x.quarter} className="border-t border-[#dce1e8] text-[#152839]">
                  <td className="px-4 py-3">Q{x.quarter}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(x.rx_fees)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(x.sales)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPeso(x.gross)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(x.paymongo_cost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(x.expenses)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(x.profit)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[#152839] font-semibold text-[#152839]">
                <td className="px-4 py-3">{year}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPeso(tot.fees)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPeso(tot.sales)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPeso(tot.gross)}</td>
                <td className="px-4 py-3 text-right tabular-nums" colSpan={2}>{formatPeso(tot.costs)} costs</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPeso(tot.gross - tot.costs)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#152839]">Thresholds</h2>
        {[
          ['₱250,000 tax-free amount', EXEMPT, '8% applies to gross receipts above this.'],
          ['₱3,000,000 limit for the 8% option', EIGHT_PCT_LIMIT, 'Above this the 8% option ends and VAT registration is required.'],
        ].map(([label, max, note]) => (
          <div key={label} className="space-y-1.5">
            <div className="flex justify-between gap-3 text-sm"><span className="font-medium text-[#152839]">{label}</span><span className="tabular-nums text-[#45546a]">{formatPeso(tot.gross)} of {formatPeso(max)}</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#ece7de]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={tot.gross}>
              <div className={cn('h-full rounded-full', tot.gross >= max * 0.8 && max === EIGHT_PCT_LIMIT ? 'bg-[#b8470a]' : 'bg-[#152839]')} style={{ width: bar(tot.gross, max) }} />
            </div>
            <p className="text-xs text-[#5f6a7c]">{note}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#152839]">Estimated income tax for {year}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {est.options.map((o) => (
            <div key={o.key} className={cn('rounded-[20px] p-5', o.key === est.cheapest ? 'bg-[#152839] text-[#f9f8f3]' : 'border border-[#dce1e8] bg-white text-[#152839]', !o.available && 'opacity-60')}>
              <p className="text-sm font-semibold">{o.label}{o.key === est.cheapest ? ' · lowest' : ''}</p>
              <p className="mt-1 font-display text-[24px] font-bold tabular-nums">{o.available ? formatPeso(o.tax) : 'Not available'}</p>
              <p className={cn('mt-1 text-xs', o.key === est.cheapest ? 'text-[#f9f8f3]/80' : 'text-[#5f6a7c]')}>{o.how}</p>
            </div>
          ))}
        </div>
        <p className="max-w-3xl text-xs text-[#5f6a7c]">
          An estimate from this year’s figures so far, using 2023 income tax rates. You choose the option with your first quarterly
          return of the year and keep it until the next year. Confirm with your accountant before filing, including whether PayMongo’s
          charges on fees paid by patients count as your income.
        </p>
      </section>

      <Expenses year={year} />
    </div>
  );
}

export default function AdminMoney() {
  const [tab, setTab] = useState('overview');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Money and payouts</h1>
        <p className="mt-1 text-sm text-[#45546a]">Every online payment, what ODYSSEY keeps, what doctors are owed, and the tax picture.</p>
      </div>
      <div role="tablist" aria-label="Money and payouts" className="flex flex-wrap items-center gap-1.5 rounded-[22px] border border-[#dce1e8] bg-white p-1 sm:w-fit sm:rounded-full">
        {TABS.map((t) => (
          <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('inline-flex min-h-[38px] items-center gap-2 rounded-full px-4 text-xs font-semibold transition',
              tab === t.key ? 'bg-[#152839] text-[#f9f8f3]' : 'text-[#45546a] hover:bg-[#ece7de]')}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'overview' && <Overview />}
        {tab === 'payouts' && <Payouts />}
        {tab === 'payments' && <Payments />}
        {tab === 'doctors' && <DoctorBalances />}
        {tab === 'fees' && <FeesAndRules />}
        {tab === 'taxes' && <Taxes />}
      </div>
    </div>
  );
}
