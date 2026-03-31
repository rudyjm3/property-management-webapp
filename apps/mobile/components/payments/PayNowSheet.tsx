import { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { useInitiatePayment } from '@/hooks/useInitiatePayment';
import { Button } from '@/components/ui/Button';
import type { TenantDashboard } from '@propflow/shared';

interface PayNowSheetProps {
  visible: boolean;
  payment: NonNullable<TenantDashboard['nextPayment']>;
  onClose: () => void;
  onSuccess: () => void;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents);
}

type Step = 'confirm' | 'processing' | 'success' | 'error';

export function PayNowSheet({ visible, payment, onClose, onSuccess }: PayNowSheetProps) {
  const { collectBankAccountForPayment, confirmPayment } = useStripe();
  const initiateMutation = useInitiatePayment();
  const [step, setStep] = useState<Step>('confirm');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handlePay() {
    setStep('processing');
    setErrorMessage(null);

    try {
      // Step 1: Get client secret from our API
      const { clientSecret } = await initiateMutation.mutateAsync(payment.id);

      // Step 2: Collect bank account via Stripe Financial Connections
      const { paymentIntent, error: collectError } = await collectBankAccountForPayment({
        clientSecret,
        params: {
          paymentMethodType: 'USBankAccount',
          paymentMethodData: { billingDetails: { name: '' } },
        },
      });

      if (collectError) {
        setErrorMessage(collectError.message ?? 'Failed to link bank account.');
        setStep('error');
        return;
      }

      // Step 3: Confirm the ACH payment
      const { error: confirmError } = await confirmPayment(clientSecret, {
        paymentMethodType: 'USBankAccount',
      });

      if (confirmError) {
        setErrorMessage(confirmError.message ?? 'Payment confirmation failed.');
        setStep('error');
        return;
      }

      setStep('success');
      setTimeout(() => {
        onSuccess();
        onClose();
        setStep('confirm');
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setErrorMessage(message);
      setStep('error');
    }
  }

  function handleClose() {
    setStep('confirm');
    setErrorMessage(null);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <Text className="text-xl font-bold text-gray-900">Pay Rent</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text className="text-gray-400 text-2xl">×</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-1 px-6 pt-6">
          {step === 'confirm' && (
            <View className="gap-6">
              <View className="bg-gray-50 rounded-2xl p-5">
                <Text className="text-sm text-gray-500 mb-1">Amount due</Text>
                <Text className="text-4xl font-bold text-gray-900">
                  {formatCurrency(payment.amount)}
                </Text>
                {payment.dueDate && (
                  <Text className="text-sm text-gray-500 mt-2">
                    Due {new Date(payment.dueDate).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                )}
              </View>

              <View className="bg-blue-50 rounded-xl p-4">
                <Text className="text-sm text-blue-700 font-medium">ACH Bank Transfer</Text>
                <Text className="text-xs text-blue-600 mt-1">
                  You'll be asked to securely link your bank account. ACH transfers typically settle in 2-4 business days.
                </Text>
              </View>

              <Button
                title="Link Bank & Pay"
                onPress={handlePay}
              />
              <Button
                title="Cancel"
                onPress={handleClose}
                variant="ghost"
              />
            </View>
          )}

          {step === 'processing' && (
            <View className="flex-1 items-center justify-center gap-4">
              <ActivityIndicator size="large" color="#6366f1" />
              <Text className="text-gray-600 text-base">Processing your payment…</Text>
            </View>
          )}

          {step === 'success' && (
            <View className="flex-1 items-center justify-center gap-4">
              <Text className="text-5xl">✅</Text>
              <Text className="text-xl font-bold text-gray-900">Payment initiated!</Text>
              <Text className="text-gray-500 text-center">
                Your ACH payment is processing. It typically settles in 2-4 business days.
              </Text>
            </View>
          )}

          {step === 'error' && (
            <View className="gap-6">
              <View className="bg-red-50 rounded-xl p-4">
                <Text className="text-red-700 font-medium">Payment failed</Text>
                <Text className="text-red-600 text-sm mt-1">{errorMessage}</Text>
              </View>
              <Button title="Try Again" onPress={() => setStep('confirm')} />
              <Button title="Cancel" onPress={handleClose} variant="ghost" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
