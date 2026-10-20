import { useQuery } from '@tanstack/react-query';
import { fetchRx } from '../api';

const POLL_MS = 3000;

/**
 * Loads the public prescription and POLLS while it is unpaid.
 * When the webhook marks it paid, the next poll returns the full content
 * and the page reveals it automatically.
 */
export function usePaymentStatus(id, enabled = true, userId = null, pin = null) {
  return useQuery({
    queryKey: ['rx', id, userId, pin],
    queryFn: () => fetchRx(id, pin),
    enabled,
    retry: 1,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === 'unpaid' && !query.state.data?.is_doctor_preview ? POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}
