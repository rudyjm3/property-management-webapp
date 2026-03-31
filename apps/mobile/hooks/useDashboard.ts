import { useQuery } from '@tanstack/react-query';
import { tenantApi } from '@/lib/api';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: tenantApi.dashboard,
    staleTime: 60_000,
  });
}
