import { useInfiniteQuery } from '@tanstack/react-query';
import { tenantApi } from '../lib/api';

export function useWorkOrders() {
  const query = useInfiniteQuery({
    queryKey: ['workOrders'],
    queryFn: ({ pageParam }) => tenantApi.workOrders(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];

  return {
    workOrders: items,
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching && !query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
