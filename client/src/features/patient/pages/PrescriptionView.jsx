import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Lock, Printer, QrCode, RefreshCw, Stethoscope, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { PublicLayout } from '../../../components/layout/PublicLayout';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Spinner } from '../../../components/ui/Spinner';
import { NotFoundContent } from '../../../pages/NotFound';
import { RX_ID_PATTERN, formatPeso } from '../../../lib/utils';
import { useAuthStore } from '../../../store/authStore';
import { usePaymentStatus } from '../hooks/usePaymentStatus';
import { BlurredPrescription } from '../components/BlurredPrescription';
import { PaymentQrModal } from '../components/PaymentQrModal';
import { PrescriptionContent } from '../components/PrescriptionContent';

export default function PrescriptionView() {
  const { id } = useParams();
  const valid = RX_ID_PATTERN.test(id ?? '');
  const { session, loading: authLoading } = useAuthStore();
  const { data: rx, isLoading: rxLoading, isError, refetch, isFetching } = usePaymentStatus(
    id,
    valid && !authLoading,
    session?.user?.id
  );
  const isLoading = rxLoading || (authLoading && valid);

  const [modalOpen, setModalOpen] = useState(false);
  const sawUnpaid = useRef(false);
  const [justUnlocked, setJustUnlocked] = useState(false);

  // If the prescription is unpaid, auto-open the QR payment modal directly
  useEffect(() => {
    if (rx && rx.status === 'unpaid') {
      setModalOpen(true);
    }
  }, [rx?.status]);

  useEffect(() => {
    if (rx?.status === 'unpaid') sawUnpaid.current = true;
    if (rx?.status === 'paid' && sawUnpaid.current) {
      sawUnpaid.current = false;
      setModalOpen(false);
      setJustUnlocked(true);
      toast.success('Payment received — your prescription is unlocked.');
    }
  }, [rx?.status]);

  if (!valid || (!isLoading && !isError && rx === null)) {
    return (
      <PublicLayout>
        <NotFoundContent
          title="Prescription not found"
          message="This prescription link is invalid or has been removed. Please check the link your doctor sent you."
        />
      </PublicLayout>
    );
  }

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-ink-500">
          <Spinner label="Loading prescription" className="[&>svg]:h-8 [&>svg]:w-8" />
          <p className="text-sm">Opening secure prescription…</p>
        </div>
      </PublicLayout>
    );
  }

  if (isError) {
    return (
      <PublicLayout>
        <Card className="mx-auto mt-16 max-w-md text-center">
          <WifiOff className="mx-auto h-10 w-10 text-ink-400" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-semibold">We couldn’t load this prescription</h1>
          <p className="mt-1 text-sm text-ink-500">Check your internet connection and try again.</p>
          <Button className="mt-5" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </Button>
        </Card>
      </PublicLayout>
    );
  }

  const paid = rx.status === 'paid';
  const isDoctorPreview = Boolean(rx.is_doctor_preview);
  const canView = paid || isDoctorPreview;

  return (
    <PublicLayout maxWidth="max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
            {isDoctorPreview ? 'Prescription Preview' : 'Your prescription'}
          </h1>
          <p className="text-sm text-ink-500">
            {isDoctorPreview
              ? 'This is how your prescription appears to the patient once unlocked.'
              : paid
              ? 'Show this to your pharmacist or keep a copy.'
              : `Issued by ${rx.doctor?.full_name ?? 'your doctor'}`}
          </p>
        </div>
        {canView && (
          <div className="flex items-center gap-2">
            {isDoctorPreview && (
              <Button variant="secondary" onClick={() => setModalOpen(true)}>
                <QrCode className="h-4 w-4" aria-hidden="true" /> View Patient QR Modal
              </Button>
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden="true" /> Print / Save PDF
            </Button>
          </div>
        )}
      </div>

      {isDoctorPreview && (
        <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 p-4 text-brand-900 ring-1 ring-brand-200">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">Prescribing Doctor Preview</p>
              <p className="text-xs text-brand-700">
                Status: <strong>Unpaid ({formatPeso(rx.amount)})</strong>. Patients will be prompted to pay via QR before viewing.
              </p>
            </div>
          </div>
        </div>
      )}

      {canView ? (
        <>
          {justUnlocked && (
            <div role="status" className="mb-4 flex animate-pop items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> Payment confirmed. Prescription unlocked.
            </div>
          )}
          <PrescriptionContent rx={rx} animate={justUnlocked} />
        </>
      ) : (
        <div className="relative">
          <BlurredPrescription rx={rx} />
          <div className="absolute inset-0 px-2 pt-10 sm:px-0">
            <div className="sticky top-24 mx-auto max-w-sm rounded-3xl bg-white/90 p-6 text-center shadow-paper ring-1 ring-ink-100 backdrop-blur-xl">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Lock className="h-7 w-7" aria-hidden="true" />
              </span>
              <h2 className="mt-3 text-xl font-semibold text-ink-900">Prescription locked</h2>
              <p className="mt-1 text-sm text-ink-500">
                {rx.medicine_count} medicine{rx.medicine_count === 1 ? '' : 's'} for <span className="font-medium text-ink-700">{rx.patient_hint}</span>
              </p>
              <Button size="lg" className="mt-5 w-full" onClick={() => setModalOpen(true)}>
                Pay {formatPeso(rx.amount)} to unlock
              </Button>
            </div>
          </div>
        </div>
      )}

      <PaymentQrModal open={modalOpen} onClose={() => setModalOpen(false)} rx={rx} />
    </PublicLayout>
  );
}
