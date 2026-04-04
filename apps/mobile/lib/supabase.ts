import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// SecureStore has a 2048-byte limit per key. Supabase session tokens exceed this,
// so we chunk large values across multiple keys.
const CHUNK_SIZE = 1800;

const ChunkedSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const metaRaw = await SecureStore.getItemAsync(`${key}__meta`);
    if (!metaRaw) {
      // No chunked value — fall back to plain key (handles legacy single-chunk items)
      return SecureStore.getItemAsync(key);
    }
    const { chunks } = JSON.parse(metaRaw) as { chunks: number };
    const parts: string[] = [];
    for (let i = 0; i < chunks; i++) {
      const part = await SecureStore.getItemAsync(`${key}__${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= CHUNK_SIZE) {
      // Small enough to store directly; clear any previous chunks
      await SecureStore.deleteItemAsync(`${key}__meta`);
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${key}__meta`, JSON.stringify({ chunks: chunks.length }));
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}__${i}`, chunk)));
    // Remove the plain key in case it existed before
    await SecureStore.deleteItemAsync(key);
  },

  removeItem: async (key: string): Promise<void> => {
    const metaRaw = await SecureStore.getItemAsync(`${key}__meta`);
    if (metaRaw) {
      const { chunks } = JSON.parse(metaRaw) as { chunks: number };
      await SecureStore.deleteItemAsync(`${key}__meta`);
      await Promise.all(
        Array.from({ length: chunks }, (_, i) => SecureStore.deleteItemAsync(`${key}__${i}`))
      );
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ChunkedSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // Must be false for React Native — no window.location to parse
      detectSessionInUrl: false,
    },
  }
);
