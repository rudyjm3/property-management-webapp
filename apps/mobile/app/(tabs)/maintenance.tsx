import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MaintenanceScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.emoji}>🔧</Text>
        <Text style={styles.title}>Maintenance</Text>
        <Text style={styles.body}>Work order submission and tracking coming in Weeks 27-28.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emoji: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  body: { color: '#6b7280', textAlign: 'center' },
});
