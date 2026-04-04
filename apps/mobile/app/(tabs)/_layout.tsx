import { Tabs, Redirect } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function TabLayout() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/welcome" />;

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#6366f1', tabBarInactiveTintColor: '#9ca3af', headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: () => <Text style={{ fontSize: 20 }}>{'\u{1F3E0}'}</Text> }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: () => <Text style={{ fontSize: 20 }}>{'\u{1F4B3}'}</Text> }} />
      <Tabs.Screen name="maintenance" options={{ title: 'Maintenance', tabBarIcon: () => <Text style={{ fontSize: 20 }}>{'\u{1F527}'}</Text> }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: () => <Text style={{ fontSize: 20 }}>{'\u{1F4AC}'}</Text> }} />
      <Tabs.Screen name="documents" options={{ title: 'Documents', tabBarIcon: () => <Text style={{ fontSize: 20 }}>{'\u{1F4C4}'}</Text> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: () => <Text style={{ fontSize: 20 }}>{'\u{1F464}'}</Text> }} />
    </Tabs>
  );
}
