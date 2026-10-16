import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { PublicLayout } from '../components/layout/PublicLayout';
import { Button } from '../components/ui/Button';

export function NotFoundContent({ title = 'Page not found', message = 'The page you’re looking for doesn’t exist or the link is incorrect.' }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-brand-600 shadow-card ring-1 ring-ink-100">
        <SearchX className="h-10 w-10" aria-hidden="true" />
      </span>
      <p className="font-rx text-7xl font-bold text-brand-600/20">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink-900">{title}</h1>
      <p className="mt-2 max-w-md text-ink-500">{message}</p>
      <Link to="/" className="mt-6"><Button>Back to home</Button></Link>
    </div>
  );
}

export default function NotFound() {
  return (
    <PublicLayout>
      <NotFoundContent />
    </PublicLayout>
  );
}
