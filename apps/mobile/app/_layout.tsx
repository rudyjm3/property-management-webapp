import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider } from '@/contexts/AuthContext';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}>
        <AuthProvider>
          <StatusBar style="auto" />
          <Slot />
        </AuthProvider>
      </StripeProvider>
    </QueryClientProvider>
  );
}
