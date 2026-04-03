import { View, Text, Alert, StyleSheet } from 'react-native';
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
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Account</Text>
      <View style={styles.content}>
        <Card>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile?.name?.charAt(0).toUpperCase() ?? '?'}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{profile?.name ?? '—'}</Text>
              <Text style={styles.email}>{profile?.email ?? '—'}</Text>
              {profile?.phone && <Text style={styles.email}>{profile.phone}</Text>}
            </View>
          </View>
        </Card>

        {profile?.activeLease && (
          <Card style={{ marginTop: 12 }}>
            <Text style={styles.sectionLabel}>Current Lease</Text>
            {[
              ['Unit', profile.activeLease.unit.unitNumber],
              ['Property', profile.activeLease.unit.property.name],
              ['Monthly rent', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(profile.activeLease.rentAmount))],
              ['Lease ends', new Date(profile.activeLease.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
            ].map(([label, value]) => (
              <View key={label} style={styles.leaseRow}>
                <Text style={styles.leaseLabel}>{label}</Text>
                <Text style={styles.leaseValue}>{value}</Text>
              </View>
            ))}
          </Card>
        )}

        <Button title="Sign Out" onPress={handleSignOut} variant="secondary" style={{ marginTop: 16 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  content: { padding: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#4338ca' },
  profileInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#111827' },
  email: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  leaseRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  leaseLabel: { fontSize: 14, color: '#6b7280' },
  leaseValue: { fontSize: 14, fontWeight: '500', color: '#111827' },
});
