import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '@/lib/api';
import type { TenantMessage } from '@propflow/shared';

function MessageBubble({ item }: { item: TenantMessage }) {
  const fromTenant = item.isFromTenant;
  return (
    <View style={[styles.bubble, fromTenant ? styles.bubbleRight : styles.bubbleLeft]}>
      {!fromTenant && <Text style={styles.bubbleSender}>Property Manager</Text>}
      <Text style={[styles.bubbleText, fromTenant ? styles.bubbleTextRight : styles.bubbleTextLeft]}>
        {item.body}
      </Text>
      <Text style={[styles.bubbleTime, fromTenant ? styles.bubbleTimeRight : styles.bubbleTimeLeft]}>
        {new Date(item.createdAt).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}

export default function ConversationScreen() {
  const { threadId, subject } = useLocalSearchParams<{ threadId: string; subject: string }>();
  const [draft, setDraft] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => tenantApi.messages.thread(threadId),
    refetchInterval: 10_000,
    enabled: !!threadId,
  });

  const { mutate: sendReply, isPending } = useMutation({
    mutationFn: (body: string) => tenantApi.messages.reply(threadId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      setDraft('');
    },
  });

  const canSend = draft.trim().length > 0 && !isPending;

  return (
    <>
      <Stack.Screen options={{ title: subject ?? 'Messages' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={88}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={() => (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No messages in this thread yet.</Text>
              </View>
            )}
            renderItem={({ item }) => <MessageBubble item={item} />}
          />

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={() => { if (canSend) sendReply(draft.trim()); }}
              disabled={!canSend}
              activeOpacity={0.7}
            >
              <Text style={styles.sendBtnText}>{isPending ? '…' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  flex: { flex: 1 },

  // Message list
  messageList: { padding: 16, gap: 10, paddingBottom: 8 },

  // Bubbles
  bubble: { maxWidth: '80%', borderRadius: 16, padding: 12, gap: 4 },
  bubbleLeft: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
  },
  bubbleSender: { fontSize: 11, fontWeight: '600', color: '#6366f1', marginBottom: 2 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextLeft: { color: '#111827' },
  bubbleTextRight: { color: '#fff' },
  bubbleTime: { fontSize: 11 },
  bubbleTimeLeft: { color: '#9ca3af', alignSelf: 'flex-end' },
  bubbleTimeRight: { color: 'rgba(255,255,255,0.7)', alignSelf: 'flex-end' },

  // Empty state
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 14 },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f9fafb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sendBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignSelf: 'flex-end',
  },
  sendBtnDisabled: { backgroundColor: '#c7d2fe' },
  sendBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
