import { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { useInitiateMultiPayment } from '@/hooks/useInitiatePayment';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import type { TenantPendingPayment } from '@propflow/shared';

interface PayNowSheetProps {
  visible: boolean;
  payments: TenantPendingPayment[];
  onClose: () => void;
  onSuccess: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatPaymentType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type Step = 'confirm' | 'processing' | 'success' | 'error';

export function PayNowSheet({ visible, payments, onClose, onSuccess }: PayNowSheetProps) {
  const { collectBankAccountForPayment, confirmPayment } = useStripe();
  const initiateMutation = useInitiateMultiPayment();
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>('confirm');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  const paymentIds = payments.map((p) => p.id);

  // Earliest due date across all pending payments
  const earliestDue = payments
    .map((p) => p.dueDate)
    .filter(Boolean)
    .sort((a, b) => new Date(a!).getTime() - new Date(b!).getTime())[0];

  async function handlePay() {
    setStep('processing');
    setErrorMessage(null);

    try {
      const { clientSecret } = await initiateMutation.mutateAsync(paymentIds);

      const { error: collectError } = await collectBankAccountForPayment(clientSecret, {
        paymentMethodType: 'USBankAccount',
        paymentMethodData: { billingDetails: { name: profile?.name ?? '' } },
      });

      if (collectError) {
        setErrorMessage(collectError.message ?? 'Failed to link bank account.');
        setStep('error');
        return;
      }

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
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Pay Now</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.closeButton}>×</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {step === 'confirm' && (
            <View style={styles.confirmContainer}>
              <View style={styles.amountBox}>
                {/* Line items */}
                {payments.map((p) => (
                  <View key={p.id} style={styles.lineItem}>
                    <Text style={styles.lineItemLabel}>{formatPaymentType(p.type)}</Text>
                    <Text style={styles.lineItemAmount}>{formatCurrency(p.amount)}</Text>
                  </View>
                ))}

                {/* Divider + total */}
                {payments.length > 1 && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.lineItem}>
                      <Text style={styles.totalLabel}>Total</Text>
                      <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
                    </View>
                  </>
                )}

                {/* Single-item shows the large amount display */}
                {payments.length === 1 && (
                  <Text style={styles.singleAmount}>{formatCurrency(total)}</Text>
                )}

                {earliestDue && (
                  <Text style={styles.amountDate}>
                    Due {new Date(earliestDue).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                )}
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>ACH Bank Transfer</Text>
                <Text style={styles.infoBody}>
                  You'll be asked to securely link your bank account. ACH transfers typically settle in 2-4 business days.
                </Text>
              </View>

              <Button title="Link Bank & Pay" onPress={handlePay} />
              <Button title="Cancel" onPress={handleClose} variant="ghost" />
            </View>
          )}

          {step === 'processing' && (
            <View style={styles.centeredState}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.processingText}>Processing your payment…</Text>
            </View>
          )}

          {step === 'success' && (
            <View style={styles.centeredState}>
              <Text style={styles.successEmoji}>✅</Text>
              <Text style={styles.successTitle}>Payment initiated!</Text>
              <Text style={styles.successBody}>
                Your ACH payment is processing. It typically settles in 2-4 business days.
              </Text>
            </View>
          )}

          {step === 'error' && (
            <View style={styles.confirmContainer}>
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Payment failed</Text>
                <Text style={styles.errorBody}>{errorMessage}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  closeButton: { fontSize: 28, color: '#9ca3af', lineHeight: 32 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  confirmContainer: { gap: 16 },
  amountBox: { backgroundColor: '#f9fafb', borderRadius: 16, padding: 20, gap: 10 },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineItemLabel: { fontSize: 15, color: '#374151' },
  lineItemAmount: { fontSize: 15, fontWeight: '600', color: '#111827' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 4 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  totalAmount: { fontSize: 16, fontWeight: '700', color: '#111827' },
  singleAmount: { fontSize: 40, fontWeight: '700', color: '#111827', marginTop: 4 },
  amountDate: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  infoBox: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 16 },
  infoTitle: { fontSize: 14, fontWeight: '500', color: '#1d4ed8' },
  infoBody: { fontSize: 12, color: '#2563eb', marginTop: 4 },
  centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  processingText: { fontSize: 16, color: '#6b7280' },
  successEmoji: { fontSize: 48 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  successBody: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 12, padding: 16 },
  errorTitle: { fontSize: 14, fontWeight: '500', color: '#b91c1c' },
  errorBody: { fontSize: 12, color: '#dc2626', marginTop: 4 },
});
