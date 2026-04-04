import { useQuery } from '@tanstack/react-query';
import { tenantApi } from '@/lib/api';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: tenantApi.dashboard,
    staleTime: 0,     // Always refetch — dashboard counts (unread messages, work orders) must stay current
    refetchOnMount: 'always',
  });
}
