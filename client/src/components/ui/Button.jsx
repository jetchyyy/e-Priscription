import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const variants = {
  primary:
    'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-glow hover:from-brand-400 hover:to-brand-600 active:scale-[.98]',
  secondary: 'bg-white text-ink-800 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 active:scale-[.98]',
  ghost: 'text-ink-700 hover:bg-ink-100 active:scale-[.98]',
  danger: 'bg-rose-600 text-white shadow-[0_8px_20px_-6px_rgb(225_29_72/.5)] hover:bg-rose-500 active:scale-[.98]',
  dark: 'bg-ink-900 text-white hover:bg-ink-800 active:scale-[.98]',
};

const sizes = {
  sm: 'min-h-10 px-3.5 text-sm gap-1.5',
  md: 'min-h-11 px-5 text-[15px] gap-2',
  lg: 'min-h-12 px-7 text-base gap-2',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-xl font-semibold transition duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
