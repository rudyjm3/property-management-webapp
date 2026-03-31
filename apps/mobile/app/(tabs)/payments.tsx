import { useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePayments } from '@/hooks/usePayments';
import { useDashboard } from '@/hooks/useDashboard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PayNowSheet } from '@/components/payments/PayNowSheet';
import type { TenantPaymentListItem } from '@propflow/shared';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  waived: 'bg-gray-100 text-gray-600',
  refunded: 'bg-blue-100 text-blue-700',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function PaymentRow({ item }: { item: TenantPaymentListItem }) {
  const statusClass = STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600';
  const date = item.paidAt ?? item.dueDate;

  return (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-50">
      <View className="flex-1">
        <Text className="text-sm font-medium text-gray-900 capitalize">
          {item.type.replace(/_/g, ' ')}
        </Text>
        {date && (
          <Text className="text-xs text-gray-400 mt-0.5">
            {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        )}
      </View>
      <View className="items-end gap-1">
        <Text className="text-sm font-semibold text-gray-900">{formatCurrency(item.amount)}</Text>
        <View className={`px-2 py-0.5 rounded-full ${statusClass.split(' ')[0]}`}>
          <Text className={`text-xs font-medium capitalize ${statusClass.split(' ')[1]}`}>
            {item.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function PaymentsScreen() {
  const { data: dashboard, refetch: refetchDashboard } = useDashboard();
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = usePayments();

  const [paySheetVisible, setPaySheetVisible] = useState(false);

  const allPayments = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900">Payments</Text>
      </View>

      <FlatList
        data={allPayments}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pb-8 gap-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => { refetch(); refetchDashboard(); }}
            tintColor="#6366f1"
          />
        }
        ListHeaderComponent={() => (
          <View className="gap-4 mb-2">
            {/* Balance card */}
            {dashboard?.nextPayment && (
              <Card>
                <Text className="text-sm text-gray-500">Balance due</Text>
                <Text className="text-3xl font-bold text-gray-900 mt-1">
                  {formatCurrency(dashboard.nextPayment.amount)}
                </Text>
                <Button
                  title="Pay Now"
                  onPress={() => setPaySheetVisible(true)}
                  className="mt-3"
                />
              </Card>
            )}

            <Text className="text-lg font-semibold text-gray-900">History</Text>
          </View>
        )}
        renderItem={({ item }) => <PaymentRow item={item} />}
        ListEmptyComponent={() => (
          <View className="items-center py-12">
            <Text className="text-gray-400">
              {isLoading ? 'Loading…' : 'No payment history yet.'}
            </Text>
          </View>
        )}
        ListFooterComponent={() =>
          hasNextPage ? (
            <Button
              title={isFetchingNextPage ? 'Loading…' : 'Load more'}
              onPress={() => fetchNextPage()}
              loading={isFetchingNextPage}
              variant="secondary"
              className="mt-4"
            />
          ) : null
        }
      />

      {dashboard?.nextPayment && (
        <PayNowSheet
          visible={paySheetVisible}
          payment={dashboard.nextPayment}
          onClose={() => setPaySheetVisible(false)}
          onSuccess={() => { refetch(); refetchDashboard(); }}
        />
      )}
    </SafeAreaView>
  );
}
