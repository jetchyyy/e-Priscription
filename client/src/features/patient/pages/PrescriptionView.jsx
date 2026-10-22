import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
import { PinUnlockCard } from '../components/PinUnlockCard';
import { cameBackFromCheckout, clearCheckoutFlag, fetchRxOnlineOptions, gatewayConfigQuery } from '../../billing/gateway';

export default function PrescriptionView() {
  const { id } = useParams();
  const valid = RX_ID_PATTERN.test(id ?? '');
  const { session, loading: authLoading } = useAuthStore();

  const [enteredPin, setEnteredPin] = useState(() => {
    try {
      return sessionStorage.getItem(`rx_pin_${id}`) || '';
    } catch (_) {
      return '';
    }
  });

  const { data: rx, isLoading: rxLoading, isError, refetch, isFetching } = usePaymentStatus(
    id,
    valid && !authLoading,
    session?.user?.id,
    enteredPin || null
  );
  const isLoading = rxLoading || (authLoading && valid);

  const [modalOpen, setModalOpen] = useState(false);
  const sawUnpaid = useRef(false);
  // Back from PayMongo's page: the webhook usually lands within seconds; the page polls until it does.
  const [returning] = useState(() => cameBackFromCheckout());
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!returning) return undefined;
    const t = setTimeout(() => setSlow(true), 45_000);
    return () => clearTimeout(t);
  }, [returning]);

  const needsPayment = Boolean(rx) && rx.status === 'unpaid' && !rx.is_owner;
  const onlineQ = useQuery({
    queryKey: ['rx-online', id],
    queryFn: () => fetchRxOnlineOptions(id),
    enabled: valid && needsPayment,
    staleTime: 30_000,
  });
  const cfgQ = useQuery({ ...gatewayConfigQuery, enabled: valid && needsPayment });
  const online = onlineQ.data?.methods?.length ? onlineQ.data : null;
  const allowManual = !online || Boolean(cfgQ.data?.manual_fallback);
  const [justUnlocked, setJustUnlocked] = useState(false);

  // Unpaid and no receipt waiting for review: open the payment window straight away
  useEffect(() => {
    // Wait for the online options so the window opens on the right way to pay.
    if (rx && rx.status === 'unpaid' && rx.payment_proof?.status !== 'pending' && !returning && !onlineQ.isLoading) {
      setModalOpen(true);
    }
  }, [rx?.status, onlineQ.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rx?.status === 'unpaid') sawUnpaid.current = true;
    if (rx?.status === 'paid' && returning) clearCheckoutFlag();
    if (rx?.status === 'paid' && sawUnpaid.current) {
      sawUnpaid.current = false;
      setModalOpen(false);
      if (!rx.requires_pin || !rx.is_locked_by_pin) {
        setJustUnlocked(true);
        toast.success(returning ? 'Payment received. Your prescription is open.' : 'Your doctor confirmed your payment. Your prescription is open.');
      } else {
        toast.success(returning ? 'Payment received. Enter the PIN your doctor gave you to open it.' : 'Your doctor confirmed your payment. Enter the PIN they gave you to open it.');
      }
    }
  }, [rx?.status, rx?.requires_pin, rx?.is_locked_by_pin]);

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
  const isLockedByPin = paid && Boolean(rx.is_locked_by_pin);
  const canView = (paid && !isLockedByPin) || isDoctorPreview;

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
              : paid && !isLockedByPin
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
                Status: <strong>Unpaid ({formatPeso(rx.amount)})</strong>. Patients will be prompted to pay via QR and enter the PIN before viewing.
              </p>
            </div>
          </div>
          {rx.pin && (
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-xs ring-1 ring-brand-200">
              <span className="font-semibold text-brand-900">Security PIN:</span>
              <span className="font-mono font-bold tracking-wider text-brand-700">{rx.pin}</span>
            </div>
          )}
        </div>
      )}

      {rx.is_owner && rx.pin && paid && (
        <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink-50 px-4 py-2.5 text-xs text-ink-800 ring-1 ring-ink-200">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink-600">Prescription Security PIN:</span>
            <span className="font-mono font-bold text-ink-900">{rx.pin}</span>
          </div>
          <span className="text-ink-500">Required for patient to open after payment</span>
        </div>
      )}

      {canView ? (
        <>
          {justUnlocked && (
            <div role="status" className="mb-4 flex animate-pop items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              {isLockedByPin ? 'Prescription unlocked.' : 'Prescription unlocked successfully.'}
            </div>
          )}
          <PrescriptionContent rx={rx} animate={justUnlocked} />
        </>
      ) : isLockedByPin ? (
        <div className="relative">
          <BlurredPrescription rx={rx} />
          <div className="absolute inset-0 px-2 pt-8 sm:px-0">
            <PinUnlockCard
              rx={rx}
              onUnlocked={(pin) => {
                setEnteredPin(pin);
                try {
                  sessionStorage.setItem(`rx_pin_${id}`, pin);
                } catch (_) {}
                setJustUnlocked(true);
              }}
            />
          </div>
        </div>
      ) : (
        <div className="relative">
          <BlurredPrescription rx={rx} />
          <div className="absolute inset-0 px-2 pt-10 sm:px-0">
            <div className="sticky top-24 mx-auto max-w-sm rounded-3xl bg-white/90 p-6 text-center shadow-paper ring-1 ring-ink-100 backdrop-blur-xl">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Lock className="h-7 w-7" aria-hidden="true" />
              </span>
              <h2 className="mt-3 text-xl font-semibold text-ink-900">
                {returning ? 'Confirming your payment' : rx.payment_proof?.status === 'pending' ? 'Waiting for your doctor' : 'Prescription locked'}
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                {rx.medicine_count} medicine{rx.medicine_count === 1 ? '' : 's'} for <span className="font-medium text-ink-700">{rx.patient_hint}</span>
              </p>
              {returning && (
                <p role="status" aria-live="polite" className="mt-2 text-sm text-ink-600">
                  {slow
                    ? 'This is taking longer than usual. If PayMongo showed your payment as successful, keep this page open. It opens by itself once the payment arrives. If you did not finish paying, you can try again.'
                    : 'PayMongo is sending us your payment. This usually takes a few seconds. Please keep this page open.'}
                </p>
              )}
              {!returning && rx.payment_proof?.status === 'pending' && (
                <p className="mt-2 text-sm text-ink-600">Your receipt was sent. This page opens your prescription once your doctor confirms the payment.</p>
              )}
              {returning && !slow ? (
                <Spinner label="Waiting for the payment" className="mx-auto mt-5 [&>svg]:h-7 [&>svg]:w-7" />
              ) : (
                <Button size="lg" className="mt-5 w-full" variant={returning ? 'secondary' : 'primary'} onClick={() => setModalOpen(true)}>
                  {rx.payment_proof?.status === 'pending'
                    ? 'View payment status'
                    : returning
                      ? 'Try paying again'
                      : online
                        ? 'Pay to unlock'
                        : `Pay ${formatPeso(rx.amount)} to unlock`}
                </Button>
              )}
              {rx.requires_pin && (
                <p className="mt-3 text-xs text-ink-400">
                  Doctor's PIN will be required after payment to open.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <PaymentQrModal open={modalOpen} onClose={() => setModalOpen(false)} rx={rx} online={online} allowManual={allowManual} />
    </PublicLayout>
  );
}
