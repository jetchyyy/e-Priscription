import { useEffect, useState } from 'react';
import { Copy, Download, EllipsisVertical, Menu, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { closeInstallSheet, installRoute, isMobile, selectCanInstall, startInstall, useInstall } from './install';

const SNOOZE_KEY = 'eprx-install-snoozed-until';
const SNOOZE_DAYS = 14;
const BANNER_DELAY_MS = 4000;

const snoozed = () => {
  try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; }
};
const snooze = () => {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 864e5)); } catch { /* private mode */ }
};

const Key = ({ icon: Icon, children }) => (
  <span className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-[#dce1e8] bg-white px-1.5 py-0.5 align-middle text-[13px] font-semibold text-[#152839]">
    {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
    {children}
  </span>
);

const STEPS = {
  'ios-safari': [
    <>Tap the <Key icon={Share}>Share</Key> button. On iPhone it is at the bottom of Safari; on iPad, at the top.</>,
    <>Scroll down and tap <Key icon={PlusSquare}>Add to Home Screen</Key>.</>,
    <>Tap <Key>Add</Key>. E-Prescription now opens from your Home Screen like any app.</>,
  ],
  'ios-other': [
    <>Tap the <Key icon={Share}>Share</Key> button in the address bar.</>,
    <>Tap <Key icon={PlusSquare}>Add to Home Screen</Key>, then <Key>Add</Key>.</>,
    <>Don’t see it? Open this page in <strong>Safari</strong> and do the same there.</>,
  ],
  android: [
    <>Tap the browser menu <Key icon={EllipsisVertical}><span className="sr-only">More</span></Key> at the top right (in Samsung Internet, <Key icon={Menu}><span className="sr-only">Menu</span></Key> at the bottom).</>,
    <>Tap <Key>Install app</Key> or <Key>Add to Home screen</Key>.</>,
    <>Tap <Key>Install</Key>. The app appears on your Home screen and in your app list.</>,
  ],
  'mac-safari': [
    <>In the menu bar, choose <Key>File</Key> then <Key>Add to Dock</Key>.</>,
    <>Click <Key>Add</Key>. E-Prescription opens from your Dock in its own window.</>,
  ],
  'in-app': [
    <>This page is open inside another app (like Messenger or Facebook), which cannot install apps.</>,
    <>Tap the menu <Key>•••</Key> and choose <Key>Open in browser</Key> (or Safari / Chrome), or copy the link below and paste it there.</>,
    <>Then tap <strong>Install app</strong> again in your browser.</>,
  ],
};

/** Step-by-step install sheet for browsers without a native install prompt (iPhone, iPad, in-app browsers). */
function InstallSheet() {
  const open = useInstall((s) => s.open);
  const steps = STEPS[installRoute] ?? STEPS.android;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast.success('Link copied. Paste it into Safari or Chrome.');
    } catch {
      toast.error('Could not copy. Please copy the address by hand.');
    }
  };

  return (
    <Modal open={open} onClose={closeInstallSheet} size="sm" title="Install E-Prescription"
      description="Add it to your Home Screen. It opens full screen, like a regular app, with nothing to download from an app store.">
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-[#152839]">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#152839] text-sm font-bold text-[#f9f8f3]">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {installRoute === 'in-app' && (
        <Button variant="secondary" className="mt-6 w-full" onClick={copyLink}>
          <Copy className="h-4 w-4" aria-hidden="true" /> Copy link
        </Button>
      )}
      <Button className="mt-3 w-full" onClick={closeInstallSheet}>Got it</Button>
    </Modal>
  );
}

/** Bottom banner on phones, shown once after a short delay, then snoozed for two weeks when dismissed. */
function InstallBanner() {
  const canInstall = useInstall(selectCanInstall);
  const sheetOpen = useInstall((s) => s.open);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!canInstall || !isMobile || snoozed()) return undefined;
    const t = setTimeout(() => {
      // Patients opening a prescription link are mid-payment; let them finish. The footer still offers it.
      if (!window.location.pathname.startsWith('/rx/')) setShow(true);
    }, BANNER_DELAY_MS);
    return () => clearTimeout(t);
  }, [canInstall]);

  if (!show || !canInstall || sheetOpen) return null;

  const dismiss = () => { snooze(); setShow(false); };
  const install = () => { snooze(); setShow(false); startInstall(); };

  return (
    <div role="dialog" aria-label="Install the app"
      className="ody fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-[20px] border border-[#dce1e8] bg-white p-3 pl-4 shadow-2xl"
      style={{ marginBottom: 'var(--bottom-nav-h, env(safe-area-inset-bottom))' }}>
      <img src="/icon-192.png" alt="" width="44" height="44" className="h-11 w-11 shrink-0 rounded-[12px]" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[#152839]">Get the app</p>
        <p className="text-[13px] leading-snug text-[#45546a]">Open E-Prescription from your Home Screen.</p>
      </div>
      <Button size="sm" onClick={install}>Install</Button>
      <button type="button" onClick={dismiss} aria-label="Not now"
        className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#45546a] hover:bg-[#ece7de]">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

/** Mount once near the root. */
export function InstallAppPrompt() {
  return (
    <>
      <InstallBanner />
      <InstallSheet />
    </>
  );
}

/** An "Install app" control for menus and footers. Renders nothing once installed or when the browser cannot install. */
export function InstallAppButton({ className = 'font-semibold', variant = 'link' }) {
  const canInstall = useInstall(selectCanInstall);
  if (!canInstall) return null;
  if (variant === 'nav') {
    return (
      <button type="button" onClick={startInstall}
        className={cn('flex min-h-[40px] items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-[#152839] transition hover:bg-[#ece7de]/60', className)}>
        <Smartphone className="h-4 w-4 text-[#ff6f07]" aria-hidden="true" />
        <span>Install app</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={startInstall}
      className={cn('inline-flex items-center gap-1.5 underline-offset-2 hover:underline', className)}>
      <Download className="h-3.5 w-3.5" aria-hidden="true" /> Install the app
    </button>
  );
}
