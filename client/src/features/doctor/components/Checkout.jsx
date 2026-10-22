import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { cn, formatPeso } from '../../../lib/utils';
import { METHOD_HINT, gatewayConfigQuery, startCheckout } from '../../billing/gateway';
import { PlanCheckout } from './PlanCheckout';

/**
 * Paying ODYSSEY for a plan, seats or a pack.
 * Online through PayMongo when it is on (no receipt, applied as soon as PayMongo confirms). The QR and receipt
 * flow stays available only when the admin has switched the fallback on, or online payments are off.
 * `request`: { title, description, amount, footnote, send, online: { type, ...checkout fields } }
 */
export function Checkout({ request, onClose }) {
  const cfg = useQuery(gatewayConfigQuery);
  const methods = cfg.data?.methods ?? [];
  const online = Boolean(cfg.data?.enabled && methods.length && request?.online);
  const [manual, setManual] = useState(false);
  const [method, setMethod] = useState(null);
  const [error, setError] = useState('');
  const chosen = methods.find((m) => m.method === method) ?? methods[0];

  useEffect(() => { if (!request) { setManual(false); setError(''); } }, [request]);

  const go = useMutation({
    mutationFn: () => startCheckout({ ...request.online, method: chosen.method }),
    onError: (e) => setError(e?.message || 'Could not open the payment page. Please try again.'),
  });

  if (request && !cfg.isLoading && (!online || manual)) {
    return <PlanCheckout request={request} onClose={onClose} />;
  }

  return (
    <Modal
      open={Boolean(request)}
      onClose={onClose}
      size="md"
      title={request?.title ?? ''}
      description={request ? `${request.description} · ${formatPeso(request.amount)}` : ''}
    >
      {cfg.isLoading || !chosen ? (
        <div className="h-48 animate-pulse rounded-[22px] bg-[#ece7de]" aria-label="Loading payment options" />
      ) : (
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-[#152839]">Pay with</legend>
            <div className="grid gap-2">
              {methods.map((m) => (
                <label key={m.method} className={cn(
                  'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[16px] border bg-white px-4 py-3 transition',
                  m.method === chosen.method ? 'border-[#152839] ring-1 ring-[#152839]' : 'border-[#dce1e8] hover:border-[#152839]',
                )}>
                  <input type="radio" name="plan-method" checked={m.method === chosen.method}
                    onChange={() => { setMethod(m.method); setError(''); }} className="h-4 w-4 accent-[#152839]" />
                  <span>
                    <span className="block font-semibold text-[#152839]">{m.label}</span>
                    <span className="block text-xs text-[#5f6a7c]">{METHOD_HINT[m.method]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <dl className="flex justify-between gap-3 rounded-[18px] bg-[#f9f8f3] p-4">
            <dt className="font-semibold text-[#152839]">You pay</dt>
            <dd className="font-display text-xl font-bold tabular-nums text-[#152839]">{formatPeso(request.amount)}</dd>
          </dl>
          <p className="text-sm text-[#45546a]">No extra fees. ODYSSEY covers the payment fee.</p>

          {error && <div role="alert" className="rounded-[16px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">{error}</div>}

          <Button variant="primary" size="lg" className="w-full" loading={go.isPending} onClick={() => go.mutate()}>
            Pay {formatPeso(request.amount)} with {chosen.label}
          </Button>
          <p className="text-center text-xs text-[#5f6a7c]">
            You finish paying on PayMongo’s secure page. It takes effect as soon as PayMongo confirms the payment,
            usually within a minute.
          </p>
          {cfg.data?.manual_fallback && (
            <button type="button" onClick={() => setManual(true)} className="w-full text-center text-sm font-semibold text-[#b8470a] hover:underline">
              Pay by QR and send a receipt instead
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
