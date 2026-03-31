import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '@/lib/api';

export function useInitiatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentId: string) => tenantApi.initiatePayment(paymentId),
    onSuccess: () => {
      // Refresh dashboard and payments after initiating
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
