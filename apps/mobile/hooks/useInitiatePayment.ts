import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '@/lib/api';

export function useInitiatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentId: string) => tenantApi.initiatePayment(paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useInitiateMultiPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentIds: string[]) => tenantApi.initiateMultiPayment(paymentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
