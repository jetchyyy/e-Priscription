import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Computes a bounded page-number window (at most 7 slots) so pagination never
 * overflows even across hundreds or thousands of pages.
 */
export function getPageWindow(currentPage, totalPages) {
  const total = Math.max(1, Number(totalPages) || 1);
  const current = Math.min(Math.max(1, Number(currentPage) || 1), total);

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis-end', total];
  }
  if (current >= total - 3) {
    return [1, 'ellipsis-start', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, 'ellipsis-start', current - 1, current, current + 1, 'ellipsis-end', total];
}

/**
 * Reusable ODYSSEY-styled pagination bar scalable to hundreds/thousands of pages.
 * Supports both numbered/jump navigation (`onPageChange`) and cursor callbacks (`onPrev`/`onNext`).
 */
export function Pagination({
  page = 1,
  totalPages = 1,
  totalItems,
  pageSize = 15,
  pageSizes = [10, 15, 25, 50],
  onPageSizeChange,
  onPageChange,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  loading = false,
  itemLabel = 'items',
  className,
}) {
  const safeTotalPages = Math.max(1, Number(totalPages) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), safeTotalPages);
  const [jumpValue, setJumpValue] = useState(String(safePage));

  useEffect(() => {
    setJumpValue(String(safePage));
  }, [safePage]);

  const canPrev = hasPrev ?? safePage > 1;
  const canNext = hasNext ?? safePage < safeTotalPages;
  const slots = getPageWindow(safePage, safeTotalPages);

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = totalItems != null ? Math.min(safePage * pageSize, totalItems) : null;

  const handlePrev = () => {
    if (!canPrev || loading) return;
    if (onPrev) onPrev();
    else onPageChange?.(safePage - 1);
  };

  const handleNext = () => {
    if (!canNext || loading) return;
    if (onNext) onNext();
    else onPageChange?.(safePage + 1);
  };

  const handleJump = (e) => {
    e.preventDefault();
    if (!onPageChange || loading) return;
    const parsed = parseInt(jumpValue, 10);
    if (Number.isNaN(parsed)) return;
    const target = Math.min(Math.max(1, parsed), safeTotalPages);
    setJumpValue(String(target));
    if (target !== safePage) onPageChange(target);
  };

  if (totalItems === 0) return null;
  if (safeTotalPages <= 1 && !onPageSizeChange && !hasPrev && !hasNext) return null;

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col gap-3 rounded-[20px] border border-[#dce1e8] bg-white px-4 py-3.5 sm:px-5',
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: item range + optional per-page selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-start">
          <p className="text-[13px] tabular-nums text-[#45546a]">
            {totalItems != null ? (
              <>
                Showing <strong className="text-[#152839]">{startItem.toLocaleString()}–{endItem.toLocaleString()}</strong> of{' '}
                <strong className="text-[#152839]">{Number(totalItems).toLocaleString()}</strong> {itemLabel}
              </>
            ) : (
              <>
                Page <strong className="text-[#152839]">{safePage.toLocaleString()}</strong> of{' '}
                <strong className="text-[#152839]">{safeTotalPages.toLocaleString()}</strong>
              </>
            )}
          </p>

          {onPageSizeChange && (
            <label className="inline-flex items-center gap-2 rounded-full border border-[#dce1e8] bg-[#f9f8f3] px-3 py-1 text-[13px] text-[#45546a]">
              <span>Per page</span>
              <select
                aria-label="Rows per page"
                value={pageSize}
                disabled={loading}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="bg-transparent font-semibold text-[#152839] focus:outline-none"
              >
                {pageSizes.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Right: page controls + quick jump for large page counts */}
        {safeTotalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:justify-end">
            {/* Mobile compact controls */}
            <div className="flex w-full items-center justify-between gap-2 sm:hidden">
              <button
                type="button"
                onClick={handlePrev}
                disabled={!canPrev || loading}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#dce1e8] bg-[#f9f8f3] px-4 text-sm font-semibold text-[#152839] transition hover:bg-[#ece7de] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Prev
              </button>
              <span className="text-[13px] font-medium tabular-nums text-[#45546a]">
                Page <strong className="text-[#152839]">{safePage.toLocaleString()}</strong> / {safeTotalPages.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canNext || loading}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#dce1e8] bg-[#f9f8f3] px-4 text-sm font-semibold text-[#152839] transition hover:bg-[#ece7de] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Desktop numbered window */}
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrev}
                disabled={!canPrev || loading}
                aria-label="Previous page"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-full border border-[#dce1e8] bg-[#f9f8f3] px-3.5 text-[13px] font-semibold text-[#152839] transition hover:bg-[#ece7de] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Prev
              </button>

              {slots.map((slot) =>
                typeof slot === 'string' ? (
                  <span key={slot} className="px-1.5 text-sm text-[#5f6a7c]" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={slot}
                    type="button"
                    disabled={loading || !onPageChange}
                    aria-label={`Page ${slot}`}
                    aria-current={slot === safePage ? 'page' : undefined}
                    onClick={() => onPageChange?.(slot)}
                    className={cn(
                      'min-h-[38px] min-w-[38px] rounded-full px-2.5 text-[13px] font-semibold tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6f07]',
                      slot === safePage
                        ? 'bg-[#152839] text-[#f9f8f3]'
                        : 'text-[#45546a] hover:bg-[#ece7de] hover:text-[#152839]',
                    )}
                  >
                    {slot.toLocaleString()}
                  </button>
                ),
              )}

              <button
                type="button"
                onClick={handleNext}
                disabled={!canNext || loading}
                aria-label="Next page"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-full border border-[#dce1e8] bg-[#f9f8f3] px-3.5 text-[13px] font-semibold text-[#152839] transition hover:bg-[#ece7de] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Quick jump for large page counts (> 7 pages) */}
            {safeTotalPages > 7 && onPageChange && (
              <form onSubmit={handleJump} className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
                <label htmlFor="pagination-jump" className="text-[13px] text-[#5f6a7c]">
                  Go to
                </label>
                <input
                  id="pagination-jump"
                  type="number"
                  min={1}
                  max={safeTotalPages}
                  inputMode="numeric"
                  value={jumpValue}
                  onChange={(e) => setJumpValue(e.target.value)}
                  className="min-h-[38px] w-20 rounded-full border border-[#dce1e8] bg-[#f9f8f3] px-3 text-center text-[13px] font-semibold tabular-nums text-[#152839] focus:border-[#ff6f07] focus:bg-white focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[38px] rounded-full bg-[#ece7de] px-3.5 text-[13px] font-semibold text-[#152839] transition hover:bg-[#dce1e8] disabled:opacity-45"
                >
                  Go
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
