import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDashboard } from '@/hooks/useDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PayNowSheet } from '@/components/payments/PayNowSheet';
import { tenantApi } from '@/lib/api';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
function daysUntil(date: Date | string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useDashboard();
  const { data: threads = [], refetch: refetchThreads } = useQuery({ queryKey: ['threads'], queryFn: tenantApi.messages.threads, staleTime: 0 });
  const [paySheetVisible, setPaySheetVisible] = useState(false);
  const firstName = profile?.name?.split(' ')[0] ?? 'Tenant';
  const unreadMessagesCount = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  // Refetch both dashboard and threads whenever this tab comes into focus
  useFocusEffect(useCallback(() => {
    refetch();
    refetchThreads();
  }, [refetch, refetchThreads]));

  function handleRefresh() {
    refetch();
    refetchThreads();
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor="#6366f1" />}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Good morning, {firstName}</Text>
          {profile?.activeLease && (
            <Text style={styles.unit}>Unit {profile.activeLease.unit.unitNumber} · {profile.activeLease.unit.property.name}</Text>
          )}
        </View>

        {data?.activeLease && (() => {
          const days = daysUntil(data.activeLease.endDate);
          if (days > 90) return null;
          const urgent = days <= 60;
          return (
            <View style={[styles.banner, urgent ? styles.bannerRed : styles.bannerYellow]}>
              <Text style={[styles.bannerTitle, urgent ? styles.bannerTitleRed : styles.bannerTitleYellow]}>
                Lease expires in {days} day{days !== 1 ? 's' : ''}
              </Text>
              <Text style={[styles.bannerBody, urgent ? styles.bannerBodyRed : styles.bannerBodyYellow]}>
                Contact your property manager to discuss renewal.
              </Text>
            </View>
          );
        })()}

        <Card style={styles.cardGap}>
          {isLoading ? <Text style={styles.muted}>Loading…</Text>
            : data?.nextPayment ? (
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={styles.muted}>Next payment</Text>
                  <Text style={styles.amount}>{formatCurrency(data.nextPayment.amount)}</Text>
                  <Text style={styles.muted}>Due {new Date(data.nextPayment.dueDate!).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} · {daysUntil(data.nextPayment.dueDate!)} days away</Text>
                </View>
                <Button title="Pay Now" onPress={() => setPaySheetVisible(true)} />
              </View>
            ) : (
              <View>
                <Text style={styles.muted}>Next payment</Text>
                <Text style={styles.noPayment}>No payments due</Text>
              </View>
            )}
        </Card>

        <TouchableOpacity onPress={() => router.push('/(tabs)/maintenance')}>
          <Card style={styles.cardGap}>
            <View style={styles.row}>
              <View>
                <Text style={styles.muted}>Open work orders</Text>
                <Text style={styles.countNum}>{isLoading ? '—' : data?.openWorkOrdersCount ?? 0}</Text>
              </View>
              <Text style={{ fontSize: 32 }}>🔧</Text>
            </View>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(tabs)/messages')}>
          <Card>
            <View style={styles.row}>
              <View>
                <Text style={styles.muted}>Unread messages</Text>
                <Text style={styles.countNum}>{unreadMessagesCount}</Text>
              </View>
              <Text style={{ fontSize: 32 }}>💬</Text>
            </View>
          </Card>
        </TouchableOpacity>
      </ScrollView>

      {data?.nextPayment && (
        <PayNowSheet visible={paySheetVisible} payment={data.nextPayment} onClose={() => setPaySheetVisible(false)} onSuccess={() => refetch()} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { padding: 16, gap: 12 },
  header: { marginBottom: 8 },
  greeting: { fontSize: 24, fontWeight: '700', color: '#111827' },
  unit: { color: '#6b7280', marginTop: 2 },
  banner: { borderRadius: 12, padding: 16, borderWidth: 1 },
  bannerRed: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  bannerYellow: { backgroundColor: '#fefce8', borderColor: '#fde68a' },
  bannerTitle: { fontWeight: '600' },
  bannerTitleRed: { color: '#b91c1c' },
  bannerTitleYellow: { color: '#a16207' },
  bannerBody: { fontSize: 13, marginTop: 2 },
  bannerBodyRed: { color: '#dc2626' },
  bannerBodyYellow: { color: '#ca8a04' },
  cardGap: { marginBottom: 0 },
  muted: { color: '#6b7280', fontSize: 14 },
  amount: { fontSize: 32, fontWeight: '700', color: '#111827', marginVertical: 4 },
  noPayment: { fontSize: 17, fontWeight: '600', color: '#16a34a', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countNum: { fontSize: 28, fontWeight: '700', color: '#111827', marginTop: 4 },
});
