import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePayments } from '@/hooks/usePayments';
import { useDashboard } from '@/hooks/useDashboard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PayNowSheet } from '@/components/payments/PayNowSheet';
import type { TenantPaymentListItem } from '@propflow/shared';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#b45309' },
  completed: { bg: '#d1fae5', text: '#065f46' },
  failed: { bg: '#fee2e2', text: '#991b1b' },
  waived: { bg: '#f3f4f6', text: '#6b7280' },
  refunded: { bg: '#dbeafe', text: '#1e40af' },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(value: Date | string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function PaymentRow({ item, onPress }: { item: TenantPaymentListItem; onPress: () => void }) {
  const color = STATUS_COLORS[item.status] ?? STATUS_COLORS.waived;
  const date = item.paidAt ?? item.dueDate;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowType}>{item.type.replace(/_/g, ' ')}</Text>
        {date && <Text style={styles.rowDate}>{formatDate(date)}</Text>}
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowAmount}>{formatCurrency(item.amount)}</Text>
        <View style={[styles.badge, { backgroundColor: color.bg }]}>
          <Text style={[styles.badgeText, { color: color.text }]}>{item.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function PaymentsScreen() {
  const { data: dashboard, refetch: refetchDashboard } = useDashboard();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isRefetching } = usePayments();
  const [paySheetVisible, setPaySheetVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<TenantPaymentListItem | null>(null);
  const allPayments = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

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
        renderItem={({ item }) => <PaymentRow item={item} onPress={() => setSelectedPayment(item)} />}
        ListEmptyComponent={() => <Text style={styles.empty}>{isLoading ? 'Loading...' : 'No payment history yet.'}</Text>}
        ListFooterComponent={() => hasNextPage ? <Button title={isFetchingNextPage ? 'Loading...' : 'Load more'} onPress={() => fetchNextPage()} loading={isFetchingNextPage} variant="secondary" style={{ marginTop: 16 }} /> : null}
      />

      {dashboard?.nextPayment && (
        <PayNowSheet visible={paySheetVisible} payment={dashboard.nextPayment} onClose={() => setPaySheetVisible(false)} onSuccess={() => { refetch(); refetchDashboard(); }} />
      )}

      <Modal visible={!!selectedPayment} transparent animationType="slide" onRequestClose={() => setSelectedPayment(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedPayment(null)} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Payment Details</Text>
          {selectedPayment && (
            <View style={{ gap: 10 }}>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Amount</Text><Text style={styles.detailValue}>{formatCurrency(selectedPayment.amount)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Type</Text><Text style={styles.detailValue}>{selectedPayment.type.replace(/_/g, ' ')}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Status</Text><Text style={styles.detailValue}>{selectedPayment.status}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Method</Text><Text style={styles.detailValue}>{selectedPayment.method ?? 'N/A'}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Due Date</Text><Text style={styles.detailValue}>{formatDate(selectedPayment.dueDate)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Paid Date</Text><Text style={styles.detailValue}>{formatDate(selectedPayment.paidAt)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Reference</Text><Text style={styles.detailValue}>{selectedPayment.referenceNote ?? 'N/A'}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Notes</Text><Text style={[styles.detailValue, styles.notesValue]}>{selectedPayment.notes ?? 'N/A'}</Text></View>
            </View>
          )}
          <Button title="Close" onPress={() => setSelectedPayment(null)} variant="secondary" style={{ marginTop: 16 }} />
        </View>
      </Modal>
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.35)' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 12,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  detailLabel: { fontSize: 13, color: '#6b7280' },
  detailValue: { flex: 1, textAlign: 'right', fontSize: 14, color: '#111827', fontWeight: '500', textTransform: 'capitalize' },
  notesValue: { textTransform: 'none' },
});
