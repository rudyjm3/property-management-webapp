import { useState } from 'react';
import { Modal, Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { Button } from '@/components/ui/Button';
import { tenantApi } from '@/lib/api';

interface AutopaySetupSheetProps {
  visible: boolean;
  setupIntentClientSecret: string;
  billingName?: string;
  billingEmail?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AutopaySetupSheet({ visible, setupIntentClientSecret, billingName = 'Account Holder', billingEmail, onClose, onSuccess }: AutopaySetupSheetProps) {
  const { collectBankAccountForSetup, confirmSetupIntent } = useStripe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetup() {
    setLoading(true);
    setError(null);
    try {
      const { error: collectError } = await collectBankAccountForSetup(
        setupIntentClientSecret,
        {
          paymentMethodType: 'USBankAccount',
          paymentMethodData: { billingDetails: { name: billingName, ...(billingEmail ? { email: billingEmail } : {}) } },
        },
      );
      if (collectError) {
        setError(collectError.message ?? 'Could not link bank account.');
        return;
      }

      const { error: confirmError } = await confirmSetupIntent(setupIntentClientSecret, {
        paymentMethodType: 'USBankAccount',
      });
      if (confirmError) {
        setError(confirmError.message ?? 'Could not confirm bank account setup.');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Set up autopay</Text>
        <Text style={styles.body}>
          Link a bank account and we'll automatically pay your rent each month on the due date.
          You can turn autopay off at any time.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <ActivityIndicator color="#6366f1" style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.actions}>
            <Button title="Link Bank Account" onPress={handleSetup} />
            <Button title="Not now" onPress={onClose} variant="ghost" />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8, color: '#111827' },
  body: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 16 },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 12 },
  actions: { gap: 8 },
});

// Hook to handle the full autopay toggle flow
export function useAutopayToggle(onRefresh: () => void) {
  const [autopayEnabled, setAutopayEnabled] = useState(false);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [showSetupSheet, setShowSetupSheet] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadAutopay() {
    try {
      const status = await tenantApi.autopay.get();
      setAutopayEnabled(status.autopayEnabled);
      setHasPaymentMethod(status.hasPaymentMethod);
    } catch {
      // Non-critical — autopay section will render with defaults
    }
  }

  async function toggleAutopay(enabled: boolean) {
    setLoading(true);
    try {
      const result = await tenantApi.autopay.set(enabled);
      if (result.requiresSetup && result.setupIntentClientSecret) {
        setSetupClientSecret(result.setupIntentClientSecret);
        setShowSetupSheet(true);
      } else {
        setAutopayEnabled(result.autopayEnabled);
        onRefresh();
      }
    } catch {
      // Keep current state on error
    } finally {
      setLoading(false);
    }
  }

  function handleSetupSuccess() {
    setAutopayEnabled(true);
    setHasPaymentMethod(true);
    setSetupClientSecret(null);
    onRefresh();
  }

  return {
    autopayEnabled,
    hasPaymentMethod,
    setupClientSecret,
    showSetupSheet,
    setShowSetupSheet,
    loading,
    loadAutopay,
    toggleAutopay,
    handleSetupSuccess,
  };
}
