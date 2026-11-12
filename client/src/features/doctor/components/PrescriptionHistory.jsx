import { useState, useMemo } from 'react';
import { ExternalLink, FilePlus2, FlaskConical, Search } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { PaymentBadge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Ody } from '../../marketing/components';
import { formatPeso, formatShortDate, rxLink } from '../../../lib/utils';
import { CopyLinkButton, ShareLinkButton } from './CopyLinkButton';
import { Link } from 'react-router-dom';

function Actions({ id }) {
  const link = rxLink(id);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyLinkButton link={link} />
      <ShareLinkButton link={link} size="sm" />
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[#dce1e8] bg-white px-4 text-sm font-semibold text-[#152839] hover:bg-[#ece7de] transition"
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" /> View
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}

function LabBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-[#eef3fb] px-2 py-0.5 align-middle text-[11px] font-semibold uppercase tracking-wide text-[#1f4f8a]">
      Lab
    </span>
  );
}

const STATUS_FILTERS = [['all', 'All'], ['paid', 'Paid'], ['waiting', 'Waiting']];
const TYPE_FILTERS = [['all', 'All'], ['rx', 'Prescriptions'], ['lab', 'Lab requests']];

function FilterPills({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5 rounded-[22px] border border-[#dce1e8] bg-white p-1">
      {options.map(([mode, text]) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={`min-h-[36px] rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            value === mode
              ? 'bg-[#152839] text-[#f9f8f3]'
              : 'text-[#45546a] hover:bg-[#ece7de]'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Prescriptions and lab requests with search, type and status filters, a table, and a mobile card view. */
export function PrescriptionHistory({ items = [], loading }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'paid' | 'waiting'
  const [type, setType] = useState('all'); // 'all' | 'rx' | 'lab'

  const filtered = useMemo(() => {
    return items.filter((rx) => {
      const matchSearch = !search.trim() || rx.patient_name?.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        filter === 'all' ||
        (filter === 'paid' && rx.payment_status === 'paid') ||
        (filter === 'waiting' && rx.payment_status !== 'paid');
      const isLab = rx.kind === 'lab';
      const matchType = type === 'all' || (type === 'lab' ? isLab : !isLab);
      return matchSearch && matchStatus && matchType;
    });
  }, [items, search, filter, type]);

  if (loading) {
    return (
      <div className="rounded-[20px] border border-[#dce1e8] bg-white p-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-[#ece7de] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#dce1e8] bg-white p-12 text-center">
        <Ody mood="happy" alt="Ody mascot" className="w-28 mb-4" />
        <h3 className="font-display text-lg font-semibold text-[#152839]">
          Nothing here yet.
        </h3>
        <p className="mt-1.5 max-w-sm text-sm text-[#45546a]">
          Your prescriptions and lab requests will show here. You will see if the patient has paid, and you can send the link again.
        </p>
        <div className="mt-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link to="/doctor/new">
            <Button variant="accent" className="w-full">
              <FilePlus2 className="h-4 w-4" aria-hidden="true" /> New prescription
            </Button>
          </Link>
          <Link to="/doctor/lab-request">
            <Button variant="secondary" className="w-full">
              <FlaskConical className="h-4 w-4" aria-hidden="true" /> New lab request
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and status filter bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6a7c]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient name…"
            className="w-full rounded-[18px] border border-[#dce1e8] bg-white pl-10 pr-4 py-2 text-sm text-[#152839] placeholder:text-[#5f6a7c] focus:outline-none focus:border-[#ff6f07] focus:ring-2 focus:ring-[#ff6f07]/20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPills label="Type" options={TYPE_FILTERS} value={type} onChange={setType} />
          <FilterPills label="Payment status" options={STATUS_FILTERS} value={filter} onChange={setFilter} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[20px] border border-[#dce1e8] bg-white p-8 text-center text-sm text-[#5f6a7c]">
          Nothing matches your search.
        </div>
      ) : (
        <>
          {/* Desktop Table (section 11.4) */}
          <div className="hidden overflow-hidden rounded-[20px] border border-[#dce1e8] bg-white md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Prescriptions and lab requests</caption>
              <thead className="bg-[#f9f8f3] text-xs font-semibold uppercase tracking-wider text-[#5f6a7c] border-b border-[#dce1e8]">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Date</th>
                  <th scope="col" className="px-6 py-3.5">Patient</th>
                  <th scope="col" className="px-6 py-3.5">Ref. No.</th>
                  <th scope="col" className="px-6 py-3.5">Fee</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dce1e8]">
                {filtered.map((rx) => (
                  <tr key={rx.id} className="hover:bg-[#f9f8f3]/60 transition">
                    <td className="px-6 py-4 text-[#5f6a7c] whitespace-nowrap">{formatShortDate(rx.created_at)}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-[#152839]">{rx.patient_name}{rx.kind === 'lab' && <LabBadge />}</p>
                      {rx.diagnosis && <p className="text-xs text-[#5f6a7c] truncate max-w-xs">{rx.diagnosis}</p>}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-[#5f6a7c]">
                      {rx.id.slice(0, 8)}
                    </td>
                    <td className="px-6 py-4 tabular-nums font-semibold text-[#152839]">{formatPeso(rx.amount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <PaymentBadge status={rx.payment_status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Actions id={rx.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards (section 11.4: each row becomes a white card) */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((rx) => (
              <li key={rx.id}>
                <div className="rounded-[20px] border border-[#dce1e8] bg-white p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#152839]">{rx.patient_name}{rx.kind === 'lab' && <LabBadge />}</p>
                      <p className="text-xs text-[#5f6a7c]">
                        {formatShortDate(rx.created_at)} · {formatPeso(rx.amount)}
                      </p>
                    </div>
                    <PaymentBadge status={rx.payment_status} />
                  </div>
                  {rx.diagnosis && (
                    <p className="text-xs text-[#5f6a7c]">{rx.diagnosis}</p>
                  )}
                  <div className="pt-2 border-t border-[#dce1e8] flex flex-col gap-2">
                    <Actions id={rx.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
