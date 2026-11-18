import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilePlus2, FlaskConical } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { PrescriptionHistory } from '../components/PrescriptionHistory';
import { PaymentsToConfirm } from '../components/PaymentsToConfirm';
import { ClinicNotices, PlanUsage } from '../components/PlanUsage';
import { fetchDoctorMonthSummary, fetchMyPrescriptionsPage } from '../api';
import { useAuthStore } from '../../../store/authStore';
import { doctorTitle, formatPeso } from '../../../lib/utils';

function getManilaGreeting() {
  const hour = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false });
  const h = parseInt(hour, 10);
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DoctorDashboard() {
  const profile = useAuthStore((s) => s.profile);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [filter, setFilter] = useState('all');
  const [pageSize, setPageSize] = useState(15);
  const [nav, setNav] = useState({ page: 1, direction: 'jump', cursorAt: null, cursorId: null });

  useEffect(() => {
    const id = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== search) {
        setSearch(trimmed);
        setNav({ page: 1, direction: 'jump', cursorAt: null, cursorId: null });
      }
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput, search]);

  const summaryQ = useQuery({
    queryKey: ['doctor', 'month-summary'],
    queryFn: fetchDoctorMonthSummary,
    refetchInterval: 15_000,
  });

  const pageQ = useQuery({
    queryKey: ['doctor', 'prescriptions-page', { page: nav.page, pageSize, search, type, filter, direction: nav.direction, cursorId: nav.cursorId }],
    queryFn: () =>
      fetchMyPrescriptionsPage({
        limit: pageSize,
        page: nav.page,
        cursorAt: nav.cursorAt,
        cursorId: nav.cursorId,
        direction: nav.direction,
        search,
        kind: type,
        status: filter,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  const pageData = pageQ.data;
  const items = pageData?.items ?? [];
  const waiting = summaryQ.data?.waiting_count ?? 0;
  const collected = summaryQ.data?.collected_amount ?? 0;

  const handleTypeChange = (nextType) => {
    setType(nextType);
    setNav({ page: 1, direction: 'jump', cursorAt: null, cursorId: null });
  };

  const handleFilterChange = (nextFilter) => {
    setFilter(nextFilter);
    setNav({ page: 1, direction: 'jump', cursorAt: null, cursorId: null });
  };

  const handlePageSizeChange = (nextSize) => {
    setPageSize(nextSize);
    setNav({ page: 1, direction: 'jump', cursorAt: null, cursorId: null });
  };

  const handlePageChange = (targetPage) => {
    const currentPage = pageData?.page ?? nav.page;
    if (targetPage === currentPage + 1 && pageData?.last_cursor) {
      setNav({
        page: targetPage,
        direction: 'next',
        cursorAt: pageData.last_cursor.created_at,
        cursorId: pageData.last_cursor.id,
      });
      return;
    }
    if (targetPage === currentPage - 1 && pageData?.first_cursor && targetPage > 1) {
      setNav({
        page: targetPage,
        direction: 'prev',
        cursorAt: pageData.first_cursor.created_at,
        cursorId: pageData.first_cursor.id,
      });
      return;
    }
    setNav({ page: targetPage, direction: 'jump', cursorAt: null, cursorId: null });
  };

  const greeting = getManilaGreeting();
  const doctorName = profile?.full_name ? doctorTitle(profile.full_name) : 'Doctor';

  return (
    <div className="space-y-6">
      {/* Header row (section 11.4) */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-bold text-[#152839] leading-tight">
            {greeting}, {doctorName}
          </h1>
          <p className="mt-1 text-sm text-[#45546a]">
            {[
              profile?.specialty,
              profile?.clinic_name,
              profile?.prc_no && `PRC Lic. ${profile.prc_no}`,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Link to="/doctor/profile">
          <Button variant="secondary">My details</Button>
        </Link>
      </div>

      {/* The two main jobs, big and first */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          to="/doctor/new"
          className="flex min-h-[72px] items-center gap-4 rounded-[20px] bg-[#ff6f07] px-6 py-4 text-[#152839] transition hover:bg-[#ff8a33] active:scale-[.99]"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/70">
            <FilePlus2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-display text-lg font-bold">New prescription</span>
            <span className="block text-sm">Write medicines for a patient</span>
          </span>
        </Link>
        <Link
          to="/doctor/lab-request"
          className="flex min-h-[72px] items-center gap-4 rounded-[20px] border border-[#dce1e8] bg-white px-6 py-4 text-[#152839] transition hover:bg-[#f9f8f3] active:scale-[.99]"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ece7de]">
            <FlaskConical className="h-6 w-6" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-display text-lg font-bold">New lab request</span>
            <span className="block text-sm text-[#45546a]">Ask for laboratory tests</span>
          </span>
        </Link>
      </div>

      <ClinicNotices />

      {/* This month: the plan's limit, then the money (section 11.4) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><PlanUsage /></div>
        <div className="grid grid-cols-1 divide-y divide-[#dce1e8] rounded-[20px] border border-[#dce1e8] bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
          <div className="p-6">
            <p className="text-sm font-medium text-[#45546a]">Waiting for payment</p>
            <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{waiting}</p>
          </div>
          <div className="p-6">
            <p className="text-sm font-medium text-[#45546a]">Collected this month</p>
            <p className="mt-2 font-display text-[28px] font-bold tabular-nums text-[#152839]">{formatPeso(collected)}</p>
          </div>
        </div>
      </div>

      {/* History */}
      <PaymentsToConfirm />

      <section aria-labelledby="history-h">
        <h2 id="history-h" className="mb-4 font-display text-xl font-semibold text-[#152839]">Prescriptions and lab requests</h2>
        {pageQ.isError ? (
          <div role="alert" className="rounded-[18px] border border-[#f3c2af] bg-[#fbe9e1] p-5 text-sm text-[#7a2406]">
            We couldn’t load your prescriptions and lab requests.{' '}
            <button className="font-semibold underline ml-1" onClick={() => pageQ.refetch()}>Try again</button>
          </div>
        ) : (
          <PrescriptionHistory
            items={items}
            loading={pageQ.isLoading}
            fetching={pageQ.isFetching}
            search={searchInput}
            onSearchChange={setSearchInput}
            type={type}
            onTypeChange={handleTypeChange}
            filter={filter}
            onFilterChange={handleFilterChange}
            totalUnfiltered={pageData?.total_unfiltered}
            pagination={{
              page: pageData?.page ?? nav.page,
              totalPages: pageData?.total_pages ?? 1,
              totalItems: pageData?.total_count ?? 0,
              pageSize: pageData?.page_size ?? pageSize,
              hasPrev: pageData?.has_prev ?? false,
              hasNext: pageData?.has_next ?? false,
              onPageChange: handlePageChange,
              onPageSizeChange: handlePageSizeChange,
            }}
          />
        )}
      </section>
    </div>
  );
}
