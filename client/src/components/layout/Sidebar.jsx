import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { X, Compass } from 'lucide-react';
import { cn } from '../../lib/utils';

function NavItems({ items, onNavigate, onOpenGuide }) {
  return (
    <div className="flex flex-col h-full justify-between">
      <nav aria-label="Main" className="flex flex-col gap-1.5">
        {items.map(({ to, label, icon: Icon, end, tourId }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            data-tour={tourId}
            className={({ isActive }) =>
              cn(
                'relative flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition',
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
            className="mt-2 flex min-h-[40px] items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-[#b8470a] hover:bg-[#ece7de]/60 transition"
          >
            <Compass className="h-4 w-4 text-[#ff6f07]" />
            <span>Setup guide</span>
          </button>
        )}
      </nav>

      <div className="mt-auto pt-6">
        <p className="rounded-xl bg-[#f9f8f3] p-3 text-[13px] leading-relaxed text-[#5f6a7c] border border-[#dce1e8]">
          Patient data is protected under the Data Privacy Act of 2012 (RA 10173).
        </p>
      </div>
    </div>
  );
}

/** Fixed sidebar on desktop, slide-in drawer below `lg`. */
export function Sidebar({ items, open, onClose, onOpenGuide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[248px] shrink-0 border-r border-[#dce1e8] bg-white p-4 lg:block">
        <NavItems items={items} onOpenGuide={onOpenGuide} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-[#152839]/50 transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white p-4 shadow-2xl flex flex-col border-r border-[#dce1e8]">
            <div className="mb-4 flex items-center justify-between pb-3 border-b border-[#dce1e8]">
              <span className="font-display text-lg font-bold text-[#152839]">Menu</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#45546a] hover:bg-[#ece7de]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavItems items={items} onNavigate={onClose} onOpenGuide={onOpenGuide} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
