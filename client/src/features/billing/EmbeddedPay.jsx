import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Download, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { formatPeso } from '../../lib/utils';
import { fetchIntent, payDoneUrl, payWithCard, startPayment } from './gateway';

const POLL_MS = 3000;
const QR_LIFETIME_MS = 30 * 60_000; // PayMongo's QR Ph codes expire after 30 minutes

const mmss = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Saves the QR as a PNG, so a phone user can upload it in GCash, Maya or their bank app. */
async function downloadQr(src, name) {
  let href = src;
  let made = false;
  if (!src.startsWith('data:')) {
    try {
      href = URL.createObjectURL(await (await fetch(src)).blob());
      made = true;
    } catch {
      window.open(src, '_blank', 'noopener'); // could not fetch it: open it so it can be saved by hand
      return;
    }
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (made) setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Time left on the QR, ticking every second. */
function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? until - now : null;
}
const WALLETS = ['gcash', 'paymaya'];

const field =
  'block min-h-[52px] w-full rounded-[16px] border border-[#dce1e8] bg-white px-4 text-[16px] tabular-nums text-[#152839] placeholder:text-[#5f6a7c] focus:border-[#152839] focus:outline-none focus:ring-2 focus:ring-[#ff6f07]/40';

/** "4343 4343 4343 4345", "12 / 28" style values into what PayMongo wants. Null when something is missing. */
function readCard(c) {
  const number = c.number.replace(/\D/g, '');
  const [mm, yy] = c.expiry.split('/').map((p) => p.replace(/\D/g, ''));
  const expMonth = Number(mm);
  const expYear = Number(yy?.length === 2 ? `20${yy}` : yy);
  const cvc = c.cvc.replace(/\D/g, '');
  if (!c.name.trim()) return { error: 'Enter the name on the card.' };
  if (number.length < 13 || number.length > 19) return { error: 'Check the card number.' };
  if (!(expMonth >= 1 && expMonth <= 12) || !(expYear >= 2000)) return { error: 'Enter the expiry date as MM / YY.' };
  if (cvc.length < 3 || cvc.length > 4) return { error: 'Enter the 3 or 4 digit security code on the back of the card.' };
  return { card: { number, expMonth, expYear, cvc, name: c.name.trim() } };
}

const failedText = (attrs) =>
  attrs?.last_payment_error?.failed_message || 'The payment did not go through. Please try again or choose another method.';

/**
 * Pays on our own page instead of PayMongo's.
 *   QR Ph:          shows the QR here; the payer scans it with any bank or e-wallet app.
 *   Card:           a card form here; the bank's security check (3-D Secure) opens in a frame here.
 *   GCash / Maya:   the wallet's approval page opens in a small window over this page (wallets do not allow
 *                   being framed). If the browser blocks the window, the page goes there and comes back.
 * `body` is what /api/paymongo-checkout needs, without the method. `next` is where a full-page visitor comes back to.
 * `onPaid` runs once PayMongo says the payment succeeded; the webhook then applies it within seconds.
 */
export function EmbeddedPay({ body, method, amount, next, onPaid, footnote }) {
  const [stage, setStage] = useState('idle'); // idle | starting | qr | wallet | check | waiting | paid
  const [start, setStart] = useState(null);
  const [qr, setQr] = useState('');
  const [qrUntil, setQrUntil] = useState(0);
  const qrRef = useRef('');
  const left = useCountdown(stage === 'qr' ? qrUntil : 0);
  const expired = left != null && left <= 0;
  const [checkUrl, setCheckUrl] = useState('');
  const [error, setError] = useState('');
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const popup = useRef(null);
  const paidOnce = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const isCard = method.method === 'card';
  const isWallet = WALLETS.includes(method.method);

  const reset = (message = '') => {
    try { popup.current?.close(); } catch (_) { /* already closed */ }
    popup.current = null;
    setStage('idle');
    setStart(null);
    setQr('');
    qrRef.current = '';
    setQrUntil(0);
    setCheckUrl('');
    setError(message);
  };

  // A different method was picked: start over.
  useEffect(() => { reset(); }, [method.method]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { try { popup.current?.close(); } catch (_) { /* gone */ } }, []);

  /** Moves the screen to wherever PayMongo says the payment is. */
  const follow = (attrs) => {
    const status = attrs?.status;
    if (status === 'succeeded') {
      try { popup.current?.close(); } catch (_) { /* gone */ }
      setStage('paid');
      if (!paidOnce.current) { paidOnce.current = true; onPaidRef.current?.(); }
      return;
    }
    if (status === 'processing') { setStage('waiting'); return; }
    if (status === 'awaiting_payment_method') { reset(failedText(attrs)); return; }
    if (status === 'awaiting_next_action') {
      const na = attrs.next_action ?? {};
      if (na.code?.image_url) {
        if (qrRef.current !== na.code.image_url) { // a new QR: its 30 minutes start now
          qrRef.current = na.code.image_url;
          setQr(na.code.image_url);
          setQrUntil(Date.now() + QR_LIFETIME_MS);
        }
        setStage('qr');
        return;
      }
      const url = na.redirect?.url;
      if (!url) return;
      if (isCard) { setCheckUrl(url); setStage('check'); return; }
      if (popup.current && !popup.current.closed) {
        popup.current.location.href = url;
        setStage('wallet');
      } else {
        window.location.assign(url); // pop-up blocked: go there; pay-done.html brings the payer back
      }
    }
  };

  // While waiting, ask PayMongo every few seconds. pay-done.html also says when a window or frame is done.
  useEffect(() => {
    if (!start || !['qr', 'wallet', 'check', 'waiting'].includes(stage)) return undefined;
    let live = true;
    const check = async () => {
      try {
        const attrs = await fetchIntent(start);
        if (live) follow(attrs);
      } catch (_) { /* a missed check is fine; the next one runs soon */ }
    };
    const t = setInterval(check, POLL_MS);
    const onMessage = (e) => { if (e.origin === window.location.origin && e.data === 'paymongo-done') check(); };
    window.addEventListener('message', onMessage);
    return () => { live = false; clearInterval(t); window.removeEventListener('message', onMessage); };
  }, [start, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async (e) => {
    e?.preventDefault();
    setError('');
    let parsed = null;
    if (isCard) {
      parsed = readCard(card);
      if (parsed.error) return setError(parsed.error);
    }
    // Opened now, while the click still counts, or the browser blocks it. It is pointed at the wallet below.
    if (isWallet) {
      popup.current = window.open('', 'paymongo-pay', 'popup,width=480,height=760');
      try { popup.current?.document.write('<p style="font:16px system-ui;padding:24px">Opening the payment page…</p>'); } catch (_) { /* fine */ }
    }
    setStage('starting');
    try {
      const s = await startPayment({ ...body, method: method.method });
      if (s.checkout_url) { try { popup.current?.close(); } catch (_) { /* gone */ } window.location.assign(s.checkout_url); return; }
      setStart(s);
      const attrs = isCard ? await payWithCard(s, parsed.card, payDoneUrl(next)) : s;
      follow(attrs);
    } catch (err) {
      reset(err?.message || 'Could not start the payment. Please try again.');
    }
  };

  if (stage === 'paid') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-[18px] bg-[#e7f1ea] p-4 text-[15px] text-[#173d26]">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span><span className="font-semibold">Payment received.</span> Confirming it now, this takes a few seconds.</span>
      </div>
    );
  }

  if (stage === 'waiting') {
    return (
      <p className="flex items-center justify-center gap-2 rounded-[18px] bg-[#f9f8f3] p-5 text-[15px] text-[#152839]" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> PayMongo is confirming your payment…
      </p>
    );
  }

  if (stage === 'qr') {
    return (
      <div className="space-y-4">
        <div className="rounded-[22px] bg-[#f9f8f3] p-5 text-center">
          <div className={`relative mx-auto w-fit rounded-[18px] bg-white p-3 ${expired ? 'opacity-30' : ''}`}>
            <img src={qr} alt={`QR Ph code for ${formatPeso(amount)}`} className="h-60 w-60 object-contain" />
          </div>
          <p className="mt-4 font-display text-xl font-bold tabular-nums text-[#152839]">{formatPeso(amount)}</p>
          {expired ? (
            <div role="alert" className="mt-3 space-y-3">
              <p className="font-semibold text-[#7a2406]">This QR has expired.</p>
              <Button variant="primary" className="w-full" onClick={() => pay()}>Get a new QR</Button>
            </div>
          ) : (
            <>
              <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
                left < 5 * 60_000 ? 'bg-[#fbe9e1] text-[#7a2406]' : 'bg-[#ece7de] text-[#152839]'}`}
                aria-live={left < 60_000 ? 'polite' : 'off'}>
                <Clock className="h-4 w-4" aria-hidden="true" /> Pay within {mmss(left)}
              </p>
              <p className="mt-2 text-sm text-[#45546a]">
                Scan with GCash, Maya or your bank app. Paying on this phone? Download the QR, then upload it in your app’s Scan to Pay.
              </p>
              <Button variant="secondary" className="mt-3 w-full" onClick={() => downloadQr(qr, `odyssey-qr-${formatPeso(amount).replace(/[^\d.]/g, '')}.png`)}>
                <Download className="h-4 w-4" aria-hidden="true" /> Download QR
              </Button>
            </>
          )}
        </div>
        {start && start.livemode === false && (
          <div className="rounded-[16px] border border-dashed border-[#b8470a] bg-[#fff6ef] p-4 text-sm text-[#7a2406]">
            <p className="font-semibold">Test mode. Do not scan this QR with a real app.</p>
            {start.test_url ? (
              <a href={start.test_url} target="_blank" rel="noreferrer"
                className="mt-2 inline-flex min-h-[40px] items-center rounded-full bg-[#b8470a] px-4 font-semibold text-white hover:opacity-90">
                Simulate the payment
              </a>
            ) : (
              <p className="mt-1">PayMongo sent no simulation link with this QR.</p>
            )}
            <p className="mt-2 text-xs">This page updates by itself once PayMongo reports the payment.</p>
          </div>
        )}
        {!expired && (
          <p className="flex items-center justify-center gap-2 text-sm text-[#45546a]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Waiting for your payment…
          </p>
        )}
        <p className="text-center text-xs text-[#5f6a7c]">
          Each QR works once.{' '}
          <button type="button" className="font-semibold text-[#b8470a] hover:underline" onClick={() => reset()}>Choose another way to pay</button>
        </p>
      </div>
    );
  }

  if (stage === 'check') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[#45546a]">Your bank wants to confirm it is you. Finish the check below.</p>
        <iframe title="Card security check" src={checkUrl} className="h-[520px] w-full rounded-[16px] border border-[#dce1e8] bg-white" />
        <p className="text-center text-xs text-[#5f6a7c]">
          Nothing showing? <a href={checkUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#b8470a] hover:underline">Open the check in a new window</a>
          {' · '}
          <button type="button" className="font-semibold text-[#b8470a] hover:underline" onClick={() => reset()}>Cancel</button>
        </p>
      </div>
    );
  }

  if (stage === 'wallet') {
    return (
      <div className="space-y-3 rounded-[18px] bg-[#f9f8f3] p-5 text-center">
        <p className="flex items-center justify-center gap-2 font-semibold text-[#152839]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Approve the payment in the {method.label} window
        </p>
        <p className="text-sm text-[#45546a]">Keep this page open. It updates by itself once you approve.</p>
        <div className="flex flex-wrap justify-center gap-4 text-sm">
          <button type="button" className="font-semibold text-[#b8470a] hover:underline" onClick={() => popup.current?.focus()}>Show the window</button>
          <button type="button" className="font-semibold text-[#b8470a] hover:underline" onClick={() => reset()}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={pay} noValidate className="space-y-4">
      {isCard && (
        <fieldset className="grid gap-3" disabled={stage === 'starting'}>
          <legend className="mb-1 text-sm font-medium text-[#152839]">Card details</legend>
          <input aria-label="Name on card" placeholder="Name on card" autoComplete="cc-name" className={field}
            value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
          <input aria-label="Card number" placeholder="Card number" autoComplete="cc-number" inputMode="numeric" className={field}
            value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input aria-label="Expiry date, MM / YY" placeholder="MM / YY" autoComplete="cc-exp" inputMode="numeric" className={field}
              value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} />
            <input aria-label="Security code" placeholder="CVC" autoComplete="cc-csc" inputMode="numeric" className={field}
              value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} />
          </div>
          <p className="text-xs text-[#5f6a7c]">Your card goes straight to PayMongo. ODYSSEY never sees or keeps the number.</p>
        </fieldset>
      )}

      {error && <div role="alert" className="rounded-[16px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">{error}</div>}

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={stage === 'starting'}>
        Pay {formatPeso(amount)} with {method.label}
      </Button>
      {footnote && <p className="text-center text-xs text-[#5f6a7c]">{footnote}</p>}
    </form>
  );
}
