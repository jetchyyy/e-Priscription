import { useLayoutEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { holdSplash, isSplashVisible } from '../../pwa/splash';

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <Loader2 className="h-5 w-5 animate-spin text-[#152839]" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Full-page loader for route chunks and the session check. While the launch splash (index.html) is still up it
 * renders nothing and keeps the splash on screen; after launch it shows the same orange bar as the splash.
 */
export function PageLoader({ label = 'Loading' }) {
  const [underSplash] = useState(isSplashVisible);
  useLayoutEffect(() => holdSplash(), []);

  if (underSplash) return <span className="sr-only">{label}</span>;

  return (
    <div role="status" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 animate-[page-loader-in_0.2s_ease-out_0.15s_both]">
      <img src="/favicon.svg" alt="" aria-hidden="true" className="h-10 w-10 opacity-90" />
      <span className="block h-1 w-20 overflow-hidden rounded-full bg-[#ece7de]" aria-hidden="true">
        <span className="block h-full w-2/5 rounded-full bg-[#ff6f07] animate-[page-loader-slide_1.3s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:animate-pulse" />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
