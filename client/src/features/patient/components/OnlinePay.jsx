import { useState } from 'react';
import { cn, formatPeso } from '../../../lib/utils';
import { METHOD_HINT } from '../../billing/gateway';
import { EmbeddedPay } from '../../billing/EmbeddedPay';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../marketing/legalInfo';

/**
 * Pay a prescription online. The patient picks a method first, so the exact amount (and any convenience fee)
 * is on screen before paying. Paying happens right here (QR, card form, or a GCash / Maya window).
 */
export function OnlinePay({ rx, options, onPaid, agreed = true }) {
  const methods = options.methods ?? [];
  const [method, setMethod] = useState(methods[0]?.method ?? null);
  const chosen = methods.find((m) => m.method === method) ?? methods[0];
  const passFee = options.fee_mode === 'pass';

  if (!chosen) return null;

  return (
    <section aria-labelledby="online-h" className="space-y-4">
      <h3 id="online-h" className="font-display text-lg font-semibold text-[#152839]">Pay online</h3>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-[#152839]">How do you want to pay?</legend>
        <div className="grid gap-2">
          {methods.map((m) => (
            <label
              key={m.method}
              className={cn(
                'flex min-h-[56px] cursor-pointer items-center justify-between gap-3 rounded-[16px] border bg-white px-4 py-3 transition',
                m.method === chosen.method ? 'border-[#152839] ring-1 ring-[#152839]' : 'border-[#dce1e8] hover:border-[#152839]',
              )}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="pay-method"
                  value={m.method}
                  checked={m.method === chosen.method}
                  onChange={() => setMethod(m.method)}
                  className="h-4 w-4 accent-[#152839]"
                />
                <span>
                  <span className="block font-semibold text-[#152839]">{m.label}</span>
                  <span className="block text-xs text-[#5f6a7c]">{METHOD_HINT[m.method]}</span>
                </span>
              </span>
              <span className="font-semibold tabular-nums text-[#152839]">{formatPeso(m.total)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <dl className="space-y-2 rounded-[18px] bg-[#f9f8f3] p-4 text-[15px]">
        <div className="flex justify-between gap-3">
          <dt className="text-[#45546a]">Prescription fee</dt>
          <dd className="tabular-nums text-[#152839]">{formatPeso(options.price)}</dd>
        </div>
        {passFee && (
          <div className="flex justify-between gap-3">
            <dt className="text-[#45546a]">Convenience fee, {chosen.label}</dt>
            <dd className="tabular-nums text-[#152839]">{formatPeso(chosen.fee)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 border-t border-[#dce1e8] pt-2">
          <dt className="font-semibold text-[#152839]">You pay</dt>
          <dd className="font-display text-xl font-bold tabular-nums text-[#152839]">{formatPeso(chosen.total)}</dd>
        </div>
      </dl>

      <EmbeddedPay
        body={{ type: 'rx', rx_id: rx.id, terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION }}
        blockedReason={agreed ? '' : 'Tick the box above to agree to the Terms and Privacy Policy first.'}
        method={chosen}
        amount={chosen.total}
        next={`/rx/${rx.id}?paid=1`}
        onPaid={onPaid}
        footnote={`Your prescription opens by itself once the payment goes through${rx.requires_pin ? ' and you enter the PIN your doctor gave you' : ''}.${passFee ? ' The convenience fee is not refundable.' : ''}`}
      />
    </section>
  );
}
