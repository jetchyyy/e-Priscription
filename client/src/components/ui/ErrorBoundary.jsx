import { useState } from 'react';
import { useRouteError, Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { PageLoader } from './Spinner';
import { forceReload, isChunkLoadError, reloadOnce } from '../../lib/chunkReload';

export function RouteErrorFallback() {
  const error = useRouteError();
  const chunkError = isChunkLoadError(error);
  // A stale page after a deploy: reload quietly into the new version instead of showing an error.
  const [reloading] = useState(() => chunkError && navigator.onLine !== false && reloadOnce());

  if (reloading) return <PageLoader label="Updating the app" />;
  if (chunkError) return <ChunkErrorScreen />;

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

/** Shown when part of the app couldn't be downloaded and an automatic reload didn't fix it. */
function ChunkErrorScreen() {
  const offline = navigator.onLine === false;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f9f8f3] px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#ece7de] text-[#152839]">
          {offline ? <WifiOff className="h-6 w-6" aria-hidden="true" /> : <RefreshCw className="h-6 w-6" aria-hidden="true" />}
        </span>
        <h1 className="font-display text-xl font-semibold text-[#152839]">
          {offline ? 'You\u2019re offline' : 'Couldn\u2019t load this page'}
        </h1>
        <p className="mt-2 text-sm text-[#5f6a7c]">
          {offline
            ? 'Check your mobile data or Wi-Fi, then try again.'
            : 'The app may have just been updated. Try again to load the latest version.'}
        </p>
        <button
          type="button"
          onClick={forceReload}
          className="mt-6 rounded-full bg-[#ff6f07] px-7 py-2.5 text-sm font-semibold text-white active:bg-[#e05f00]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
