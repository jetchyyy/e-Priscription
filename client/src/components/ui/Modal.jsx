import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const sizes = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

/**
 * Accessible modal: focus trap, Esc to close, scroll lock.
 * Full-screen sheet on small screens, centered dialog from `sm` up.
 */
export function Modal({ open, onClose, title, description, children, footer, dismissible = true, size = 'md', className }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const focusables = () => [...panel.querySelectorAll(FOCUSABLE)];
    (focusables()[0] ?? panel).focus();

    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        closeRef.current?.();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return e.preventDefault();
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
      previouslyFocused?.focus?.();
    };
  }, [open, dismissible]);

  if (!open) return null;

  return createPortal(
    <div className="ody fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-[#152839]/50 transition-opacity"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex h-[100dvh] w-full flex-col bg-white shadow-2xl outline-none',
          'sm:h-auto sm:max-h-[92vh] sm:rounded-[20px] border border-[#dce1e8]',
          sizes[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-6">
          <div className="min-w-0">
            {title && <h2 id={titleId} className="font-display text-xl font-bold text-[#152839]">{title}</h2>}
            {description && <p className="mt-1 text-sm text-[#45546a]">{description}</p>}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#45546a] transition hover:bg-[#ece7de] hover:text-[#152839]"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <div className="border-t border-[#dce1e8] bg-[#f9f8f3] px-6 py-4 sm:rounded-b-[20px]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
