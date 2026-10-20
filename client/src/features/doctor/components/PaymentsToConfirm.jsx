import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { formatDateTime, formatPeso } from '../../../lib/utils';
import { confirmPaymentProof, fetchPendingPaymentProofs, getPaymentProofUrl, rejectPaymentProof } from '../api';

const REASONS = [
  'No payment with this reference number in my account',
  'The amount paid is different from the fee',
  'The screenshot is unreadable',
];

function Receipt({ path }) {
  const url = useQuery({ queryKey: ['proof-url', path], queryFn: () => getPaymentProofUrl(path), staleTime: 4 * 60_000 });
  if (url.isLoading) return <div className="h-40 w-28 animate-pulse rounded-[14px] bg-[#ece7de]" aria-label="Loading receipt" />;
  if (url.isError) return <p className="text-sm text-[#7a2406]">Could not load the receipt.</p>;
  return (
    <a href={url.data} target="_blank" rel="noreferrer" className="block shrink-0" aria-label="Open the receipt full size">
      <img src={url.data} alt="Patient’s payment receipt" className="h-40 w-28 rounded-[14px] object-cover ring-1 ring-[#dce1e8]" />
    </a>
  );
}

function ProofCard({ proof }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const fee = proof.prescription?.amount;
  const amountMatches = proof.amount_read != null && Number(proof.amount_read) === Number(fee);

  const done = (msg) => {
    qc.invalidateQueries({ queryKey: ['doctor', 'payment-proofs'] });
    qc.invalidateQueries({ queryKey: ['doctor', 'prescriptions'] });
    toast.success(msg);
  };
  const confirm = useMutation({ mutationFn: () => confirmPaymentProof(proof.id), onSuccess: () => done('Payment confirmed. The prescription is now open for your patient.'), onError: (e) => toast.error(e?.message || 'Could not confirm.') });
  const reject = useMutation({ mutationFn: () => rejectPaymentProof(proof.id, reason), onSuccess: () => done('Receipt rejected. Your patient will see the reason.'), onError: (e) => toast.error(e?.message || 'Could not reject.') });

  return (
    <li className="flex flex-col gap-4 rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:flex-row">
      <Receipt path={proof.screenshot_path} />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="font-display text-lg font-semibold text-[#152839]">{proof.prescription?.patient_name}</p>
          <p className="text-sm text-[#45546a]">Sent {formatDateTime(proof.created_at)}{proof.provider ? ` · paid by ${proof.provider}` : ''}</p>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-[15px] sm:grid-cols-2">
          <div><dt className="text-sm text-[#45546a]">Reference number</dt><dd className="font-semibold tabular-nums text-[#152839]">{proof.reference_no}</dd></div>
          <div><dt className="text-sm text-[#45546a]">Fee</dt><dd className="font-semibold tabular-nums text-[#152839]">{formatPeso(fee)}</dd></div>
        </dl>
        {proof.amount_read != null && (
          <p className={`text-sm ${amountMatches ? 'text-[#45546a]' : 'text-[#7a2406]'}`}>
            {amountMatches ? `The receipt shows ${formatPeso(proof.amount_read)}.` : `The receipt seems to show ${formatPeso(proof.amount_read)}, not ${formatPeso(fee)}. Check it in your app.`}
          </p>
        )}
        <p className="text-sm text-[#45546a]">Before confirming, find this reference number in your {proof.provider ?? 'e-wallet or bank'} app. A screenshot alone is not proof.</p>

        {rejecting ? (
          <div className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-[#152839]">Reason shown to your patient</legend>
              {REASONS.map((r) => (
                <label key={r} className="flex items-start gap-2 text-[15px] text-[#152839]">
                  <input type="radio" name={`reason-${proof.id}`} className="mt-1 accent-[#152839]" checked={reason === r} onChange={() => setReason(r)} />
                  {r}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
              <Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate()}>Reject receipt</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={confirm.isPending} onClick={() => confirm.mutate()}>Payment received</Button>
            <Button variant="secondary" onClick={() => setRejecting(true)}>Not received</Button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Receipts patients sent that wait for this doctor's confirmation. Hidden when there are none. */
export function PaymentsToConfirm() {
  const { data, isError, refetch } = useQuery({
    queryKey: ['doctor', 'payment-proofs'],
    queryFn: fetchPendingPaymentProofs,
    refetchInterval: 20_000,
  });
  if (isError) {
    return (
      <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
        Could not load payments to confirm. <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
      </div>
    );
  }
  if (!data?.length) return null;
  return (
    <section aria-labelledby="ptc-h" className="space-y-4">
      <div>
        <h2 id="ptc-h" className="font-display text-xl font-semibold text-[#152839]">
          Payments to confirm <span className="tabular-nums text-[#45546a]">({data.length})</span>
        </h2>
        <p className="text-sm text-[#45546a]">Your patients are waiting. Their prescription opens as soon as you confirm.</p>
      </div>
      <ul className="space-y-3">{data.map((p) => <ProofCard key={p.id} proof={p} />)}</ul>
    </section>
  );
}
