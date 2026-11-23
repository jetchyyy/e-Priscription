import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { env } from '../config/env';

// Cloudflare Turnstile: the bot check on public forms.
//
// The widget stays out of sight and only shows a box when Cloudflare needs the visitor to tick it. A form calls
// `ref.current.takeToken()` when it submits: that waits for a token if one is not ready yet, hands it over, and
// at once starts the next check. Each token works once, so after a wrong password or a failed check the next
// attempt already has a fresh one and nobody has to reload the page.
//
// Without VITE_TURNSTILE_SITE_KEY nothing is shown and takeToken() returns null (local development).

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const WAIT_MS = 30_000;
const RETRY_MS = 4_000;

export const turnstileEnabled = Boolean(env.turnstileSiteKey);

let scriptPromise = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_URL;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing')));
      s.onerror = () => {
        s.remove();
        scriptPromise = null; // the next try loads it again
        reject(new Error('Turnstile did not load'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export const Turnstile = forwardRef(function Turnstile({ action, className = '' }, ref) {
  const box = useRef(null);
  const widgetId = useRef(null);
  const token = useRef(null);
  const waiters = useRef([]);
  const [problem, setProblem] = useState(false);

  useEffect(() => {
    if (!turnstileEnabled) return undefined;
    let cancelled = false;
    let retryTimer = null;

    const retryLater = (fn) => {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { if (!cancelled) fn(); }, RETRY_MS);
    };

    const mount = () => {
      loadScript().then((ts) => {
        if (cancelled || !box.current || widgetId.current != null) return;
        widgetId.current = ts.render(box.current, {
          sitekey: env.turnstileSiteKey,
          action,
          appearance: 'interaction-only',
          retry: 'auto',
          'refresh-expired': 'auto',
          'refresh-timeout': 'auto',
          callback: (t) => {
            token.current = t;
            setProblem(false);
            waiters.current.splice(0).forEach((w) => w.resolve(t));
          },
          'expired-callback': () => { token.current = null; },
          'error-callback': () => {
            token.current = null;
            setProblem(true);
            // Some errors are not retried by Turnstile itself: start a new check after a short wait.
            retryLater(() => { if (widgetId.current != null && !token.current) window.turnstile?.reset(widgetId.current); });
            return true;
          },
        });
      }).catch(() => {
        if (cancelled) return;
        setProblem(true);
        retryLater(mount);
      });
    };
    mount();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (widgetId.current != null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
      token.current = null;
    };
  }, [action]);

  useImperativeHandle(ref, () => ({
    /** A one-use token for the server. Starts the next check right away. */
    async takeToken() {
      if (!turnstileEnabled) return null;
      const t = token.current ?? await new Promise((resolve, reject) => {
        const w = { resolve };
        waiters.current.push(w);
        setTimeout(() => {
          const i = waiters.current.indexOf(w);
          if (i >= 0) {
            waiters.current.splice(i, 1);
            reject(new Error('The security check is taking longer than usual. Please try again.'));
          }
        }, WAIT_MS);
      });
      token.current = null;
      if (widgetId.current != null) window.turnstile?.reset(widgetId.current);
      return t;
    },
  }), []);

  if (!turnstileEnabled) return null;
  return (
    <div className={className}>
      <div ref={box} />
      {problem && (
        <p role="status" className="mt-2 text-xs text-[#5f6a7c]">
          Checking that you are not a bot. This retries on its own.
        </p>
      )}
    </div>
  );
});
