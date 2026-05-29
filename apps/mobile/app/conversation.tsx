import { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import * as ImagePicker from 'expo-image-picker';
import { tenantApi } from '@/lib/api';
import type { TenantMessage } from '@propflow/shared';

interface AttachmentPayload {
  s3Key: string;
  name: string;
  mimeType: string;
}

function AttachmentChip({ url, name, isFromTenant }: { url: string; name: string; isFromTenant: boolean }) {
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open attachment.'))}
      style={[styles.attachmentChip, isFromTenant ? styles.attachmentChipRight : styles.attachmentChipLeft]}
      activeOpacity={0.7}
    >
      <Text style={[styles.attachmentChipText, isFromTenant ? styles.attachmentChipTextRight : styles.attachmentChipTextLeft]}>
        📎 {name}
      </Text>
    </TouchableOpacity>
  );
}

function MessageBubble({ item }: { item: TenantMessage }) {
  const fromTenant = item.isFromTenant;
  return (
    <View style={[styles.bubble, fromTenant ? styles.bubbleRight : styles.bubbleLeft]}>
      {!fromTenant && <Text style={styles.bubbleSender}>Property Manager</Text>}
      <Text style={[styles.bubbleText, fromTenant ? styles.bubbleTextRight : styles.bubbleTextLeft]}>
        {item.body}
      </Text>
      {item.attachmentDownloadUrl && item.attachmentName && (
        <AttachmentChip
          url={item.attachmentDownloadUrl}
          name={item.attachmentName}
          isFromTenant={fromTenant}
        />
      )}
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
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentPayload | null>(null);
  const [pendingAttachmentName, setPendingAttachmentName] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => tenantApi.messages.thread(threadId),
    refetchInterval: 10_000,
    enabled: !!threadId,
  });

  const { mutate: sendReply, isPending } = useMutation({
    mutationFn: ({ body, attachment }: { body: string; attachment: AttachmentPayload | null }) =>
      tenantApi.messages.reply(threadId, body, attachment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      setDraft('');
      setPendingAttachment(null);
      setPendingAttachmentName(null);
    },
  });

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access to attach images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const fileName = asset.fileName ?? `photo_${Date.now()}.jpg`;
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const uri = asset.uri;

    setUploadingAttachment(true);
    try {
      const { uploadUrl, s3Key } = await tenantApi.messages.attachmentUploadUrl(fileName, mimeType);

      const response = await fetch(uri);
      const blob = await response.blob();

      await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': mimeType },
      });

      setPendingAttachment({ s3Key, name: fileName, mimeType });
      setPendingAttachmentName(fileName);
    } catch {
      Alert.alert('Upload failed', 'Could not upload the attachment. Please try again.');
    } finally {
      setUploadingAttachment(false);
    }
  }

  const canSend = (draft.trim().length > 0 || pendingAttachment !== null) && !isPending && !uploadingAttachment;

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

          {/* Pending attachment preview */}
          {pendingAttachmentName && (
            <View style={styles.attachmentPreviewBar}>
              <Text style={styles.attachmentPreviewText} numberOfLines={1}>📎 {pendingAttachmentName}</Text>
              <TouchableOpacity
                onPress={() => { setPendingAttachment(null); setPendingAttachmentName(null); }}
                style={styles.attachmentPreviewRemove}
              >
                <Text style={styles.attachmentPreviewRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={pickImage}
              disabled={uploadingAttachment}
              activeOpacity={0.7}
            >
              <Text style={styles.attachBtnText}>{uploadingAttachment ? '…' : '📎'}</Text>
            </TouchableOpacity>
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
              onPress={() => {
                if (canSend) {
                  sendReply({ body: draft.trim() || ' ', attachment: pendingAttachment });
                }
              }}
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

  // Attachment chip inside bubble
  attachmentChip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
  },
  attachmentChipLeft: { backgroundColor: '#f3f4f6' },
  attachmentChipRight: { backgroundColor: 'rgba(255,255,255,0.2)' },
  attachmentChipText: { fontSize: 13, fontWeight: '500' },
  attachmentChipTextLeft: { color: '#374151' },
  attachmentChipTextRight: { color: '#fff' },

  // Empty state
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 14 },

  // Attachment preview bar above input
  attachmentPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
    gap: 8,
  },
  attachmentPreviewText: { flex: 1, fontSize: 13, color: '#1e40af' },
  attachmentPreviewRemove: { padding: 4 },
  attachmentPreviewRemoveText: { fontSize: 14, color: '#1e40af', fontWeight: '600' },

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
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  attachBtnText: { fontSize: 18 },
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
