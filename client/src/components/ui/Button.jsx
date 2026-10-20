import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const variants = {
  primary:
    'bg-[#152839] text-[#f9f8f3] hover:bg-[#22405a] active:scale-[.98]',
  accent:
    'bg-[#ff6f07] text-[#152839] hover:bg-[#ff8a33] active:scale-[.98]',
  secondary:
    'bg-[#ece7de] text-[#152839] hover:bg-[#ffffff] border border-[#dce1e8] active:scale-[.98]',
  ghost:
    'text-[#45546a] hover:text-[#152839] hover:underline underline-offset-4 active:scale-[.98]',
  danger:
    'bg-[#fbe9e1] text-[#7a2406] border border-[#f3c2af] hover:bg-[#f7d6c8] active:scale-[.98]',
  dark:
    'bg-[#152839] text-[#f9f8f3] hover:bg-[#0d1b28] active:scale-[.98]',
};

const sizes = {
  sm: 'min-h-[40px] px-4 text-sm gap-1.5',
  md: 'min-h-[48px] px-6 text-[15px] gap-2',
  lg: 'min-h-[52px] px-8 text-base gap-2',
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
        'inline-flex select-none items-center justify-center rounded-full font-semibold transition duration-150',
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
