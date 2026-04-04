import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider } from '@/contexts/AuthContext';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { tenantApi } from '@/lib/api';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

async function registerForPushNotificationsAsync(): Promise<void> {
  // expo-notifications is removed from Expo Go in SDK 53+. Skip silently.
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) return;

  // Only physical devices can receive push notifications
  if (!Device.isDevice) return;

  // Dynamic require keeps expo-notifications from loading (and crashing) in Expo Go
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  // EAS project ID is required for Expo push tokens in SDK 50+
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return; // skip gracefully in local dev without EAS

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await tenantApi.registerPushToken(token);
  } catch {
    // Non-critical — push registration failure never surfaces to the user
  }
}

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}>
        <AuthProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="conversation"
              options={{
                headerShown: true,
                headerBackTitle: 'Messages',
                headerTintColor: '#6366f1',
                headerStyle: { backgroundColor: '#fff' },
                headerTitleStyle: { color: '#111827', fontWeight: '600' },
              }}
            />
          </Stack>
        </AuthProvider>
      </StripeProvider>
    </QueryClientProvider>
  );
}
