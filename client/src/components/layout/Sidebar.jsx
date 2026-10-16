import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

function NavItems({ items, onNavigate }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition',
              isActive
                ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            )
          }
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Fixed sidebar on desktop, slide-in drawer below `lg`. */
export function Sidebar({ items, open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-ink-100 bg-white/60 p-4 lg:block">
        <NavItems items={items} />
        <p className="absolute bottom-4 left-4 right-4 rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-500">
          Patient data is protected under the Data Privacy Act of 2012 (RA 10173).
        </p>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-in bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-lg font-semibold">Menu</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation menu"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-600 hover:bg-ink-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavItems items={items} onNavigate={onClose} />
          </div>
        </div>
      )}
    </>
  );
}
