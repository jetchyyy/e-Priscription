import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, FlaskConical, Loader2, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { env } from '../../../config/env';
import { formatPeso } from '../../../lib/utils';
import { createPaymentSession, mockPay } from '../api';

function useCountdown(expiresAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : 0;
}

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** QR payload: the gateway's QR/checkout string when live, otherwise the mock pay page URL. */
const qrValueFor = (s) => s.qr_payload || `${window.location.origin}/mock-pay/${s.reference}`;

export function PaymentQrModal({ open, onClose, rx }) {
  const qc = useQueryClient();

  const session = useMutation({
    mutationFn: () => createPaymentSession(rx.id),
    onError: () => toast.error('Could not start the payment. Please try again.'),
  });

  useEffect(() => {
    if (open && !session.data && !session.isPending) session.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const simulate = useMutation({
    mutationFn: () => mockPay(session.data.reference),
    onSuccess: () => {
      onClose();
      qc.invalidateQueries({ queryKey: ['rx'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const customMethods = rx.payment_methods ?? [];
  const [selectedMethodId, setSelectedMethodId] = useState(
    () => customMethods[0]?.id || 'system'
  );

  const activeCustomMethod = customMethods.find((m) => m.id === selectedMethodId);
  const s = session.data;
  const remaining = useCountdown(s?.expires_at);
  const expired = s && s.status !== 'paid' && (s.status === 'expired' || remaining <= 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pay to unlock your prescription"
      description={`From ${rx.doctor?.full_name ?? 'your doctor'}`}
      size="md"
    >
      <div className="flex flex-col items-center text-center">
        <p className="font-display text-4xl font-semibold text-ink-900">{formatPeso(rx.amount)}</p>
        <p className="mt-1 text-sm text-ink-500">One-time fee · instant access</p>

        {/* Doctor Bank / E-Wallet Tabs */}
        {customMethods.length > 0 && (
          <div className="mt-4 flex w-full flex-wrap justify-center gap-1.5 rounded-2xl bg-ink-100/70 p-1">
            {customMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMethodId(m.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  selectedMethodId === m.id
                    ? 'bg-white text-ink-900 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                {m.provider}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedMethodId('system')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                selectedMethodId === 'system'
                  ? 'bg-white text-ink-900 shadow-sm'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              QR Ph / Others
            </button>
          </div>
        )}

        <div className="relative mt-4">
          <div className="rounded-3xl bg-gradient-to-br from-brand-400 via-brand-500 to-gold-400 p-[3px] shadow-glow">
            <div className="relative rounded-[1.3rem] bg-white p-4">
              {activeCustomMethod ? (
                /* Doctor's Custom Uploaded QR Code */
                <div className="flex flex-col items-center">
                  <img
                    src={activeCustomMethod.qr_image_url}
                    alt={`${activeCustomMethod.provider} QR`}
                    className="max-h-56 max-w-56 rounded-xl object-contain shadow-sm"
                  />
                  <div className="mt-3 w-full border-t border-ink-100 pt-2 text-center text-xs">
                    <p className="font-semibold text-ink-800">{activeCustomMethod.account_name}</p>
                    {activeCustomMethod.account_number && (
                      <p className="mt-0.5 flex items-center justify-center gap-1 font-mono text-ink-600">
                        <span>{activeCustomMethod.account_number}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(activeCustomMethod.account_number);
                            toast.success('Account number copied!');
                          }}
                          className="text-brand-600 hover:text-brand-800"
                          title="Copy account number"
                        >
                          Copy
                        </button>
                      </p>
                    )}
                  </div>
                </div>
              ) : !s ? (
                /* Dynamic QR loading */
                <div className="flex h-56 w-56 items-center justify-center" role="status" aria-label="Preparing QR code">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                </div>
              ) : (
                /* System QR Code */
                <>
                  <QRCodeSVG
                    value={qrValueFor(s)}
                    size={224}
                    level="M"
                    fgColor="#0a101c"
                    className={expired ? 'opacity-10 blur-sm' : ''}
                    role="img"
                    aria-label={`Payment QR code for ${formatPeso(rx.amount)}`}
                  />
                  {expired && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
                      <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
                      <p className="font-semibold text-ink-900">QR code expired</p>
                      <Button size="sm" onClick={() => session.mutate()} loading={session.isPending}>
                        <RefreshCw className="h-4 w-4" aria-hidden="true" /> New QR code
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {s && !expired && !activeCustomMethod && (
          <p className="mt-3 text-sm text-ink-500" aria-live="polite">
            QR expires in <span className="font-mono font-semibold text-ink-800">{mmss(remaining)}</span>
          </p>
        )}

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-100" role="status">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ring rounded-full bg-brand-500" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-600" />
          </span>
          Waiting for payment… this page updates automatically.
        </div>

        <ol className="mt-4 w-full space-y-2 text-left text-xs text-ink-600">
          <li className="flex gap-2">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span>
              Open {activeCustomMethod ? activeCustomMethod.provider : 'GCash, Maya or bank app'} and scan the QR code.
            </span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span>
              Confirm the amount ({formatPeso(rx.amount)}). The prescription will automatically unlock.
            </span>
          </li>
        </ol>

        {env.mockGateway && s && !expired && (
          <div className="mt-6 w-full rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-4 text-left">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <FlaskConical className="h-4 w-4" aria-hidden="true" /> Test mode
            </p>
            <p className="mt-1 text-xs text-amber-800/80">
              No real money is moved. This simulates the gateway sending a signed payment webhook.
            </p>
            <Button variant="dark" size="sm" className="mt-3" loading={simulate.isPending} onClick={() => simulate.mutate()}>
              Simulate successful payment
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
