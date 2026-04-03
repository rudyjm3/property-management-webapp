import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';

export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.hero}>
          <View style={styles.iconBox}>
            <Text style={styles.iconEmoji}>🏠</Text>
          </View>
          <Text style={styles.title}>PropFlow</Text>
          <Text style={styles.subtitle}>
            Your home, simplified. Pay rent, submit requests, and stay connected with your property manager.
          </Text>
        </View>
        <Button title="Sign In" onPress={() => router.push('/(auth)/login')} variant="secondary" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#6366f1' },
  inner: { flex: 1, paddingHorizontal: 24, paddingVertical: 48, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  iconBox: { width: 80, height: 80, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 36 },
  title: { fontSize: 36, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 17, color: 'rgba(255,255,255,0.8)', textAlign: 'center', maxWidth: 280 },
});
