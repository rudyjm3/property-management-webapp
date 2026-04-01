import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setLoading(true); setError(null);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: 'propflow://reset-password' });
    setLoading(false);
    if (e) setError(e.message); else setSent(true);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.inner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>Reset password</Text>
          <Text style={styles.subheading}>Enter your email and we'll send you a reset link.</Text>
          {sent ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>Check your email</Text>
              <Text style={styles.successBody}>We sent a reset link to {email}</Text>
            </View>
          ) : (
            <View style={styles.form}>
              <View>
                <Text style={styles.label}>Email</Text>
                <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
              <Button title="Send Reset Link" onPress={handleReset} loading={loading} style={styles.mt} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  back: { marginBottom: 32 },
  backText: { color: '#6366f1', fontSize: 16 },
  heading: { fontSize: 30, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subheading: { color: '#6b7280', marginBottom: 32 },
  form: { gap: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, backgroundColor: '#f9fafb' },
  error: { color: '#ef4444', fontSize: 14 },
  mt: { marginTop: 8 },
  successBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 12, padding: 16 },
  successTitle: { color: '#15803d', fontWeight: '600' },
  successBody: { color: '#16a34a', fontSize: 14, marginTop: 4 },
});
