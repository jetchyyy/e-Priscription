import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Logo } from '../ui/Logo';

/** Simple chrome for public pages (patient view, register, 404). */
export function PublicLayout({ children, maxWidth = 'max-w-3xl' }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f9f8f3] text-[#152839]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dce1e8] bg-white px-3 py-1.5 text-xs font-medium text-[#45546a]">
          <Lock className="h-3.5 w-3.5 text-[#ff6f07]" aria-hidden="true" /> Secure connection
        </span>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 pb-10 sm:px-6 ${maxWidth}`}>{children}</main>
      <footer className="px-4 pb-8 text-center text-xs leading-relaxed text-[#5f6a7c]">
        <p>
          Prescriptions contain personal health information protected under the{' '}
          <strong className="font-medium text-[#152839]">Data Privacy Act of 2012 (RA 10173)</strong>.
        </p>
        <p className="mt-1">
          <Link to="/" className="underline decoration-[#dce1e8] underline-offset-2 hover:text-[#152839]">E-Prescription by ODYSSEY</Link>
          {' · '}We never share your prescription without your link.
        </p>
      </footer>
    </div>
  );
}
