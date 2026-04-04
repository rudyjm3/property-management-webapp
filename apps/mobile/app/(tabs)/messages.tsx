import { useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { tenantApi } from '@/lib/api';
import type { TenantThread } from '@propflow/shared';

function formatTimestamp(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  return isToday
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ThreadRow({ item, onPress }: { item: TenantThread; onPress: () => void }) {
  const hasUnread = item.unreadCount > 0;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowAvatar}>
        <Text style={styles.rowAvatarText}>PM</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowSubject, hasUnread && styles.rowSubjectUnread]} numberOfLines={1}>
            {item.subject ?? 'Message from property manager'}
          </Text>
          <Text style={styles.rowTime}>{formatTimestamp(item.latestAt)}</Text>
        </View>
        <View style={styles.rowFooter}>
          <Text style={[styles.rowPreview, hasUnread && styles.rowPreviewUnread]} numberOfLines={1}>
            {item.latestBody}
          </Text>
          {hasUnread && (
            <View style={styles.unreadDot}>
              <Text style={styles.unreadDotText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const { data: threads = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['threads'],
    queryFn: tenantApi.messages.threads,
    staleTime: 30_000,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={threads}
        keyExtractor={(item) => item.threadId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#6366f1" />
        }
        ListHeaderComponent={() => <Text style={styles.heading}>Messages</Text>}
        renderItem={({ item }) => (
          <ThreadRow
            item={item}
            onPress={() =>
              router.push({
                pathname: '/conversation',
                params: {
                  threadId: item.threadId,
                  subject: item.subject ?? 'Message from property manager',
                },
              })
            }
          />
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyBody}>
              {isLoading
                ? 'Loading…'
                : 'Your property manager will reach out to you here.'}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: { paddingBottom: 24 },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },

  // Thread row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  rowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowAvatarText: { fontSize: 13, fontWeight: '700', color: '#6366f1' },
  rowBody: { flex: 1, gap: 3 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowSubject: { flex: 1, fontSize: 15, fontWeight: '400', color: '#374151' },
  rowSubjectUnread: { fontWeight: '700', color: '#111827' },
  rowTime: { fontSize: 12, color: '#9ca3af', flexShrink: 0 },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowPreview: { flex: 1, fontSize: 14, color: '#9ca3af' },
  rowPreviewUnread: { color: '#6b7280' },

  // Unread badge
  unreadDot: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    flexShrink: 0,
  },
  unreadDotText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Empty state
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151' },
  emptyBody: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 32 },
});
