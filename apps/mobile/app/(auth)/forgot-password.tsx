import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
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
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: 'propflow://reset-password' }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setSent(true);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-8">
          <TouchableOpacity onPress={() => router.back()} className="mb-8">
            <Text className="text-primary-500 text-base">← Back</Text>
          </TouchableOpacity>

          <Text className="text-3xl font-bold text-gray-900 mb-2">Reset password</Text>
          <Text className="text-gray-500 mb-8">
            Enter your email and we'll send you a link to reset your password.
          </Text>

          {sent ? (
            <View className="bg-green-50 border border-green-200 rounded-xl p-4">
              <Text className="text-green-700 font-medium">Check your email</Text>
              <Text className="text-green-600 text-sm mt-1">
                We sent a password reset link to {email}
              </Text>
            </View>
          ) : (
            <View className="gap-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Email</Text>
                <TextInput
                  className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>

              {error && (
                <Text className="text-red-500 text-sm">{error}</Text>
              )}

              <Button
                title="Send Reset Link"
                onPress={handleReset}
                loading={loading}
                className="mt-2"
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
