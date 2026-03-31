import { View, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-primary-500">
      <View className="flex-1 items-center justify-between px-6 py-12">
        <View className="flex-1 items-center justify-center gap-4">
          <View className="w-20 h-20 bg-white/20 rounded-3xl items-center justify-center">
            <Text className="text-4xl">🏠</Text>
          </View>
          <Text className="text-4xl font-bold text-white tracking-tight">PropFlow</Text>
          <Text className="text-lg text-white/80 text-center max-w-xs">
            Your home, simplified. Pay rent, submit requests, and stay connected with your property manager.
          </Text>
        </View>

        <View className="w-full gap-3">
          <Button
            title="Sign In"
            onPress={() => router.push('/(auth)/login')}
            variant="secondary"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
