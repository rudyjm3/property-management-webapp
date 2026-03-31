import { useInfiniteQuery } from '@tanstack/react-query';
import { tenantApi } from '@/lib/api';

export function usePayments() {
  return useInfiniteQuery({
    queryKey: ['payments'],
    queryFn: ({ pageParam }) => tenantApi.payments(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
