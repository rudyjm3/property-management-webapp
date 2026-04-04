import { useMemo } from 'react';
import { Alert, FlatList, Linking, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { tenantApi } from '@/lib/api';
import type { TenantDocumentListItem } from '@propflow/shared';

const CATEGORY_LABELS: Record<string, string> = {
  lease: 'Lease',
  inspection: 'Inspection',
  insurance: 'Insurance',
  id: 'ID',
  photo: 'Photo',
  other: 'Other',
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function groupLabel(item: TenantDocumentListItem) {
  return CATEGORY_LABELS[item.docCategory ?? 'other'] ?? 'Other';
}

export default function DocumentsScreen() {
  const { data = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['documents'],
    queryFn: tenantApi.documents.list,
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, TenantDocumentListItem[]>();
    for (const item of data) {
      const key = groupLabel(item);
      const group = map.get(key) ?? [];
      group.push(item);
      map.set(key, group);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([label, items]) => [
        { id: `header:${label}`, type: 'header' as const, label },
        ...items.map((item) => ({ id: item.id, type: 'item' as const, item })),
      ]);
  }, [data]);

  async function openDocument(documentId: string) {
    try {
      const { downloadUrl } = await tenantApi.documents.downloadUrl(documentId);
      const canOpen = await Linking.canOpenURL(downloadUrl);
      if (!canOpen) {
        Alert.alert('Unable to open', 'No app is available to open this document URL.');
        return;
      }
      await Linking.openURL(downloadUrl);
    } catch (err: any) {
      Alert.alert('Download failed', err?.message ?? 'Could not open document.');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={grouped}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#6366f1" />}
        ListHeaderComponent={<Text style={styles.heading}>Documents</Text>}
        ListEmptyComponent={<Text style={styles.empty}>{isLoading ? 'Loading...' : 'No documents available.'}</Text>}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <Text style={styles.sectionTitle}>{item.label}</Text>;
          }

          const doc = item.item;
          const title = doc.label?.trim() || doc.name;
          return (
            <TouchableOpacity style={styles.row} onPress={() => openDocument(doc.id)} activeOpacity={0.7}>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.rowMeta}>
                  {formatSize(doc.sizeBytes)} {' · '}
                  {new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <Text style={styles.openText}>Open</Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16, paddingBottom: 28 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 8 },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowMeta: { marginTop: 4, fontSize: 12, color: '#6b7280' },
  openText: { fontSize: 13, fontWeight: '600', color: '#6366f1' },
  empty: { textAlign: 'center', color: '#9ca3af', paddingVertical: 48 },
});
