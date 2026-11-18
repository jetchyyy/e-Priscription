import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = vi.fn();
vi.mock('./lib/supabase', () => ({
  db: () => ({ rpc: mockRpc }),
}));

import AdminAuditLogs from './features/admin/pages/AdminAuditLogs';
import { exportAllAuditLogs } from './features/admin/api';

const wrap = (el, seeds = []) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  for (const s of seeds) qc.setQueryData(s.key, s.data);
  return renderToString(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
};

const text = (html) =>
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

describe('AdminAuditLogs screen', () => {
  it('renders header, immutability badge, and loading skeleton', () => {
    const t = text(wrap(<AdminAuditLogs />));
    expect(t).toContain('Audit logs');
    expect(t).toContain('Append-only & immutable');
    expect(t).toContain('Batch size');
    expect(t).toContain('Export CSV');
  });

  it('renders keyset pagination past 1,000 records with parallel summary', () => {
    const filterKey = { category: '', action: '', search: '', from: null, to: null };
    const summaryData = {
      total_all: 1250,
      last_24h: 48,
      total_matching: 1250,
      min_created_at: '2026-10-01T00:00:00Z',
      max_created_at: '2026-11-18T04:00:00Z',
      categories: [{ category: 'prescription', count: 900 }],
      actions: ['rx.created', 'rx.paid'],
    };
    const page1 = {
      items: [
        {
          id: 1250,
          created_at: '2026-11-18T04:00:00Z',
          actor_id: 'doc-1',
          actor_role: 'doctor',
          actor_label: 'Dr. Maria Santos',
          category: 'prescription',
          action: 'rx.created',
          entity_type: 'prescription',
          entity_id: 'rx_abc123',
          summary: 'Prescription issued (fee PHP 200.00)',
          metadata: { kind: 'rx', amount: 200 },
        },
      ],
      has_more: true,
      next_cursor: { created_at: '2026-11-18T04:00:00Z', id: 1250 },
    };

    const t = text(
      wrap(<AdminAuditLogs />, [
        { key: ['admin', 'audit-summary', filterKey], data: summaryData },
        {
          key: ['admin', 'audit-logs', { ...filterKey, pageSize: 50 }],
          data: { pages: [page1], pageParams: [null] },
        },
      ]),
    );

    expect(t).toContain('1,250');
    expect(t).toContain('Prescription issued (fee PHP 200.00)');
    expect(t).toContain('Dr. Maria Santos');
    expect(t).toContain('Load 50 more');
    expect(t).toContain('1 of 1,250 matching events');
  });

  it('exports >1,000 rows via parallel time-sliced keyset batches without duplicates', async () => {
    const totalRows = 1205;
    const baseMs = Date.parse('2026-11-01T00:00:00Z');
    const dataset = Array.from({ length: totalRows }, (_, i) => {
      const id = totalRows - i;
      return {
        id,
        created_at: new Date(baseMs + id * 60_000).toISOString(),
        actor_role: 'doctor',
        actor_label: 'Dr. Test',
        category: 'prescription',
        action: 'rx.created',
        entity_type: 'prescription',
        entity_id: `rx_${id}`,
        summary: `Event ${id}`,
        metadata: {},
      };
    });

    mockRpc.mockImplementation(async (name, args) => {
      if (name !== 'admin_audit_logs') throw new Error(`Unexpected RPC: ${name}`);
      const limit = args.p_limit ?? 50;
      const filtered = dataset.filter((r) => {
        if (args.p_from && r.created_at < args.p_from) return false;
        if (args.p_to && r.created_at > args.p_to) return false;
        if (args.p_cursor_id != null && r.id >= args.p_cursor_id) return false;
        return true;
      });
      const items = filtered.slice(0, limit);
      const has_more = filtered.length > limit;
      const last = items[items.length - 1];
      return {
        data: {
          items,
          has_more,
          next_cursor: has_more && last ? { created_at: last.created_at, id: last.id } : null,
        },
        error: null,
      };
    });

    const exported = await exportAllAuditLogs({
      summary: {
        total_matching: totalRows,
        min_created_at: dataset[dataset.length - 1].created_at,
        max_created_at: dataset[0].created_at,
      },
    });

    expect(exported).toHaveLength(totalRows);
    expect(exported[0].id).toBe(1205);
    expect(exported[exported.length - 1].id).toBe(1);
    expect(mockRpc).toHaveBeenCalled();
  });
});
