import { Fragment, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Lock, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { cn, formatDateTime } from '../../../lib/utils';
import { downloadCsv } from '../../../lib/csv';
import { exportAllAuditLogs, fetchAuditLogs, fetchAuditSummary } from '../api';

const CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'doctor', label: 'Doctor' },
  { key: 'prescription', label: 'Prescription' },
  { key: 'payment', label: 'Payment' },
  { key: 'billing', label: 'Billing' },
  { key: 'clinic', label: 'Clinic' },
  { key: 'security', label: 'Security' },
];

const WINDOWS = [
  { key: 'all', label: 'All time' },
  { key: '24h', label: 'Last 24 hours' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];

const PAGE_SIZES = [50, 100, 250];

const CATEGORY_LABEL = {
  doctor: 'Doctor',
  prescription: 'Prescription',
  payment: 'Payment',
  billing: 'Billing',
  clinic: 'Clinic',
  security: 'Security',
};

function categoryDotTone(cat) {
  if (cat === 'payment' || cat === 'security') return 'bg-[#ff6f07]';
  if (cat === 'prescription' || cat === 'clinic') return 'bg-[#152839]';
  return 'bg-[#5f6a7c]';
}

function windowBounds(win) {
  if (win === 'all') return { from: null, to: null };
  const now = Date.now();
  const ms = win === '24h' ? 86_400_000 : win === '7d' ? 7 * 86_400_000 : 30 * 86_400_000;
  return { from: new Date(now - ms).toISOString(), to: null };
}

function MetadataDetails({ metadata }) {
  const entries = Object.entries(metadata ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) {
    return <p className="text-[13px] text-[#5f6a7c]">No additional metadata recorded for this event.</p>;
  }
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 text-[13px]">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-2 border-b border-[#dce1e8]/70 pb-1">
          <dt className="text-[#5f6a7c]">{k.replace(/_/g, ' ')}</dt>
          <dd className="text-right font-medium text-[#152839] break-all tabular-nums">
            {Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminAuditLogs() {
  const [category, setCategory] = useState('');
  const [action, setAction] = useState('');
  const [windowKey, setWindowKey] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { from, to } = useMemo(() => windowBounds(windowKey), [windowKey]);
  const filterKey = useMemo(
    () => ({ category, action, search, from, to }),
    [category, action, search, from, to],
  );

  // Parallel load #1: summary counts, category totals, and distinct actions
  const summaryQ = useQuery({
    queryKey: ['admin', 'audit-summary', filterKey],
    queryFn: () => fetchAuditSummary(filterKey),
    refetchInterval: 30_000,
  });

  // Parallel load #2: O(1) keyset-paginated audit stream (supports >1,000+ rows cleanly)
  const logsQ = useInfiniteQuery({
    queryKey: ['admin', 'audit-logs', { ...filterKey, pageSize }],
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      fetchAuditLogs({
        ...filterKey,
        limit: pageSize,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => (lastPage?.has_more ? lastPage.next_cursor : undefined),
    refetchInterval: 30_000,
  });

  const rows = useMemo(
    () => (logsQ.data?.pages ?? []).flatMap((p) => p?.items ?? []),
    [logsQ.data],
  );

  const summary = summaryQ.data;
  const totalMatching = summary?.total_matching;
  const actions = summary?.actions ?? [];

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await exportAllAuditLogs({ ...filterKey, summary });
      if (all.length === 0) {
        toast.info('No matching audit events to export.');
        return;
      }
      downloadCsv(
        `odyssey-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          { label: 'Event ID', value: (r) => r.id },
          { label: 'Timestamp (UTC)', value: (r) => r.created_at },
          { label: 'Category', value: (r) => r.category },
          { label: 'Action', value: (r) => r.action },
          { label: 'Actor', value: (r) => r.actor_label },
          { label: 'Actor Role', value: (r) => r.actor_role },
          { label: 'Entity Type', value: (r) => r.entity_type },
          { label: 'Entity ID', value: (r) => r.entity_id },
          { label: 'Summary', value: (r) => r.summary },
          { label: 'Metadata', value: (r) => JSON.stringify(r.metadata ?? {}) },
        ],
        all,
      );
      toast.success(`Exported ${all.length} immutable audit log${all.length === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(err?.message || 'Could not export audit logs.');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setCategory('');
    setAction('');
    setWindowKey('all');
    setSearchInput('');
    setSearch('');
  };

  const hasFilters = Boolean(category || action || search || windowKey !== 'all');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[32px] font-bold text-[#152839]">Audit logs</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#45546a]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#152839]">
              <Lock className="h-4 w-4 text-[#152839]" aria-hidden="true" />
              Append-only &amp; immutable
            </span>
            <span>· Keyset-indexed stream built for parallel loading past 1,000+ records.</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-2 rounded-full border border-[#dce1e8] bg-white px-3.5 py-1.5 text-[13px] text-[#45546a]">
            <span>Batch size</span>
            <select
              aria-label="Rows per load"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-transparent font-semibold text-[#152839] focus:outline-none"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <Button variant="secondary" size="sm" loading={exporting} onClick={handleExport}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Parallel-loaded summary strip */}
      <div className="grid grid-cols-1 divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5 sm:p-6">
          <p className="text-sm font-medium text-[#45546a]">Total immutable records</p>
          <p className="mt-1.5 font-display text-[28px] font-bold tabular-nums text-[#152839]">
            {summaryQ.isLoading ? '—' : (summary?.total_all ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <p className="text-sm font-medium text-[#45546a]">Last 24 hours</p>
          <p className="mt-1.5 font-display text-[28px] font-bold tabular-nums text-[#152839]">
            {summaryQ.isLoading ? '—' : (summary?.last_24h ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <p className="text-sm font-medium text-[#45546a]">Loaded / matching filter</p>
          <p className="mt-1.5 font-display text-[28px] font-bold tabular-nums text-[#152839]">
            {rows.length.toLocaleString()}
            {totalMatching != null && (
              <span className="ml-1.5 text-base font-normal text-[#5f6a7c]">
                of {Number(totalMatching).toLocaleString()}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-[20px] border border-[#dce1e8] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter by category">
          {CATEGORIES.map((c) => (
            <button
              key={c.key || 'all'}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                'min-h-[38px] rounded-full px-3.5 text-[13px] font-semibold transition',
                category === c.key ? 'bg-[#152839] text-[#f9f8f3]' : 'bg-[#f9f8f3] text-[#45546a] hover:bg-[#ece7de]',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-12">
          <div className="relative md:col-span-6">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6a7c]" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search audit logs"
              placeholder="Search actor, action, entity ID, or summary…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="min-h-[44px] w-full rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] pl-10 pr-4 text-sm text-[#152839] placeholder:text-[#5f6a7c] focus:border-[#ff6f07] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff6f07]/20"
            />
          </div>

          <div className="md:col-span-3">
            <select
              aria-label="Filter by action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="min-h-[44px] w-full rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] px-3.5 text-sm text-[#152839] focus:border-[#ff6f07] focus:bg-white focus:outline-none"
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              aria-label="Filter by time window"
              value={windowKey}
              onChange={(e) => setWindowKey(e.target.value)}
              className="min-h-[44px] w-full rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] px-3.5 text-sm text-[#152839] focus:border-[#ff6f07] focus:bg-white focus:outline-none"
            >
              {WINDOWS.map((w) => (
                <option key={w.key} value={w.key}>{w.label}</option>
              ))}
            </select>
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-end">
            <button type="button" onClick={clearFilters} className="text-[13px] font-semibold text-[#b8470a] hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Stream states */}
      {logsQ.isError ? (
        <div role="alert" className="rounded-[18px] border border-[#f3c2af] bg-[#fbe9e1] p-5 text-sm text-[#7a2406]">
          We couldn’t load the audit logs. Has migration 0014 been applied?
          <button type="button" className="ml-2 font-semibold underline" onClick={() => logsQ.refetch()}>
            Try again
          </button>
        </div>
      ) : logsQ.isLoading || !logsQ.data ? (
        <div className="rounded-[20px] border border-[#dce1e8] bg-white p-6 space-y-3" aria-label="Loading audit logs">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-[#ece7de]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[20px] border border-[#dce1e8] bg-white p-12 text-center text-sm text-[#5f6a7c]">
          {hasFilters
            ? 'No audit events match your current filters.'
            : 'No audit events recorded yet. New doctor, prescription, payment, and admin actions appear here automatically.'}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-[20px] border border-[#dce1e8] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#dce1e8] bg-[#f9f8f3] text-[13px] font-semibold text-[#45546a]">
                  <tr>
                    <th className="py-3.5 pl-5 pr-3">When</th>
                    <th className="py-3.5 px-3">Category</th>
                    <th className="py-3.5 px-3">Event</th>
                    <th className="py-3.5 px-3">Actor</th>
                    <th className="py-3.5 pl-3 pr-5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dce1e8]">
                  {rows.map((r) => {
                    const isOpen = expandedIds.has(r.id);
                    return (
                      <Fragment key={r.id}>
                        <tr className="hover:bg-[#f9f8f3]/70">
                          <td className="whitespace-nowrap py-3.5 pl-5 pr-3 align-top tabular-nums">
                            <span className="block font-medium text-[#152839]">{formatDateTime(r.created_at)}</span>
                            <span className="text-[13px] text-[#5f6a7c]">#{r.id}</span>
                          </td>
                          <td className="whitespace-nowrap py-3.5 px-3 align-top">
                            <span className="inline-flex items-center gap-2 text-[#152839]">
                              <span className={cn('h-2.5 w-2 rounded-[47%/35.6%]', categoryDotTone(r.category))} aria-hidden="true" />
                              {CATEGORY_LABEL[r.category] ?? r.category}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 align-top">
                            <p className="font-medium text-[#152839]">{r.summary}</p>
                            <p className="mt-0.5 text-[13px] text-[#5f6a7c]">
                              {r.action} · {r.entity_type} {r.entity_id}
                            </p>
                          </td>
                          <td className="py-3.5 px-3 align-top">
                            <span className="block font-medium text-[#152839]">{r.actor_label}</span>
                            <span className="text-[13px] text-[#5f6a7c]">{r.actor_role}</span>
                          </td>
                          <td className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right align-top">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(r.id)}
                              aria-expanded={isOpen}
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-[#152839] hover:bg-[#ece7de]"
                            >
                              {isOpen ? (
                                <>
                                  Hide <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                </>
                              ) : (
                                <>
                                  Inspect <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-[#f9f8f3]">
                            <td colSpan={5} className="px-5 py-4">
                              <MetadataDetails metadata={r.metadata} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => {
              const isOpen = expandedIds.has(r.id);
              return (
                <li key={r.id} className="rounded-[20px] border border-[#dce1e8] bg-white p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="inline-flex items-center gap-2 font-medium text-[#152839]">
                      <span className={cn('h-2.5 w-2 rounded-[47%/35.6%]', categoryDotTone(r.category))} aria-hidden="true" />
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                    <span className="tabular-nums text-[#5f6a7c]">#{r.id} · {formatDateTime(r.created_at)}</span>
                  </div>

                  <p className="text-sm font-medium text-[#152839]">{r.summary}</p>
                  <p className="text-[13px] text-[#5f6a7c]">
                    {r.action} · {r.entity_type} {r.entity_id}
                  </p>

                  <div className="flex items-center justify-between gap-2 border-t border-[#dce1e8] pt-2.5 text-[13px]">
                    <span className="text-[#45546a]">
                      <strong className="text-[#152839]">{r.actor_label}</strong> ({r.actor_role})
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(r.id)}
                      aria-expanded={isOpen}
                      className="min-h-[36px] rounded-full px-3 font-semibold text-[#152839] hover:bg-[#ece7de]"
                    >
                      {isOpen ? 'Hide' : 'Inspect'}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="rounded-xl bg-[#f9f8f3] p-3">
                      <MetadataDetails metadata={r.metadata} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Keyset pagination controls past 1,000+ rows */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-[20px] border border-[#dce1e8] bg-white px-5 py-4 sm:flex-row">
            <p className="text-sm tabular-nums text-[#45546a]">
              Showing <strong className="text-[#152839]">{rows.length.toLocaleString()}</strong>
              {totalMatching != null ? ` of ${Number(totalMatching).toLocaleString()} matching events` : ' events'}
            </p>

            {logsQ.hasNextPage ? (
              <Button
                variant="primary"
                size="sm"
                loading={logsQ.isFetchingNextPage}
                onClick={() => logsQ.fetchNextPage()}
              >
                {logsQ.isFetchingNextPage ? 'Loading…' : `Load ${pageSize} more`}
              </Button>
            ) : (
              <span className="text-[13px] text-[#5f6a7c]">End of matching audit records</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
