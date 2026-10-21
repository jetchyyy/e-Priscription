import { useQuery } from '@tanstack/react-query';
import { PLANS } from '../marketing/plans';
import { plansQuery } from './api';

/**
 * Plans shown to the public and to doctors, smallest first. Starts from the built-in copy so the pricing
 * page renders at once, then switches to the plans the admin set.
 */
export function usePublicPlans() {
  const { data } = useQuery({ ...plansQuery, placeholderData: PLANS });
  return (data ?? PLANS).filter((p) => p.isPublic !== false);
}
