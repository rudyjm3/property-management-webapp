import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MaintenanceScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text className="text-5xl">🔧</Text>
        <Text className="text-xl font-bold text-gray-900">Maintenance</Text>
        <Text className="text-gray-500 text-center">
          Work order submission and tracking coming in Weeks 27-28.
        </Text>
      </View>
    </SafeAreaView>
  );
}
