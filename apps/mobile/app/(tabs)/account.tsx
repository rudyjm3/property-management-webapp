import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { tenantApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { PreferredContact, UpdateTenantProfileInput } from '@propflow/shared';

const CONTACT_OPTIONS: PreferredContact[] = ['email', 'sms', 'call'];
const PROFILE_UPDATE_KEYS: Array<keyof UpdateTenantProfileInput> = [
  'phone',
  'preferredContact',
  'languagePreference',
  'emergencyContactName',
  'emergencyContactPhone',
  'emergencyContact1Relationship',
  'emergencyContact1Email',
  'emergencyContact2Name',
  'emergencyContact2Phone',
  'emergencyContact2Relationship',
];

function isValidPhone(value: string) {
  return /^[+()\-\s\d]{7,20}$/.test(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AccountScreen() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UpdateTenantProfileInput>({
    phone: profile?.phone ?? null,
    preferredContact: profile?.preferredContact ?? null,
    languagePreference: profile?.languagePreference ?? null,
    emergencyContactName: profile?.emergencyContactName ?? null,
    emergencyContactPhone: profile?.emergencyContactPhone ?? null,
    emergencyContact1Relationship: profile?.emergencyContact1Relationship ?? null,
    emergencyContact1Email: profile?.emergencyContact1Email ?? null,
    emergencyContact2Name: profile?.emergencyContact2Name ?? null,
    emergencyContact2Phone: profile?.emergencyContact2Phone ?? null,
    emergencyContact2Relationship: profile?.emergencyContact2Relationship ?? null,
  });

  useEffect(() => {
    if (editing) return;
    setForm({
      phone: profile?.phone ?? null,
      preferredContact: profile?.preferredContact ?? null,
      languagePreference: profile?.languagePreference ?? null,
      emergencyContactName: profile?.emergencyContactName ?? null,
      emergencyContactPhone: profile?.emergencyContactPhone ?? null,
      emergencyContact1Relationship: profile?.emergencyContact1Relationship ?? null,
      emergencyContact1Email: profile?.emergencyContact1Email ?? null,
      emergencyContact2Name: profile?.emergencyContact2Name ?? null,
      emergencyContact2Phone: profile?.emergencyContact2Phone ?? null,
      emergencyContact2Relationship: profile?.emergencyContact2Relationship ?? null,
    });
  }, [editing, profile]);

  const { mutate: saveProfile, isPending } = useMutation({
    mutationFn: (input: UpdateTenantProfileInput) => tenantApi.updateMe(input),
    onSuccess: async () => {
      await refreshProfile();
      Alert.alert('Saved', 'Your profile has been updated.');
      setEditing(false);
    },
    onError: (err: any) => {
      Alert.alert('Update failed', err?.message ?? 'Could not save your profile.');
    },
  });

  const initials = useMemo(() => profile?.name?.charAt(0).toUpperCase() ?? '?', [profile?.name]);

  function setField<K extends keyof UpdateTenantProfileInput>(key: K, value: UpdateTenantProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function normalize(input: string): string | null {
    const value = input.trim();
    return value.length ? value : null;
  }

  function resetForm() {
    setForm({
      phone: profile?.phone ?? null,
      preferredContact: profile?.preferredContact ?? null,
      languagePreference: profile?.languagePreference ?? null,
      emergencyContactName: profile?.emergencyContactName ?? null,
      emergencyContactPhone: profile?.emergencyContactPhone ?? null,
      emergencyContact1Relationship: profile?.emergencyContact1Relationship ?? null,
      emergencyContact1Email: profile?.emergencyContact1Email ?? null,
      emergencyContact2Name: profile?.emergencyContact2Name ?? null,
      emergencyContact2Phone: profile?.emergencyContact2Phone ?? null,
      emergencyContact2Relationship: profile?.emergencyContact2Relationship ?? null,
    });
    setEditing(false);
  }

  function handleSave() {
    if (!profile) {
      Alert.alert('Profile unavailable', 'Please wait for your profile to load before saving.');
      return;
    }

    const normalizedCurrent: UpdateTenantProfileInput = {
      phone: normalize(form.phone ?? ''),
      preferredContact: form.preferredContact ?? null,
      languagePreference: normalize(form.languagePreference ?? ''),
      emergencyContactName: normalize(form.emergencyContactName ?? ''),
      emergencyContactPhone: normalize(form.emergencyContactPhone ?? ''),
      emergencyContact1Relationship: normalize(form.emergencyContact1Relationship ?? ''),
      emergencyContact1Email: normalize(form.emergencyContact1Email ?? ''),
      emergencyContact2Name: normalize(form.emergencyContact2Name ?? ''),
      emergencyContact2Phone: normalize(form.emergencyContact2Phone ?? ''),
      emergencyContact2Relationship: normalize(form.emergencyContact2Relationship ?? ''),
    };

    const normalizedOriginal: UpdateTenantProfileInput = {
      phone: normalize(profile.phone ?? ''),
      preferredContact: profile.preferredContact ?? null,
      languagePreference: normalize(profile.languagePreference ?? ''),
      emergencyContactName: normalize(profile.emergencyContactName ?? ''),
      emergencyContactPhone: normalize(profile.emergencyContactPhone ?? ''),
      emergencyContact1Relationship: normalize(profile.emergencyContact1Relationship ?? ''),
      emergencyContact1Email: normalize(profile.emergencyContact1Email ?? ''),
      emergencyContact2Name: normalize(profile.emergencyContact2Name ?? ''),
      emergencyContact2Phone: normalize(profile.emergencyContact2Phone ?? ''),
      emergencyContact2Relationship: normalize(profile.emergencyContact2Relationship ?? ''),
    };

    const payload: UpdateTenantProfileInput = {};
    for (const key of PROFILE_UPDATE_KEYS) {
      if (normalizedCurrent[key] !== normalizedOriginal[key]) {
        (payload as Record<string, unknown>)[key] = normalizedCurrent[key] ?? null;
      }
    }

    if (Object.keys(payload).length === 0) {
      setEditing(false);
      return;
    }

    if (payload.phone && !isValidPhone(payload.phone)) {
      Alert.alert('Invalid phone', 'Phone must be 7-20 characters and contain valid phone characters.');
      return;
    }

    if (payload.emergencyContactPhone && !isValidPhone(payload.emergencyContactPhone)) {
      Alert.alert('Invalid emergency phone', 'Emergency contact phone must be 7-20 valid phone characters.');
      return;
    }

    if (payload.emergencyContact2Phone && !isValidPhone(payload.emergencyContact2Phone)) {
      Alert.alert('Invalid secondary emergency phone', 'Emergency contact 2 phone must be 7-20 valid phone characters.');
      return;
    }

    if (payload.emergencyContact1Email && !isValidEmail(payload.emergencyContact1Email)) {
      Alert.alert('Invalid emergency email', 'Emergency contact email must be a valid email address.');
      return;
    }

    saveProfile(payload);
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Account</Text>

        <Card>
          <View style={styles.profileRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{profile?.name ?? '-'}</Text>
              <Text style={styles.email}>{profile?.email ?? '-'}</Text>
              <Text style={styles.email}>{profile?.phone ?? '-'}</Text>
            </View>
          </View>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Profile Details</Text>
            {!editing ? <Button title="Edit" onPress={() => setEditing(true)} variant="secondary" /> : null}
          </View>

          <Text style={styles.inputLabel}>Phone</Text>
          <TextInput
            editable={editing}
            value={form.phone ?? ''}
            onChangeText={(v) => setField('phone', v)}
            style={[styles.input, !editing && styles.inputDisabled]}
            placeholder="Phone number"
            keyboardType="phone-pad"
          />

          <Text style={styles.inputLabel}>Preferred Contact</Text>
          <View style={styles.choiceRow}>
            {CONTACT_OPTIONS.map((option) => {
              const active = form.preferredContact === option;
              return (
                <TouchableOpacity
                  key={option}
                  disabled={!editing}
                  onPress={() => setField('preferredContact', option)}
                  style={[styles.choice, active && styles.choiceActive, !editing && styles.choiceDisabled]}
                >
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.inputLabel}>Language Preference</Text>
          <TextInput
            editable={editing}
            value={form.languagePreference ?? ''}
            onChangeText={(v) => setField('languagePreference', v)}
            style={[styles.input, !editing && styles.inputDisabled]}
            placeholder="e.g. en"
            autoCapitalize="none"
          />

        </Card>

        <Card style={{ marginTop: 12 }}>
          <Text style={styles.sectionLabel}>Emergency Contact 1</Text>

          <Text style={styles.inputLabel}>Name</Text>
          <TextInput editable={editing} value={form.emergencyContactName ?? ''} onChangeText={(v) => setField('emergencyContactName', v)} style={[styles.input, !editing && styles.inputDisabled]} placeholder="Full name" />

          <Text style={styles.inputLabel}>Phone</Text>
          <TextInput editable={editing} value={form.emergencyContactPhone ?? ''} onChangeText={(v) => setField('emergencyContactPhone', v)} style={[styles.input, !editing && styles.inputDisabled]} placeholder="Phone" keyboardType="phone-pad" />

          <Text style={styles.inputLabel}>Relationship</Text>
          <TextInput editable={editing} value={form.emergencyContact1Relationship ?? ''} onChangeText={(v) => setField('emergencyContact1Relationship', v)} style={[styles.input, !editing && styles.inputDisabled]} placeholder="Relationship" />

          <Text style={styles.inputLabel}>Email</Text>
          <TextInput editable={editing} value={form.emergencyContact1Email ?? ''} onChangeText={(v) => setField('emergencyContact1Email', v)} style={[styles.input, !editing && styles.inputDisabled]} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Text style={styles.sectionLabel}>Emergency Contact 2</Text>

          <Text style={styles.inputLabel}>Name</Text>
          <TextInput editable={editing} value={form.emergencyContact2Name ?? ''} onChangeText={(v) => setField('emergencyContact2Name', v)} style={[styles.input, !editing && styles.inputDisabled]} placeholder="Full name" />

          <Text style={styles.inputLabel}>Phone</Text>
          <TextInput editable={editing} value={form.emergencyContact2Phone ?? ''} onChangeText={(v) => setField('emergencyContact2Phone', v)} style={[styles.input, !editing && styles.inputDisabled]} placeholder="Phone" keyboardType="phone-pad" />

          <Text style={styles.inputLabel}>Relationship</Text>
          <TextInput editable={editing} value={form.emergencyContact2Relationship ?? ''} onChangeText={(v) => setField('emergencyContact2Relationship', v)} style={[styles.input, !editing && styles.inputDisabled]} placeholder="Relationship" />
        </Card>

        {editing && (
          <View style={styles.actionRow}>
            <Button title="Cancel" onPress={resetForm} variant="secondary" style={{ flex: 1 }} />
            <Button title={isPending ? 'Saving...' : 'Save'} onPress={handleSave} loading={isPending} style={{ flex: 1 }} />
          </View>
        )}

        {profile?.activeLease && (
          <Card style={{ marginTop: 12 }}>
            <Text style={styles.sectionLabel}>Current Lease</Text>
            {[
              ['Unit', profile.activeLease.unit.unitNumber],
              ['Property', profile.activeLease.unit.property.name],
              ['Monthly rent', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(profile.activeLease.rentAmount))],
              ['Lease ends', new Date(profile.activeLease.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
            ].map(([label, value]) => (
              <View key={label} style={styles.leaseRow}>
                <Text style={styles.leaseLabel}>{label}</Text>
                <Text style={styles.leaseValue}>{value}</Text>
              </View>
            ))}
          </Card>
        )}

        <Button title="Sign Out" onPress={handleSignOut} variant="secondary" style={{ marginTop: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 12 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#4338ca' },
  profileInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#111827' },
  email: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  inputLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  inputDisabled: { backgroundColor: '#f3f4f6', color: '#6b7280' },
  choiceRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  choice: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  choiceActive: { backgroundColor: '#e0e7ff', borderColor: '#6366f1' },
  choiceDisabled: { opacity: 0.7 },
  choiceText: { fontSize: 13, color: '#374151', textTransform: 'capitalize' },
  choiceTextActive: { color: '#4338ca', fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  leaseRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  leaseLabel: { fontSize: 14, color: '#6b7280' },
  leaseValue: { fontSize: 14, fontWeight: '500', color: '#111827' },
});
