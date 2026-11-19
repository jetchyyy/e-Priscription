import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { X, Compass } from 'lucide-react';
import { cn } from '../../lib/utils';
import { InstallAppButton } from '../../pwa/InstallApp';

// Short screens (small phones, laptops with a short window) get tighter rows so the whole menu fits.
const SHORT = '[@media(max-height:760px)]:';

function NavItems({ items, onNavigate, onOpenGuide }) {
  return (
    <div className="flex min-h-full flex-col">
      <nav aria-label="Main" className={`flex flex-col gap-1 ${SHORT}gap-0.5`}>
        {items.map(({ to, label, icon: Icon, end, tourId, heading }) => heading ? (
          <p
            key={`h-${heading}`}
            className={`mt-4 px-3.5 pb-0.5 text-xs font-semibold uppercase tracking-wider text-[#5f6a7c] ${SHORT}mt-2`}
          >
            {heading}
          </p>
        ) : (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            data-tour={tourId}
            className={({ isActive }) =>
              cn(
                `relative flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition ${SHORT}min-h-[40px]`,
                isActive
                  ? 'bg-[#ece7de] text-[#152839] font-semibold'
                  : 'text-[#45546a] hover:bg-[#ece7de]/60 hover:text-[#152839]',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="h-2 w-1.5 rounded-[47%/35.6%] bg-[#ff6f07] mr-[-4px]"
                    aria-hidden="true"
                  />
                )}
                <Icon className="h-5 w-5 shrink-0 text-[#152839]" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {onOpenGuide && (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              onOpenGuide();
            }}
            className={`mt-2 flex min-h-[40px] items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-[#b8470a] hover:bg-[#ece7de]/60 transition ${SHORT}mt-1`}
          >
            <Compass className="h-4 w-4 text-[#ff6f07]" aria-hidden="true" />
            <span>Setup guide</span>
          </button>
        )}
      </nav>

      <div className={`mt-auto pt-6 ${SHORT}pt-3`}>
        <InstallAppButton variant="nav" className="mb-3 w-full" />
        <p className={`rounded-xl border border-[#dce1e8] bg-[#f9f8f3] p-3 text-[13px] leading-relaxed text-[#5f6a7c] ${SHORT}p-2.5 ${SHORT}text-xs`}>
          Patient data is protected under the Data Privacy Act of 2012 (RA 10173).
        </p>
      </div>
    </div>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Fixed sidebar from `lg` up (scrolls on its own when the window is short), slide-in drawer below `lg`.
 * The drawer is a modal: the page behind does not scroll, Tab stays inside it, Esc or a tap outside closes it,
 * and focus goes back to the button that opened it.
 */
export function Sidebar({ items, open, onClose, onOpenGuide }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const focusables = () => [...(panel?.querySelectorAll(FOCUSABLE) ?? [])];
    (panel?.querySelector('[aria-current="page"]') ?? focusables()[0])?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <>
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[248px] shrink-0 overflow-y-auto overscroll-contain border-r border-[#dce1e8] bg-white p-4 lg:block">
        <NavItems items={items} onOpenGuide={onOpenGuide} />
      </aside>

      <div
        className={cn('fixed inset-0 z-40 lg:hidden', open ? 'visible' : 'invisible pointer-events-none')}
        aria-hidden={!open}
      >
        <div
          className={cn('absolute inset-0 bg-[#152839]/50 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cn(
            'absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col border-r border-[#dce1e8] bg-white shadow-2xl',
            'transition-transform duration-200 ease-out motion-reduce:transition-none',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            paddingLeft: 'max(1rem, env(safe-area-inset-left))',
            paddingRight: '1rem',
          }}
        >
          <div className={`mb-3 flex items-center justify-between border-b border-[#dce1e8] pb-3 ${SHORT}mb-2 ${SHORT}pb-2`}>
            <span className="font-display text-lg font-bold text-[#152839]">Menu</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#45546a] hover:bg-[#ece7de]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
            {open && <NavItems items={items} onNavigate={onClose} onOpenGuide={onOpenGuide} />}
          </div>
        </div>
      </div>
    </>
  );
}
