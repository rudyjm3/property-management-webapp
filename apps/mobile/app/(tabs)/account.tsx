import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function AccountScreen() {
  const { profile, signOut } = useAuth();

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900">Account</Text>
      </View>

      <View className="px-4 gap-4">
        {/* Profile card */}
        <Card>
          <View className="flex-row items-center gap-4">
            <View className="w-14 h-14 rounded-full bg-primary-100 items-center justify-center">
              <Text className="text-2xl font-bold text-primary-600">
                {profile?.name?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-gray-900">{profile?.name ?? '—'}</Text>
              <Text className="text-sm text-gray-500">{profile?.email ?? '—'}</Text>
              {profile?.phone && (
                <Text className="text-sm text-gray-500">{profile.phone}</Text>
              )}
            </View>
          </View>
        </Card>

        {/* Lease info */}
        {profile?.activeLease && (
          <Card>
            <Text className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-3">
              Current Lease
            </Text>
            <View className="gap-2">
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500">Unit</Text>
                <Text className="text-sm font-medium text-gray-900">
                  {profile.activeLease.unit.unitNumber}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500">Property</Text>
                <Text className="text-sm font-medium text-gray-900">
                  {profile.activeLease.unit.property.name}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500">Monthly rent</Text>
                <Text className="text-sm font-medium text-gray-900">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                    Number(profile.activeLease.rentAmount)
                  )}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500">Lease ends</Text>
                <Text className="text-sm font-medium text-gray-900">
                  {new Date(profile.activeLease.endDate).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </Text>
              </View>
            </View>
          </Card>
        )}

        <Button title="Sign Out" onPress={handleSignOut} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}
