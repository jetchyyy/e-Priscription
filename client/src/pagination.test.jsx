import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Pagination, getPageWindow } from './components/ui/Pagination';
import { PrescriptionHistory } from './features/doctor/components/PrescriptionHistory';

const text = (html) =>
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

describe('getPageWindow (scalable pagination)', () => {
  it('returns all pages when totalPages <= 7', () => {
    expect(getPageWindow(1, 1)).toEqual([1]);
    expect(getPageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('caps rendered slots at 7 even across 1,000+ pages', () => {
    const start = getPageWindow(2, 1200);
    expect(start).toHaveLength(7);
    expect(start).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 1200]);

    const mid = getPageWindow(450, 1200);
    expect(mid).toHaveLength(7);
    expect(mid).toEqual([1, 'ellipsis-start', 449, 450, 451, 'ellipsis-end', 1200]);

    const end = getPageWindow(1199, 1200);
    expect(end).toHaveLength(7);
    expect(end).toEqual([1, 'ellipsis-start', 1196, 1197, 1198, 1199, 1200]);
  });
});

describe('Pagination component', () => {
  it('renders bounded window, item range, per-page selector, and quick-jump for large page counts', () => {
    const html = renderToString(
      <Pagination
        page={42}
        totalPages={500}
        totalItems={7500}
        pageSize={15}
        itemLabel="documents"
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );
    const t = text(html);
    expect(t).toContain('Showing 616–630 of 7,500 documents');
    expect(t).toContain('Per page');
    expect(t).toContain('500');
    expect(t).toContain('Go to');
    expect(html).toContain('aria-current="page"');
  });
});

describe('PrescriptionHistory pagination integration', () => {
  it('paginates long client lists cleanly and supports server pagination props', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    const items = Array.from({ length: 22 }, (_, i) => ({
      id: `rx_${String(i + 1).padStart(18, '0')}`,
      kind: i % 3 === 0 ? 'lab' : 'rx',
      patient_name: `Patient ${i + 1}`,
      amount: 100,
      payment_status: i % 2 === 0 ? 'paid' : 'unpaid',
      created_at: '2026-11-18T02:00:00Z',
    }));

    const html = renderToString(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <PrescriptionHistory items={items} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const t = text(html);
    expect(t).toContain('Patient 1');
    expect(t).toContain('Patient 15');
    expect(t).not.toContain('Patient 16');
    expect(t).toContain('Showing 1–15 of 22 documents');
  });
});
