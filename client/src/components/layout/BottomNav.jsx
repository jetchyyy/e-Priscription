import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { cn } from '../../lib/utils';

const isTypingTarget = (el) =>
  el instanceof HTMLElement &&
  (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select') ||
    el.isContentEditable);

/**
 * Phone and tablet navigation pinned to the bottom of the screen (hidden from `lg` up).
 * Works in the browser and as an installed app: it pads for the home indicator through
 * env(safe-area-inset-bottom), and hides while the keyboard is up so forms keep their space.
 */
export function BottomNav({ items, onMore, moreOpen }) {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const onIn = (e) => setTyping(isTypingTarget(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  // Lets other fixed bottom elements (the install banner) sit above the bar.
  useEffect(() => {
    document.documentElement.classList.add('has-bottom-nav');
    return () => document.documentElement.classList.remove('has-bottom-nav');
  }, []);

  const itemClass = (active) =>
    cn(
      'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 text-[12px] font-semibold leading-none transition',
      active ? 'text-[#b8470a]' : 'text-[#45546a] active:bg-[#ece7de]',
    );

  return (
    <nav
      aria-label="Quick menu"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-[#dce1e8] bg-white/95 backdrop-blur lg:hidden',
        typing && 'hidden',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-xl">
        {items.map(({ to, label, short, icon: Icon, end, tourId }) => (
          <NavLink key={to} to={to} end={end} data-tour={tourId} className={({ isActive }) => itemClass(isActive)}>
            {({ isActive }) => (
              <>
                <span className={cn('flex h-8 w-12 items-center justify-center rounded-full', isActive && 'bg-[#fff3ea]')}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="truncate">{short ?? label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={onMore} aria-expanded={moreOpen} className={itemClass(moreOpen)}>
          <span className={cn('flex h-8 w-12 items-center justify-center rounded-full', moreOpen && 'bg-[#fff3ea]')}>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
