import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePayments } from '@/hooks/usePayments';
import { useDashboard } from '@/hooks/useDashboard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PayNowSheet } from '@/components/payments/PayNowSheet';
import type { TenantPaymentListItem } from '@propflow/shared';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#fef3c7', text: '#b45309' },
  completed: { bg: '#d1fae5', text: '#065f46' },
  failed:    { bg: '#fee2e2', text: '#991b1b' },
  waived:    { bg: '#f3f4f6', text: '#6b7280' },
  refunded:  { bg: '#dbeafe', text: '#1e40af' },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function PaymentRow({ item }: { item: TenantPaymentListItem }) {
  const color = STATUS_COLORS[item.status] ?? STATUS_COLORS.waived;
  const date = item.paidAt ?? item.dueDate;
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowType}>{item.type.replace(/_/g, ' ')}</Text>
        {date && <Text style={styles.rowDate}>{new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowAmount}>{formatCurrency(item.amount)}</Text>
        <View style={[styles.badge, { backgroundColor: color.bg }]}>
          <Text style={[styles.badgeText, { color: color.text }]}>{item.status}</Text>
        </View>
      </View>
    </View>
  );
}

export default function PaymentsScreen() {
  const { data: dashboard, refetch: refetchDashboard } = useDashboard();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isRefetching } = usePayments();
  const [paySheetVisible, setPaySheetVisible] = useState(false);
  const allPayments = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={allPayments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); refetchDashboard(); }} tintColor="#6366f1" />}
        ListHeaderComponent={() => (
          <View style={{ gap: 16, marginBottom: 8 }}>
            <Text style={styles.heading}>Payments</Text>
            {dashboard?.nextPayment && (
              <Card>
                <Text style={styles.muted}>Balance due</Text>
                <Text style={styles.balanceAmount}>{formatCurrency(dashboard.nextPayment.amount)}</Text>
                <Button title="Pay Now" onPress={() => setPaySheetVisible(true)} style={{ marginTop: 12 }} />
              </Card>
            )}
            <Text style={styles.sectionTitle}>History</Text>
          </View>
        )}
        renderItem={({ item }) => <PaymentRow item={item} />}
        ListEmptyComponent={() => <Text style={styles.empty}>{isLoading ? 'Loading…' : 'No payment history yet.'}</Text>}
        ListFooterComponent={() => hasNextPage ? <Button title={isFetchingNextPage ? 'Loading…' : 'Load more'} onPress={() => fetchNextPage()} loading={isFetchingNextPage} variant="secondary" style={{ marginTop: 16 }} /> : null}
      />
      {dashboard?.nextPayment && (
        <PayNowSheet visible={paySheetVisible} payment={dashboard.nextPayment} onClose={() => setPaySheetVisible(false)} onSuccess={() => { refetch(); refetchDashboard(); }} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  muted: { color: '#6b7280', fontSize: 14 },
  balanceAmount: { fontSize: 32, fontWeight: '700', color: '#111827', marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowLeft: { flex: 1 },
  rowType: { fontSize: 14, fontWeight: '500', color: '#111827', textTransform: 'capitalize' },
  rowDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowAmount: { fontSize: 14, fontWeight: '600', color: '#111827' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeText: { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },
  empty: { textAlign: 'center', color: '#9ca3af', paddingVertical: 48 },
});
