import { ExternalLink, FileText } from 'lucide-react';
import { Card, EmptyState } from '../../../components/ui/Card';
import { PaymentBadge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { formatPeso, formatShortDate, rxLink } from '../../../lib/utils';
import { CopyLinkButton, ShareLinkButton } from './CopyLinkButton';
import { Link } from 'react-router-dom';

function Actions({ id }) {
  const link = rxLink(id);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyLinkButton link={link} />
      <ShareLinkButton link={link} size="sm" />
      <a href={link} target="_blank" rel="noreferrer" aria-label="Open patient view in a new tab"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100">
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}

/** Table on md+, stacked cards below md. */
export function PrescriptionHistory({ items, loading }) {
  if (loading) {
    return (
      <Card className="space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-ink-100" />)}
      </Card>
    );
  }

  if (!items?.length) {
    return (
      <Card>
        <EmptyState icon={FileText} title="No prescriptions yet"
          action={<Link to="/doctor/new"><Button>Write your first prescription</Button></Link>}>
          Prescriptions you issue will appear here with their payment status and shareable link.
        </EmptyState>
      </Card>
    );
  }

  return (
    <>
      <Card className="hidden overflow-hidden !p-0 md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Issued prescriptions</caption>
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">Patient</th>
              <th scope="col" className="px-5 py-3 font-semibold">Issued</th>
              <th scope="col" className="px-5 py-3 font-semibold">Fee</th>
              <th scope="col" className="px-5 py-3 font-semibold">Status</th>
              <th scope="col" className="px-5 py-3 font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {items.map((rx) => (
              <tr key={rx.id} className="transition hover:bg-ink-50/60">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-ink-900">{rx.patient_name}</p>
                  {rx.diagnosis && <p className="max-w-xs truncate text-xs text-ink-500">{rx.diagnosis}</p>}
                </td>
                <td className="px-5 py-3.5 text-ink-600">{formatShortDate(rx.created_at)}</td>
                <td className="px-5 py-3.5 text-ink-600">{formatPeso(rx.amount)}</td>
                <td className="px-5 py-3.5"><PaymentBadge status={rx.payment_status} /></td>
                <td className="px-5 py-3.5"><Actions id={rx.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ul className="space-y-3 md:hidden">
        {items.map((rx) => (
          <li key={rx.id}>
            <Card className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{rx.patient_name}</p>
                  <p className="text-xs text-ink-500">{formatShortDate(rx.created_at)} · {formatPeso(rx.amount)}</p>
                </div>
                <PaymentBadge status={rx.payment_status} />
              </div>
              {rx.diagnosis && <p className="mt-2 line-clamp-2 text-sm text-ink-600">{rx.diagnosis}</p>}
              <div className="mt-3"><Actions id={rx.id} /></div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
