import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useWorkOrders } from '../../hooks/useWorkOrders';
import SubmitWorkOrderSheet from '../../components/maintenance/SubmitWorkOrderSheet';
import type { TenantWorkOrderListItem, WorkOrderStatus, WorkOrderCategory } from '@propflow/shared';

// ─── Status display config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; bg: string; text: string }> = {
  new_order:     { label: 'Submitted',     bg: '#eff6ff', text: '#2563eb' },
  assigned:      { label: 'Assigned',      bg: '#f0fdf4', text: '#16a34a' },
  in_progress:   { label: 'In Progress',   bg: '#fefce8', text: '#ca8a04' },
  pending_parts: { label: 'Pending Parts', bg: '#fff7ed', text: '#ea580c' },
  completed:     { label: 'Completed',     bg: '#f0fdf4', text: '#15803d' },
  closed:        { label: 'Closed',        bg: '#f9fafb', text: '#6b7280' },
  cancelled:     { label: 'Cancelled',     bg: '#fef2f2', text: '#dc2626' },
};

const CATEGORY_LABELS: Record<WorkOrderCategory, string> = {
  plumbing:   'Plumbing',
  electrical: 'Electrical',
  hvac:       'HVAC',
  appliance:  'Appliance',
  pest:       'Pest',
  structural: 'Structural',
  cosmetic:   'Cosmetic',
  grounds:    'Grounds',
  general:    'General',
  other:      'Other',
};

// ─── Work Order Row ────────────────────────────────────────────────────────────

function WorkOrderRow({ item }: { item: TenantWorkOrderListItem }) {
  const status = STATUS_CONFIG[item.status];
  const submittedDate = new Date(item.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCategory}>{CATEGORY_LABELS[item.category]}</Text>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={[styles.badgeText, { color: status.text }]}>{status.label}</Text>
        </View>
      </View>
      {item.title ? (
        <Text style={styles.cardTitle}>{item.title}</Text>
      ) : null}
      <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
      <Text style={styles.cardDate}>Submitted {submittedDate}</Text>
      {item.submittedByUser ? (
        <Text style={styles.cardCreatedBy}>Staff request — {item.submittedByUser.name}</Text>
      ) : (
        <Text style={styles.cardCreatedBy}>Tenant submitted</Text>
      )}
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function MaintenanceScreen() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const {
    workOrders,
    isLoading,
    isRefreshing,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useWorkOrders();

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={workOrders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <WorkOrderRow item={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refetch} tintColor="#6366f1" />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.screenTitle}>Maintenance</Text>
            <TouchableOpacity style={styles.submitBtn} onPress={() => setSheetVisible(true)}>
              <Text style={styles.submitBtnText}>+ New Request</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#6366f1" />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🔧</Text>
              <Text style={styles.emptyTitle}>No maintenance requests</Text>
              <Text style={styles.emptyBody}>
                Submit a request and your property manager will be notified right away.
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setSheetVisible(true)}>
                <Text style={styles.emptyBtnText}>Submit a Request</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color="#6366f1" style={{ marginVertical: 16 }} />
          ) : null
        }
      />

      <SubmitWorkOrderSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: { paddingBottom: 32 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  screenTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  submitBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardCategory: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardDescription: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 8 },
  cardDate: { fontSize: 12, color: '#9ca3af' },
  cardCreatedBy: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptyBody: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
