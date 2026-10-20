import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, FlaskConical, Wallet } from 'lucide-react';
import { PublicLayout } from '../../../components/layout/PublicLayout';
import { Button } from '../../../components/ui/Button';
import { PageLoader } from '../../../components/ui/Spinner';
import { NotFoundContent } from '../../../pages/NotFound';
import { env } from '../../../config/env';
import { RX_ID_PATTERN, formatPeso } from '../../../lib/utils';
import { getPaymentSession, mockPay } from '../api';

/** TEST-MODE stand-in for the GCash / Maya page a real QR would open. */
export default function MockPay() {
  const { reference } = useParams();
  const [done, setDone] = useState(false);
  const valid = RX_ID_PATTERN.test(reference ?? '');

  const { data: session, isLoading } = useQuery({
    queryKey: ['payment-session', reference],
    queryFn: () => getPaymentSession(reference),
    enabled: valid && env.mockGateway,
  });

  const pay = useMutation({ mutationFn: () => mockPay(reference), onSuccess: () => setDone(true) });

  if (!env.mockGateway || !valid) {
    return (
      <PublicLayout maxWidth="max-w-lg">
        <NotFoundContent title="Payment page unavailable" message="This test payment page is not enabled." />
      </PublicLayout>
    );
  }
  if (isLoading) return <PageLoader />;
  if (!session) {
    return (
      <PublicLayout maxWidth="max-w-lg">
        <NotFoundContent title="Payment not found" message="This payment link is invalid." />
      </PublicLayout>
    );
  }

  const paid = done || session.status === 'paid';

  return (
    <PublicLayout maxWidth="max-w-md">
      <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-paper ring-1 ring-ink-100">
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 px-6 py-4 text-white">
          <p className="flex items-center gap-2 text-sm font-semibold"><FlaskConical className="h-4 w-4" aria-hidden="true" /> Mock Pay · Test mode</p>
        </div>
        <div className="p-6 text-center">
          {paid ? (
            <div className="animate-pop">
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" aria-hidden="true" />
              <h1 className="mt-3 text-2xl font-semibold">Payment sent</h1>
              <p className="mt-1 text-sm text-ink-500">Payment received! Open your prescription and enter your Doctor’s PIN to view.</p>
              <Link to={`/rx/${session.prescription_id}`}>
                <Button className="mt-6 w-full" size="lg">Open my prescription</Button>
              </Link>
            </div>
          ) : session.status === 'expired' ? (
            <>
              <h1 className="text-2xl font-semibold">This QR code expired</h1>
              <p className="mt-1 text-sm text-ink-500">Go back to your prescription and generate a new QR code.</p>
              <Link to={`/rx/${session.prescription_id}`}><Button className="mt-6 w-full" size="lg">Back to prescription</Button></Link>
            </>
          ) : (
            <>
              <Wallet className="mx-auto h-10 w-10 text-brand-600" aria-hidden="true" />
              <p className="mt-3 text-sm text-ink-500">Pay {session.doctor_name}</p>
              <h1 className="font-display text-4xl font-semibold">{formatPeso(session.amount)}</h1>
              <p className="mt-2 text-xs text-ink-500">No real money is moved in test mode.</p>
              {pay.isError && <p role="alert" className="mt-3 text-sm text-rose-600">{pay.error.message}</p>}
              <Button className="mt-6 w-full" size="lg" loading={pay.isPending} onClick={() => pay.mutate()}>
                Confirm payment
              </Button>
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
