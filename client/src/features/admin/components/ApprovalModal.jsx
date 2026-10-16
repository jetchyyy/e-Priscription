import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, FileWarning, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Input';
import { DoctorStatusBadge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';
import { fileExtension, formatDateTime } from '../../../lib/utils';
import { getLicenseUrl, reviewDoctor } from '../api';

function Row({ label, children }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500 sm:pt-0.5">{label}</dt>
      <dd className="break-words text-sm text-ink-900 sm:col-span-2">{children || <span className="text-ink-400">—</span>}</dd>
    </div>
  );
}

export function ApprovalModal({ doctor, onClose }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => { setRejecting(false); setReason(''); }, [doctor?.id]);

  const path = doctor?.license_file_path;
  const license = useQuery({
    queryKey: ['license-url', path],
    queryFn: () => getLicenseUrl(path),
    enabled: Boolean(path) && Boolean(doctor),
    staleTime: 4 * 60_000,
  });

  const review = useMutation({
    mutationFn: reviewDoctor,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'doctors'] });
      toast.success(vars.status === 'approved' ? 'Doctor approved' : 'Registration rejected');
      onClose();
    },
    onError: (e) => toast.error(e?.message || 'Action failed. Please try again.'),
  });

  if (!doctor) return null;
  const isPdf = Boolean(path) && fileExtension(path) === 'pdf';

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={doctor.full_name}
      description={doctor.email}
      footer={
        rejecting ? (
          <div className="space-y-3">
            <Textarea label="Reason for rejection (optional)" rows={2} value={reason} maxLength={500}
              onChange={(e) => setReason(e.target.value)} placeholder="e.g. License photo is unreadable. Please re-register." />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
              <Button variant="danger" loading={review.isPending}
                onClick={() => review.mutate({ id: doctor.id, status: 'rejected', reason })}>
                <XCircle className="h-4 w-4" aria-hidden="true" /> Confirm rejection
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {doctor.status !== 'rejected' && (
              <Button variant="secondary" className="text-rose-700" onClick={() => setRejecting(true)}>
                <XCircle className="h-4 w-4" aria-hidden="true" /> {doctor.status === 'approved' ? 'Revoke access' : 'Reject'}
              </Button>
            )}
            {doctor.status !== 'approved' && (
              <Button loading={review.isPending} onClick={() => review.mutate({ id: doctor.id, status: 'approved' })}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve doctor
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="mb-2"><DoctorStatusBadge status={doctor.status} /></div>
      <dl className="divide-y divide-ink-100">
        <Row label="PRC license no.">{doctor.prc_no}</Row>
        <Row label="PTR no.">{doctor.ptr_no}</Row>
        <Row label="S2 license no.">{doctor.s2_no}</Row>
        <Row label="Specialty">{doctor.specialty}</Row>
        <Row label="Clinic">{doctor.clinic_name}</Row>
        <Row label="Address">{doctor.clinic_address}</Row>
        <Row label="Contact">{doctor.phone}</Row>
        <Row label="Registered">{formatDateTime(doctor.created_at)}</Row>
        {doctor.status === 'rejected' && <Row label="Rejection reason">{doctor.reject_reason}</Row>}
      </dl>

      <h3 className="mb-2 mt-5 text-sm font-semibold text-ink-900">Uploaded license</h3>
      {!path ? (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <FileWarning className="h-4 w-4 shrink-0" aria-hidden="true" /> No license document uploaded yet.
        </p>
      ) : license.isLoading ? (
        <div className="flex h-32 items-center justify-center rounded-xl bg-ink-50"><Spinner label="Loading license" /></div>
      ) : license.isError ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">Could not load the document.</p>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-ink-200">
          {!isPdf && <img src={license.data} alt={`PRC license of ${doctor.full_name}`} className="max-h-80 w-full bg-ink-50 object-contain" />}
          <a href={license.data} target="_blank" rel="noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 bg-ink-50 px-4 text-sm font-semibold text-brand-700 hover:bg-ink-100">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open {isPdf ? 'PDF' : 'full image'} in new tab
          </a>
        </div>
      )}
    </Modal>
  );
}
