import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

type Step = 'code' | 'set-password';

interface ValidateResult {
  tenantId: string;
  email: string;
  name: string;
  organizationName: string;
}

interface OtpResult {
  token: string;
  email: string;
}

export default function ActivateScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [validatedInfo, setValidatedInfo] = useState<ValidateResult | null>(null);
  const [otpToken, setOtpToken] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleValidateCode() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 0) {
      setError('Please enter your invite code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/invite/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? 'Invalid invite code.');
        return;
      }
      const info: ValidateResult = body.data;
      setValidatedInfo(info);

      // Request an OTP token so we can establish a Supabase session
      const otpRes = await fetch(`${API_URL}/api/v1/invite/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const otpBody = await otpRes.json();
      if (!otpRes.ok) {
        setError(otpBody?.error?.message ?? 'Could not generate login token. Please try again.');
        return;
      }
      const otp: OtpResult = otpBody.data;
      setOtpToken(otp.token);
      setOtpEmail(otp.email);
      setStep('set-password');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword() {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Exchange the OTP token for a live session
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: otpEmail,
        token: otpToken,
        type: 'email',
      });
      if (otpError) {
        setError('Your invite link has expired. Please ask your property manager to resend the invite.');
        return;
      }

      // Set the permanent password
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Session is live — AuthContext will pick this up and redirect to tabs
      router.replace('/(tabs)');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.inner}>
          <TouchableOpacity onPress={() => (step === 'set-password' ? setStep('code') : router.back())} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {step === 'code' ? (
            <>
              <Text style={styles.heading}>Activate your account</Text>
              <Text style={styles.subheading}>
                Enter the 8-character invite code from your welcome email.
              </Text>
              <View style={styles.form}>
                <View>
                  <Text style={styles.label}>Invite Code</Text>
                  <TextInput
                    style={styles.codeInput}
                    value={code}
                    onChangeText={(v) => setCode(v.toUpperCase())}
                    placeholder="A3F2B1C9"
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect={false}
                    maxLength={8}
                    keyboardType="default"
                  />
                </View>
                {error && <Text style={styles.error}>{error}</Text>}
                <Button title="Continue" onPress={handleValidateCode} loading={loading} style={styles.mt} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.heading}>Set your password</Text>
              {validatedInfo && (
                <Text style={styles.subheading}>
                  Welcome, {validatedInfo.name}! You've been invited by {validatedInfo.organizationName}.
                </Text>
              )}
              <View style={styles.form}>
                <View>
                  <Text style={styles.label}>New Password</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={styles.passwordInput}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="At least 8 characters"
                      secureTextEntry={!showPassword}
                      autoComplete="new-password"
                    />
                    <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn} hitSlop={8}>
                      <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                    </Pressable>
                  </View>
                </View>
                <View>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter your password"
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                  />
                </View>
                {error && <Text style={styles.error}>{error}</Text>}
                <Button title="Activate Account" onPress={handleSetPassword} loading={loading} style={styles.mt} />
              </View>
            </>
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
  subheading: { color: '#6b7280', marginBottom: 32, lineHeight: 22 },
  form: { gap: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, backgroundColor: '#f9fafb' },
  codeInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 24, fontWeight: '700', letterSpacing: 8, backgroundColor: '#f9fafb', textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#f9fafb' },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  eyeBtn: { paddingHorizontal: 14 },
  eyeIcon: { fontSize: 18 },
  error: { color: '#ef4444', fontSize: 14 },
  mt: { marginTop: 8 },
});
