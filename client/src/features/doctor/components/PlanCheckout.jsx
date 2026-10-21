import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { formatPeso } from '../../../lib/utils';
import { CONTACT_EMAIL } from '../../marketing/plans';
import { readReceipt } from '../../patient/ocr';
import { fetchPlatformPaymentMethods } from '../api';
import { myPlanQuery } from './PlanUsage';

const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

const copy = async (text, what) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy. Please copy it by hand.');
  }
};

const Dot = ({ tone = 'navy' }) => (
  <span
    aria-hidden="true"
    className={`mt-1.5 inline-block h-3 w-2.5 shrink-0 rounded-[47%/35.6%] ${
      { navy: 'bg-[#152839]', slate: 'bg-[#5f6a7c]', ember: 'bg-[#b8470a]' }[tone]
    }`}
  />
);

/**
 * Pay ODYSSEY's QR and send the receipt; an admin confirms it.
 * `request` describes what is being paid for: { title, description, amount, label, send({ file, reference, methodId, amountRead }) }.
 * Pass null to keep it closed.
 */
export function PlanCheckout({ request, onClose }) {
  const qc = useQueryClient();
  const amount = request?.amount ?? 0;
  const methodsQ = useQuery({ queryKey: ['platform-payment-methods'], queryFn: fetchPlatformPaymentMethods, enabled: Boolean(request) });
  const methods = methodsQ.data ?? [];
  const [methodId, setMethodId] = useState(null);
  const method = methods.find((m) => m.id === methodId) ?? methods[0] ?? null;

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [reference, setReference] = useState('');
  const [ocr, setOcr] = useState({ state: 'idle' });
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (!request) { setFile(null); setPreview(''); setReference(''); setOcr({ state: 'idle' }); setError(''); }
  }, [request]);

  const onPick = async (f) => {
    setError('');
    if (!f) return;
    if (!PROOF_TYPES.includes(f.type)) return setError('Use a JPG, PNG or WebP screenshot.');
    if (f.size > PROOF_MAX_BYTES) return setError('The screenshot must be 5 MB or smaller.');
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setOcr({ state: 'reading' });
    try {
      const r = await readReceipt(f, amount);
      setOcr({ state: 'done', ...r });
      if (r.reference) setReference((cur) => cur || r.reference);
    } catch {
      setOcr({ state: 'failed' });
    }
  };

  const send = useMutation({
    mutationFn: () => request.send({
      reference: reference.trim(),
      file,
      methodId: method?.id,
      amountRead: ocr.state === 'done' ? ocr.amount : null,
    }),
    onSuccess: () => {
      toast.success('Receipt sent. ODYSSEY will confirm the payment, usually within one business day.');
      qc.invalidateQueries({ queryKey: myPlanQuery.queryKey });
      qc.invalidateQueries({ queryKey: ['doctor', 'clinic'] });
      onClose();
    },
    onError: (e) => setError(e?.message || 'Could not send your receipt. Please try again.'),
  });

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!/^[A-Za-z0-9 -]{6,40}$/.test(reference.trim())) return setError('Enter the reference number exactly as it appears on your receipt.');
    if (!file) return setError('Add a screenshot of your payment receipt.');
    send.mutate();
  };

  const amountText = formatPeso(amount);

  return (
    <Modal
      open={Boolean(request)}
      onClose={onClose}
      size="md"
      title={request?.title ?? ''}
      description={request ? `${request.description} · ${amountText}` : ''}
    >
      {methodsQ.isLoading ? (
        <div className="h-64 animate-pulse rounded-[22px] bg-[#ece7de]" aria-label="Loading payment options" />
      ) : methodsQ.isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load the payment QR. <button className="ml-1 font-semibold underline" onClick={() => methodsQ.refetch()}>Try again</button>
        </div>
      ) : !method ? (
        <div className="rounded-[20px] bg-[#ece7de] p-5 text-[15px] text-[#152839]">
          ODYSSEY has not set up a payment QR yet. Email <a className="font-semibold underline" href={`mailto:${CONTACT_EMAIL}?subject=Upgrade%20${encodeURIComponent(request?.title ?? '')}`}>{CONTACT_EMAIL}</a> and we will upgrade your plan.
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-7">
          <section aria-labelledby="pp-pay-h" className="space-y-4">
            <h3 id="pp-pay-h" className="font-display text-lg font-semibold text-[#152839]">1. Pay ODYSSEY</h3>
            {methods.length > 1 && (
              <div role="group" aria-label="Payment method" className="flex flex-wrap gap-1.5 rounded-full bg-[#ece7de] p-1">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={m.id === method.id}
                    onClick={() => setMethodId(m.id)}
                    className={`min-h-[40px] flex-1 rounded-full px-4 text-sm font-semibold transition ${
                      m.id === method.id ? 'bg-[#152839] text-[#f9f8f3]' : 'text-[#152839] hover:bg-white'
                    }`}
                  >
                    {m.provider}
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-[22px] bg-[#f9f8f3] p-5">
              <div className="mx-auto w-fit rounded-[18px] bg-white p-3">
                <img src={method.qr_image_url} alt={`${method.provider} QR code for ${method.account_name}`} className="h-56 w-56 rounded-[12px] object-contain" />
              </div>
              <dl className="mt-4 grid gap-3 text-[15px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#45546a]">{method.provider} account</dt>
                  <dd className="text-right font-semibold text-[#152839]">{method.account_name}</dd>
                </div>
                {method.account_number && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[#45546a]">Number</dt>
                    <dd className="flex items-center gap-2 font-semibold tabular-nums text-[#152839]">
                      {method.account_number}
                      <button type="button" onClick={() => copy(method.account_number, 'Number')}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[#ece7de] px-3 text-sm font-semibold hover:bg-white">
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
                      </button>
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#45546a]">Amount to pay</dt>
                  <dd className="flex items-center gap-2 font-display text-xl font-bold tabular-nums text-[#152839]">
                    {amountText}
                    <button type="button" onClick={() => copy(amount.toFixed(2), 'Amount')}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[#ece7de] px-3 font-sans text-sm font-semibold hover:bg-white">
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section aria-labelledby="pp-proof-h" className="space-y-4">
            <div>
              <h3 id="pp-proof-h" className="font-display text-lg font-semibold text-[#152839]">2. Send your receipt</h3>
              <p className="mt-1 text-sm text-[#45546a]">Take a screenshot of the receipt in your app and add it here.</p>
            </div>

            <input ref={fileInput} id="pp-file" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
            {!file ? (
              <label htmlFor="pp-file"
                className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-[#c8d0db] bg-white p-5 text-center transition hover:border-[#152839]">
                <ImagePlus className="h-6 w-6 text-[#152839]" aria-hidden="true" />
                <span className="font-semibold text-[#152839]">Add receipt screenshot</span>
                <span className="text-sm text-[#5f6a7c]">JPG, PNG or WebP, up to 5 MB</span>
              </label>
            ) : (
              <div className="flex gap-4 rounded-[20px] bg-white p-3 ring-1 ring-[#dce1e8]">
                <img src={preview} alt="Your receipt screenshot" className="h-28 w-20 shrink-0 rounded-[12px] object-cover" />
                <div className="min-w-0 flex-1 space-y-2 py-1 text-sm">
                  {ocr.state === 'reading' && (
                    <p className="flex items-center gap-2 text-[#45546a]" role="status">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Reading your receipt…
                    </p>
                  )}
                  {ocr.state === 'done' && (
                    <ul className="space-y-1.5">
                      <li className="flex gap-2"><Dot tone={ocr.reference ? 'navy' : 'slate'} />
                        <span>{ocr.reference ? 'Reference number found' : 'Reference not found, please type it below'}</span></li>
                      {ocr.amount != null && (
                        <li className="flex gap-2"><Dot tone={ocr.amountMatches ? 'navy' : 'ember'} />
                          <span className={ocr.amountMatches ? '' : 'text-[#7a2406]'}>
                            {ocr.amountMatches ? `Amount ${formatPeso(ocr.amount)} matches` : `Receipt shows ${formatPeso(ocr.amount)}, the price is ${amountText}`}
                          </span></li>
                      )}
                    </ul>
                  )}
                  {ocr.state === 'failed' && <p className="text-[#45546a]">Could not read the receipt. Type the reference number below.</p>}
                  <button type="button" className="font-semibold text-[#b8470a] hover:underline" onClick={() => fileInput.current?.click()}>
                    Choose a different screenshot
                  </button>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="pp-ref" className="mb-1.5 block text-sm font-medium text-[#152839]">
                Reference number <span className="text-[#b8470a]" aria-hidden="true">*</span>
              </label>
              <input
                id="pp-ref"
                value={reference}
                onChange={(e) => { setReference(e.target.value); setError(''); }}
                autoComplete="off"
                placeholder="e.g. 1234 567 890123"
                className="block min-h-[52px] w-full rounded-[16px] border border-[#dce1e8] bg-white px-4 text-[16px] tabular-nums text-[#152839] placeholder:text-[#5f6a7c] focus:border-[#152839] focus:outline-none focus:ring-2 focus:ring-[#ff6f07]/40"
              />
              <p className="mt-1.5 text-xs text-[#5f6a7c]">Shown as “Ref No.” or “Reference ID” on your receipt.</p>
            </div>

            {error && <div role="alert" className="rounded-[16px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">{error}</div>}

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={send.isPending}>
              Send receipt to ODYSSEY
            </Button>
            <p className="text-center text-xs text-[#5f6a7c]">
              {request?.footnote ?? 'We check the payment in our account, usually within one business day. It starts on the day we confirm it.'}
            </p>
          </section>
        </form>
      )}
    </Modal>
  );
}
