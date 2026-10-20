import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

/** The ODYSSEY monogram (supplied artwork). Use the reversed file on navy. */
export function LogoMark({ className, light = false }) {
  return (
    <img
      src={light ? '/brand/odyssey-monogram-reverse.svg' : '/brand/odyssey-monogram.svg'}
      alt=""
      width="70"
      height="34"
      className={cn('h-8 w-auto', className)}
    />
  );
}

export function Logo({ to = '/', className, light = false }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-3', className)} aria-label="E-Prescription by ODYSSEY, home">
      <LogoMark light={light} />
      <span className="flex flex-col leading-tight">
        <span className={cn('font-display text-lg font-bold tracking-tight', light ? 'text-white' : 'text-[#152839]')}>
          E-Prescription
        </span>
        <span className={cn('text-xs font-medium', light ? 'text-white/70' : 'text-[#45546A]')}>by ODYSSEY</span>
      </span>
    </Link>
  );
}
