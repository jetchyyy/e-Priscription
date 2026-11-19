import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { cn, formatPeso } from '../../../lib/utils';
import { METHOD_HINT, gatewayConfigQuery } from '../../billing/gateway';
import { EmbeddedPay } from '../../billing/EmbeddedPay';
import { PlanCheckout } from './PlanCheckout';
import { myPlanQuery } from './PlanUsage';

/**
 * Paying ODYSSEY for a plan, seats or a pack.
 * Online through PayMongo, on this page, when it is on (no receipt, applied as soon as PayMongo confirms). The QR and receipt
 * flow stays available only when the admin has switched the fallback on, or online payments are off.
 * `request`: { title, description, amount, footnote, send, online: { type, ...checkout fields } }
 */
export function Checkout({ request, onClose, onPaid }) {
  const qc = useQueryClient();
  const cfg = useQuery(gatewayConfigQuery);
  const methods = cfg.data?.methods ?? [];
  const online = Boolean(cfg.data?.enabled && methods.length && request?.online);
  const [manual, setManual] = useState(false);
  const [method, setMethod] = useState(null);
  const chosen = methods.find((m) => m.method === method) ?? methods[0];

  useEffect(() => { if (!request) setManual(false); }, [request]);

  const paid = () => {
    qc.invalidateQueries({ queryKey: myPlanQuery.queryKey });
    qc.invalidateQueries({ queryKey: ['doctor', 'clinic'] });
    if (onPaid) onPaid();
    else toast.success('Payment received. It takes effect within a minute.');
    setTimeout(onClose, 1500);
  };

  if (!request) return null; // closed: nothing to show (the window's contents read request.amount)
  if (!cfg.isLoading && (!online || manual)) {
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
                    onChange={() => setMethod(m.method)} className="h-4 w-4 accent-[#152839]" />
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

          <EmbeddedPay
            body={request.online}
            method={chosen}
            amount={request.amount}
            next="/doctor/plan?paid=1"
            onPaid={paid}
            footnote="It takes effect as soon as PayMongo confirms the payment, usually within a minute."
          />
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
