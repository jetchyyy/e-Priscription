import { useRouteError, Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './Button';

export function RouteErrorFallback() {
  const error = useRouteError();
  console.error('Route error caught by ErrorBoundary:', error);

  return (
    <div className="mesh-bg flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 ring-1 ring-rose-200">
          <AlertTriangle className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-bold text-ink-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-600">
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
