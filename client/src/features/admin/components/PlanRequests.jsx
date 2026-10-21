import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { cn, formatDateTime, formatPeso } from '../../../lib/utils';
import { fetchPlanRequests, getPlanProofUrl, reviewPlanRequest } from '../api';

const REASONS = [
  'No payment with this reference number in our account',
  'The amount paid is different from the plan price',
  'The screenshot is unreadable',
];
const STATUS_TEXT = { approved: 'Approved', rejected: 'Not approved', cancelled: 'Withdrawn by doctor' };

function Receipt({ path }) {
  const url = useQuery({ queryKey: ['plan-proof-url', path], queryFn: () => getPlanProofUrl(path), staleTime: 4 * 60_000 });
  if (url.isLoading) return <div className="h-40 w-28 shrink-0 animate-pulse rounded-[14px] bg-[#ece7de]" aria-label="Loading receipt" />;
  if (url.isError) return <p className="w-28 shrink-0 text-sm text-[#7a2406]">Could not load the receipt.</p>;
  return (
    <a href={url.data} target="_blank" rel="noreferrer" className="block shrink-0" aria-label="Open the receipt full size">
      <img src={url.data} alt="Doctor’s payment receipt" className="h-40 w-28 rounded-[14px] object-cover ring-1 ring-[#dce1e8]" />
    </a>
  );
}

function RequestCard({ req, planName }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const isPending = req.status === 'pending';
  const amountMatches = req.amount_read != null && Number(req.amount_read) === Number(req.amount);

  const review = useMutation({
    mutationFn: reviewPlanRequest,
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['admin', 'plan-requests'] });
      qc.invalidateQueries({ queryKey: ['admin', 'doctor-plans'] });
      qc.invalidateQueries({ queryKey: ['admin', 'clinics'] });
      toast.success(v.approve
        ? (req.kind === 'extra_seats' ? `Seats added for ${req.doctor?.full_name}’s clinic` : `${planName} plan started for ${req.doctor?.full_name}`)
        : 'Payment rejected. The doctor sees the reason.');
    },
    onError: (e) => toast.error(e?.message || 'Action failed. Please try again.'),
  });

  return (
    <li className="flex flex-col gap-4 rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:flex-row">
      <Receipt path={req.screenshot_path} />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-display text-lg font-semibold text-[#152839]">{req.doctor?.full_name}</p>
            <p className="text-sm text-[#45546a]">{req.doctor?.email} · Sent {formatDateTime(req.created_at)}{req.provider ? ` · paid by ${req.provider}` : ''}</p>
          </div>
          {!isPending && <span className="text-sm font-medium text-[#45546a]">{STATUS_TEXT[req.status]}</span>}
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-[15px] sm:grid-cols-3">
          <div>
            <dt className="text-sm text-[#45546a]">{req.kind === 'extra_seats' ? 'For' : 'Plan'}</dt>
            <dd className="font-semibold text-[#152839]">
              {req.kind === 'extra_seats'
                ? `${req.seats} extra doctor seat${req.seats === 1 ? '' : 's'}`
                : `${planName}, ${req.billing_period === 'yearly' ? '1 year' : '1 month'}${req.seats ? ` + ${req.seats} extra doctor${req.seats === 1 ? '' : 's'}` : ''}`}
            </dd>
          </div>
          <div><dt className="text-sm text-[#45546a]">Price</dt><dd className="font-semibold tabular-nums text-[#152839]">{formatPeso(req.amount)}</dd></div>
          <div><dt className="text-sm text-[#45546a]">Reference number</dt><dd className="font-semibold tabular-nums text-[#152839]">{req.reference_no}</dd></div>
        </dl>
        {req.amount_read != null && (
          <p className={cn('text-sm', amountMatches ? 'text-[#45546a]' : 'text-[#7a2406]')}>
            {amountMatches ? `The receipt shows ${formatPeso(req.amount_read)}.` : `The receipt seems to show ${formatPeso(req.amount_read)}, not ${formatPeso(req.amount)}. Check it in the account.`}
          </p>
        )}
        {req.review_note && !isPending && <p className="text-sm text-[#45546a]">Note: {req.review_note}</p>}

        {isPending && (rejecting ? (
          <div className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-[#152839]">Reason shown to the doctor</legend>
              {REASONS.map((r) => (
                <label key={r} className="flex items-start gap-2 text-[15px] text-[#152839]">
                  <input type="radio" name={`reason-${req.id}`} className="mt-1 accent-[#152839]" checked={reason === r} onChange={() => setReason(r)} />
                  {r}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
              <Button variant="danger" loading={review.isPending} onClick={() => review.mutate({ id: req.id, approve: false, note: reason })}>Reject payment</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-[#45546a]">Find this reference number in the {req.provider ?? 'ODYSSEY'} account before approving. A screenshot alone is not proof.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={review.isPending} onClick={() => review.mutate({ id: req.id, approve: true })}>{req.kind === 'extra_seats' ? 'Payment received, add seats' : 'Payment received, start plan'}</Button>
              <Button variant="secondary" onClick={() => setRejecting(true)}>Not received</Button>
            </div>
          </>
        ))}
      </div>
    </li>
  );
}

/** Plan payments doctors sent to ODYSSEY's QR, for an admin to check and approve. */
export function PlanRequests({ plans }) {
  const [view, setView] = useState('pending');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'plan-requests', view],
    queryFn: () => fetchPlanRequests(view),
    refetchInterval: 30_000,
  });
  const nameOf = (id) => plans.find((p) => p.id === id)?.name ?? id;

  return (
    <section aria-labelledby="pr-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pr-h" className="font-display text-xl font-semibold text-[#152839]">Payments to verify</h2>
          <p className="text-sm text-[#45546a]">Approving starts the plan at once. Renewing the same plan adds to the paid period.</p>
        </div>
        <button type="button" className="text-sm font-semibold text-[#b8470a] hover:underline" onClick={() => setView((v) => (v === 'pending' ? 'all' : 'pending'))}>
          {view === 'pending' ? 'Show recent history' : 'Show waiting only'}
        </button>
      </div>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" />
      ) : isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load payments. <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : !data.length ? (
        <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">
          {view === 'pending' ? 'No payments waiting. New ones appear here by themselves.' : 'No plan payments yet.'}
        </p>
      ) : (
        <ul className="space-y-3">{data.map((r) => <RequestCard key={r.id} req={r} planName={nameOf(r.plan_id)} />)}</ul>
      )}
    </section>
  );
}
