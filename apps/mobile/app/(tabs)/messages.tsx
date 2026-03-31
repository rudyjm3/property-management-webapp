import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MessagesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text className="text-5xl">💬</Text>
        <Text className="text-xl font-bold text-gray-900">Messages</Text>
        <Text className="text-gray-500 text-center">
          In-app messaging and push notifications coming in Weeks 29-30.
        </Text>
      </View>
    </SafeAreaView>
  );
}
