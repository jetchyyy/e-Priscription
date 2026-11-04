import { create } from 'zustand';

const hasDom = typeof window !== 'undefined';
const nav = hasDom ? window.navigator : {};
const ua = nav.userAgent ?? '';
const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
const android = /Android/i.test(ua);
// Facebook, Messenger, Instagram, TikTok and other in-app browsers cannot install apps.
const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|BytedanceWebview/i.test(ua);
const macSafari = !ios && /Macintosh/.test(ua) && /Version\/\d+.*Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);

/**
 * How this device installs the app, which picks the instructions to show.
 * 'ios-safari' | 'ios-other' | 'in-app' | 'android' | 'mac-safari' | null (no install route we can explain)
 */
export const installRoute = inApp
  ? 'in-app'
  : ios
    ? (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari')
    : android
      ? 'android'
      : macSafari ? 'mac-safari' : null;

export const isMobile = ios || android;

/** True when running as the installed app, not in a browser tab. */
export const isStandalone = () =>
  hasDom && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

/** deferred: Chrome/Edge/Samsung's saved install prompt. open: the instructions sheet. */
export const useInstall = create(() => ({ deferred: null, installed: isStandalone(), open: false }));

/** True when we can offer an install: either a native prompt or steps for this browser. */
export const selectCanInstall = (s) => !s.installed && Boolean(s.deferred || installRoute);

/** Call once before React renders, so the early `beforeinstallprompt` event is not missed. */
export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // We show our own button and banner instead of Chrome's mini bar.
    useInstall.setState({ deferred: e });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ installed: true, deferred: null, open: false }));

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

/** Show the native install prompt where there is one, otherwise the step-by-step sheet. */
export async function startInstall() {
  const { deferred } = useInstall.getState();
  if (!deferred) {
    useInstall.setState({ open: true });
    return;
  }
  useInstall.setState({ deferred: null }); // A prompt can only be used once.
  try {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') useInstall.setState({ installed: true });
  } catch {
    useInstall.setState({ open: true });
  }
}

export const closeInstallSheet = () => useInstall.setState({ open: false });
