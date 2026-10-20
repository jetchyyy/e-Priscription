import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Input';
import { formatDateTime } from '../../../lib/utils';
import { fetchChangeRequests, getLicenseUrl, reviewChangeRequest } from '../api';

const LABELS = { full_name: 'Full name', prc_no: 'PRC license no.', specialty: 'Specialty', s2_no: 'PDEA S2 no.' };
const STATUS_TEXT = { approved: 'Approved', rejected: 'Not approved', cancelled: 'Withdrawn by doctor' };

function RequestCard({ req }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const review = useMutation({
    mutationFn: reviewChangeRequest,
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['admin', 'change-requests'] });
      qc.invalidateQueries({ queryKey: ['admin', 'doctors'] });
      toast.success(v.approve ? 'Change approved and applied' : 'Change request rejected');
    },
    onError: (e) => toast.error(e?.message || 'Action failed. Please try again.'),
  });

  const openDocument = async () => {
    try {
      window.open(await getLicenseUrl(req.license_file_path), '_blank', 'noopener');
    } catch (e) {
      toast.error(e?.message || 'Could not open the document.');
    }
  };

  const isPending = req.status === 'pending';

  return (
    <li className="rounded-[20px] border border-[#dce1e8] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-[#152839]">{req.doctor?.full_name}</p>
          <p className="text-sm text-[#45546a]">{req.doctor?.email} · Requested {formatDateTime(req.created_at)}</p>
        </div>
        <span className="flex items-center gap-2 text-sm font-medium text-[#152839]">
          <span className={`inline-block h-2.5 w-2 rounded-[47%/35.6%] ${isPending ? 'bg-[#ff6f07]' : 'bg-[#5f6a7c]'}`} aria-hidden="true" />
          {isPending ? 'Waiting for review' : STATUS_TEXT[req.status]}
        </span>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-[#45546a]">
            <th className="py-1.5 pr-4 font-medium">Detail</th>
            <th className="py-1.5 pr-4 font-medium">Current</th>
            <th className="py-1.5 font-medium">Requested</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(req.changes).map(([k, v]) => (
            <tr key={k} className="border-t border-[#ece7de]">{/* taste-skill-ignore: rows of a real data table */}
              <td className="py-2 pr-4 text-[#45546a]">{LABELS[k] ?? k}</td>
              <td className="py-2 pr-4 text-[#152839]">{req.previous?.[k] || 'none'}</td>
              <td className="py-2 font-semibold text-[#152839]">{v || 'none'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {req.reason && <p className="mt-3 text-sm text-[#152839]"><span className="text-[#45546a]">Reason: </span>{req.reason}</p>}
      {req.review_note && !isPending && <p className="mt-2 text-sm text-[#45546a]">Note: {req.review_note}</p>}

      {isPending && (
        <div className="mt-4 space-y-3">
          {rejecting && (
            <Textarea label="Reason for rejection (shown to the doctor)" rows={2} maxLength={500} value={note}
              onChange={(e) => setNote(e.target.value)} placeholder="e.g. The PRC ID does not show the new name." />
          )}
          <div className="flex flex-wrap gap-2">
            {req.license_file_path && <Button variant="ghost" onClick={openDocument}>View document</Button>}
            {rejecting ? (
              <>
                <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
                <Button variant="danger" loading={review.isPending} onClick={() => review.mutate({ id: req.id, approve: false, note })}>Confirm rejection</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setRejecting(true)}>Reject</Button>
                <Button variant="primary" loading={review.isPending} onClick={() => review.mutate({ id: req.id, approve: true })}>Approve and apply</Button>
              </>
            )}
          </div>
          <p className="text-xs text-[#5f6a7c]">Approving updates the doctor’s profile for new prescriptions only. Issued prescriptions keep their original details.</p>
        </div>
      )}
    </li>
  );
}

/** Doctors' requests to change verified details (name, PRC no., specialty, S2 no.). */
export function ChangeRequests() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'change-requests'],
    queryFn: fetchChangeRequests,
    refetchInterval: 30_000,
  });
  const [showAll, setShowAll] = useState(false);
  const items = data ?? [];
  const pending = items.filter((r) => r.status === 'pending');
  const shown = showAll ? items : pending;

  return (
    <section aria-labelledby="cr-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="cr-h" className="font-display text-xl font-semibold text-[#152839]">
            Change requests <span className="tabular-nums text-[#45546a]">({pending.length} waiting)</span>
          </h2>
          <p className="text-sm text-[#45546a]">Approved doctors cannot edit their name, PRC no., specialty or S2 no. directly.</p>
        </div>
        {items.length > pending.length && (
          <button type="button" className="text-sm font-semibold text-[#b8470a] hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show waiting only' : 'Show recent history'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-20 animate-pulse rounded-[20px] bg-[#ece7de]" />
      ) : isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load change requests. <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">No change requests waiting.</p>
      ) : (
        <ul className="space-y-3">{shown.map((r) => <RequestCard key={r.id} req={r} />)}</ul>
      )}
    </section>
  );
}
