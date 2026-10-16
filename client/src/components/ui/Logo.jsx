import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export function LogoMark({ className }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 font-rx text-xl font-bold leading-none text-white shadow-glow',
        className,
      )}
      aria-hidden="true"
    >
      ℞
    </span>
  );
}

export function Logo({ to = '/', className, light = false }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5', className)} aria-label="E-Reseta home">
      <LogoMark />
      <span className={cn('font-display text-xl font-semibold tracking-tight', light ? 'text-white' : 'text-ink-900')}>
        E-<span className={light ? 'text-brand-300' : 'text-brand-600'}>Reseta</span>
      </span>
    </Link>
  );
}
