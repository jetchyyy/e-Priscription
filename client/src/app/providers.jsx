import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/authStore';
import { isConfigured } from '../config/env';

function ConfigBanner() {
  if (isConfigured) return null;
  return (
    <div role="alert" className="fixed inset-x-0 bottom-0 z-[60] flex items-start gap-3 bg-amber-100 px-4 py-3 text-sm text-amber-900 shadow-2xl ring-1 ring-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>Supabase isn’t connected yet.</strong> Copy <code className="rounded bg-amber-200/70 px-1">client/.env.example</code> to{' '}
        <code className="rounded bg-amber-200/70 px-1">client/.env</code>, add your project URL and anon key, then restart the dev server. See the README.
      </p>
    </div>
  );
}

export function Providers({ children }) {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      <ConfigBanner />
    </QueryClientProvider>
  );
}
