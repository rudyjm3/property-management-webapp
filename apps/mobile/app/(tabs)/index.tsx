import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDashboard } from '@/hooks/useDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PayNowSheet } from '@/components/payments/PayNowSheet';
import type { TenantDashboard } from '@propflow/shared';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function daysUntil(date: Date | string): number {
  const target = new Date(date);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useDashboard();
  const [paySheetVisible, setPaySheetVisible] = useState(false);

  const firstName = profile?.name?.split(' ')[0] ?? 'Tenant';

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="px-4 py-4 gap-4"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#6366f1" />
        }
      >
        {/* Header */}
        <View className="mb-2">
          <Text className="text-2xl font-bold text-gray-900">Good morning, {firstName}</Text>
          {profile?.activeLease && (
            <Text className="text-gray-500 mt-0.5">
              Unit {profile.activeLease.unit.unitNumber} · {profile.activeLease.unit.property.name}
            </Text>
          )}
        </View>

        {/* Lease expiry banner */}
        {data?.activeLease && (() => {
          const days = daysUntil(data.activeLease.endDate);
          if (days > 90) return null;
          const isUrgent = days <= 60;
          return (
            <View className={`rounded-xl p-4 ${isUrgent ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <Text className={`font-semibold ${isUrgent ? 'text-red-700' : 'text-yellow-700'}`}>
                Lease expires in {days} day{days !== 1 ? 's' : ''}
              </Text>
              <Text className={`text-sm mt-0.5 ${isUrgent ? 'text-red-600' : 'text-yellow-600'}`}>
                Contact your property manager to discuss renewal.
              </Text>
            </View>
          );
        })()}

        {/* Rent card */}
        <Card>
          {isLoading ? (
            <Text className="text-gray-400">Loading…</Text>
          ) : data?.nextPayment ? (
            <View className="gap-3">
              <View>
                <Text className="text-sm text-gray-500">Next payment</Text>
                <Text className="text-3xl font-bold text-gray-900 mt-1">
                  {formatCurrency(data.nextPayment.amount)}
                </Text>
                <Text className="text-sm text-gray-500 mt-1">
                  Due {new Date(data.nextPayment.dueDate!).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric',
                  })} · {daysUntil(data.nextPayment.dueDate!)} days away
                </Text>
              </View>
              <Button
                title="Pay Now"
                onPress={() => setPaySheetVisible(true)}
              />
            </View>
          ) : (
            <View>
              <Text className="text-sm text-gray-500">Next payment</Text>
              <Text className="text-lg font-semibold text-green-600 mt-1">No payments due</Text>
            </View>
          )}
        </Card>

        {/* Work orders */}
        <TouchableOpacity onPress={() => router.push('/(tabs)/maintenance')}>
          <Card>
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-gray-500">Open work orders</Text>
                <Text className="text-2xl font-bold text-gray-900 mt-1">
                  {isLoading ? '—' : data?.openWorkOrdersCount ?? 0}
                </Text>
              </View>
              <Text className="text-3xl">🔧</Text>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Messages */}
        <TouchableOpacity onPress={() => router.push('/(tabs)/messages')}>
          <Card>
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-gray-500">Unread messages</Text>
                <Text className="text-2xl font-bold text-gray-900 mt-1">
                  {isLoading ? '—' : data?.unreadMessagesCount ?? 0}
                </Text>
              </View>
              <Text className="text-3xl">💬</Text>
            </View>
          </Card>
        </TouchableOpacity>
      </ScrollView>

      {data?.nextPayment && (
        <PayNowSheet
          visible={paySheetVisible}
          payment={data.nextPayment}
          onClose={() => setPaySheetVisible(false)}
          onSuccess={() => refetch()}
        />
      )}
    </SafeAreaView>
  );
}
