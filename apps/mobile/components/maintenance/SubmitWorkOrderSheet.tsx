import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Switch,
  StyleSheet,
  Alert,
} from 'react-native';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useSubmitWorkOrder, type PhotoToUpload } from '../../hooks/useSubmitWorkOrder';
import type { WorkOrderCategory, WorkOrderPriority } from '@propflow/shared';

const PRIORITIES: { value: WorkOrderPriority; label: string; sublabel: string; border: string; bg: string; text: string }[] = [
  { value: 'routine', label: 'Routine', sublabel: 'Standard request, no immediate rush', border: '#d1d5db', bg: '#f9fafb', text: '#374151' },
  { value: 'urgent', label: 'Urgent', sublabel: 'Significant issue needing attention soon', border: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
  { value: 'emergency', label: 'Emergency', sublabel: 'Safety risk or serious damage (flooding, gas, no heat)', border: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
];

const CATEGORIES: { value: WorkOrderCategory; label: string }[] = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'pest', label: 'Pest' },
  { value: 'structural', label: 'Structural' },
  { value: 'cosmetic', label: 'Cosmetic' },
  { value: 'grounds', label: 'Grounds' },
  { value: 'general', label: 'General' },
  { value: 'other', label: 'Other' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'form' | 'photos' | 'processing' | 'success' | 'error';

export default function SubmitWorkOrderSheet({ visible, onClose }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<WorkOrderCategory>('general');
  const [priority, setPriority] = useState<WorkOrderPriority>('routine');
  const [description, setDescription] = useState('');
  const [entryPermission, setEntryPermission] = useState(false);
  const [preferredWindow, setPreferredWindow] = useState('');
  const [photos, setPhotos] = useState<PhotoToUpload[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const submitMutation = useSubmitWorkOrder();

  function resetAndClose() {
    setStep('form');
    setTitle('');
    setCategory('general');
    setPriority('routine');
    setDescription('');
    setEntryPermission(false);
    setPreferredWindow('');
    setPhotos([]);
    setErrorMsg('');
    onClose();
  }

  async function pickPhoto() {
    if (photos.length >= 5) {
      Alert.alert('Photo limit', 'You can attach up to 5 photos.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera roll access is needed to attach photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const fileName = asset.fileName ?? `photo_${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      setPhotos((prev) => [...prev, { uri: asset.uri, fileName, mimeType }]);
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!description.trim()) {
      Alert.alert('Description required', 'Please describe the issue.');
      return;
    }

    setStep('processing');
    try {
      await submitMutation.mutateAsync({
        title: title.trim() || undefined,
        category,
        priority,
        description: description.trim(),
        entryPermissionGranted: entryPermission,
        preferredContactWindow: preferredWindow.trim() || undefined,
        photos,
      });
      setStep('success');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStep('error');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={resetAndClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {step === 'success' ? 'Request Submitted' : 'New Maintenance Request'}
          </Text>
          {step !== 'processing' && (
            <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Form Step ── */}
        {step === 'form' && (
          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <Text style={styles.label}>Title (optional)</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Leaking faucet in bathroom"
              placeholderTextColor="#9ca3af"
              maxLength={200}
            />

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[styles.categoryChip, category === cat.value && styles.categoryChipActive]}
                  onPress={() => setCategory(cat.value)}
                >
                  <Text style={[styles.categoryChipText, category === cat.value && styles.categoryChipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Priority */}
            <Text style={styles.label}>Urgency</Text>
            <View style={styles.priorityGroup}>
              {PRIORITIES.map((p) => {
                const active = priority === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    style={[styles.priorityCard, { borderColor: active ? p.border : '#e5e7eb', backgroundColor: active ? p.bg : '#fff' }]}
                    onPress={() => setPriority(p.value)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.priorityCardRow}>
                      <View style={[styles.priorityRadio, active && { borderColor: p.border }]}>
                        {active && <View style={[styles.priorityRadioDot, { backgroundColor: p.border }]} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.priorityLabel, active && { color: p.text }]}>{p.label}</Text>
                        <Text style={styles.prioritySublabel}>{p.sublabel}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {priority === 'emergency' && (
              <View style={styles.emergencyNote}>
                <Text style={styles.emergencyNoteText}>Emergency requests are reviewed immediately. Staff may contact you to verify.</Text>
              </View>
            )}

            {/* Description */}
            <Text style={styles.label}>Description <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the issue in detail…"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={2000}
            />

            {/* Entry Permission */}
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.label}>Allow entry while away</Text>
                <Text style={styles.hint}>Maintenance staff may enter your unit if you're not home.</Text>
              </View>
              <Switch
                value={entryPermission}
                onValueChange={setEntryPermission}
                trackColor={{ false: '#d1d5db', true: '#6366f1' }}
                thumbColor="#fff"
              />
            </View>

            {/* Preferred Window */}
            {entryPermission && (
              <>
                <Text style={styles.label}>Preferred availability</Text>
                <TextInput
                  style={styles.input}
                  value={preferredWindow}
                  onChangeText={setPreferredWindow}
                  placeholder="e.g. Weekdays after 3pm"
                  placeholderTextColor="#9ca3af"
                  maxLength={200}
                />
              </>
            )}

            <View style={styles.formActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('photos')}>
                <Text style={styles.btnSecondaryText}>Add Photos ({photos.length}/5)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, !description.trim() && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={!description.trim()}
              >
                <Text style={styles.btnPrimaryText}>Submit Request</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── Photos Step ── */}
        {step === 'photos' && (
          <ScrollView style={styles.body}>
            <Text style={styles.sectionBody}>
              Attach up to 5 photos to help describe the issue. This step is optional.
            </Text>

            <View style={styles.photoGrid}>
              {photos.map((photo, idx) => (
                <View key={idx} style={styles.photoThumb}>
                  <Image source={{ uri: photo.uri }} style={styles.photoImg} />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(idx)}>
                    <Text style={styles.photoRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 5 && (
                <TouchableOpacity style={styles.photoAdd} onPress={pickPhoto}>
                  <Text style={styles.photoAddIcon}>+</Text>
                  <Text style={styles.photoAddText}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('form')}>
                <Text style={styles.btnSecondaryText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmit}>
                <Text style={styles.btnPrimaryText}>Submit Request</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── Processing Step ── */}
        {step === 'processing' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.processingText}>
              {photos.length > 0 ? 'Uploading photos and submitting…' : 'Submitting request…'}
            </Text>
          </View>
        )}

        {/* ── Success Step ── */}
        {step === 'success' && (
          <View style={styles.centered}>
            <Text style={styles.successEmoji}>✅</Text>
            <Text style={styles.successTitle}>Request Submitted!</Text>
            <Text style={styles.successBody}>
              Your maintenance request has been received. Your property manager will review it and be in touch soon.
            </Text>
            <TouchableOpacity style={[styles.btnPrimary, { marginTop: 24, flex: 0, alignSelf: 'stretch' }]} onPress={resetAndClose}>
              <Text style={styles.btnPrimaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Error Step ── */}
        {step === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.successEmoji}>⚠️</Text>
            <Text style={styles.successTitle}>Submission Failed</Text>
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{errorMsg}</Text>
            </View>
            <View style={[styles.formActions, { marginTop: 24 }]}>
              <TouchableOpacity style={styles.btnSecondary} onPress={resetAndClose}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => setStep('form')}>
                <Text style={styles.btnPrimaryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  closeBtn: { padding: 4 },
  closeBtnText: { color: '#6366f1', fontSize: 15, fontWeight: '600' },
  body: { flex: 1, padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  required: { color: '#ef4444' },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  },
  textArea: { minHeight: 110, paddingTop: 11 },
  categoryScroll: { marginBottom: 4 },
  categoryChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  categoryChipActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  categoryChipText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  categoryChipTextActive: { color: '#6366f1', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  rowText: { flex: 1 },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 32 },
  btnPrimary: {
    flex: 1,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { backgroundColor: '#c7d2fe' },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  btnSecondaryText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  sectionBody: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginTop: 4 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  photoThumb: { width: 100, height: 100, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  photoAdd: {
    width: 100,
    height: 100,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  photoAddIcon: { fontSize: 24, color: '#9ca3af' },
  photoAddText: { fontSize: 12, color: '#9ca3af' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  processingText: { marginTop: 20, fontSize: 15, color: '#6b7280', textAlign: 'center' },
  successEmoji: { fontSize: 56, marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'center' },
  successBody: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 21 },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    width: '100%',
  },
  errorBoxText: { color: '#dc2626', fontSize: 14, lineHeight: 20 },
  priorityGroup: { gap: 8, marginTop: 4 },
  priorityCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  priorityCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  priorityRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityRadioDot: { width: 10, height: 10, borderRadius: 5 },
  priorityLabel: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  prioritySublabel: { fontSize: 12, color: '#6b7280', lineHeight: 16 },
  emergencyNote: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  emergencyNoteText: { fontSize: 12, color: '#991b1b', lineHeight: 17 },
});
