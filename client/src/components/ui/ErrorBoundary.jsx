import { useRouteError, Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './Button';

export function RouteErrorFallback() {
  const error = useRouteError();
  console.error('Route error caught by ErrorBoundary:', error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f9f8f3] px-4 py-12">
      <div className="w-full max-w-md rounded-[20px] border border-[#dce1e8] bg-white p-8 text-center">
        <span className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fbe9e1] text-[#a3330a]">
          <AlertTriangle className="h-8 w-8" />
        </span>
        <h1 className="font-display text-2xl font-bold text-[#152839]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#45546a]">
          {error?.message || 'An unexpected application error occurred.'}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" /> Reload Page
          </Button>
          <Link to="/">
            <Button variant="secondary">
              <Home className="h-4 w-4" /> Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
