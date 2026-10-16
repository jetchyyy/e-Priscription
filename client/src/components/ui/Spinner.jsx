import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner label={label} className="[&>svg]:h-8 [&>svg]:w-8" />
    </div>
  );
}
