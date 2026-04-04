import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// SecureStore has a 2048-byte limit per key.
// Supabase sessions easily exceed this (JWT + refresh token + user metadata).
// This adapter chunks large values across multiple keys transparently.

const CHUNK_SIZE = 1800; // safely under the 2048-byte limit

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const metaStr = await SecureStore.getItemAsync(key);
    if (!metaStr) return null;
    try {
      const meta = JSON.parse(metaStr);
      if (typeof meta.chunks === 'number') {
        const parts = await Promise.all(
          Array.from({ length: meta.chunks }, (_, i) =>
            SecureStore.getItemAsync(`${key}_chunk_${i}`)
          )
        );
        if (parts.some((p) => p === null)) return null;
        return parts.join('');
      }
    } catch {
      // Not a chunk-meta value — return as-is (plain string stored directly)
    }
    return metaStr;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    // Split into chunks and store each, then store metadata at the primary key
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await Promise.all(
      chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk))
    );
    await SecureStore.setItemAsync(key, JSON.stringify({ chunks: chunks.length }));
  },

  removeItem: async (key: string): Promise<void> => {
    const metaStr = await SecureStore.getItemAsync(key);
    if (metaStr) {
      try {
        const meta = JSON.parse(metaStr);
        if (typeof meta.chunks === 'number') {
          await Promise.all(
            Array.from({ length: meta.chunks }, (_, i) =>
              SecureStore.deleteItemAsync(`${key}_chunk_${i}`)
            )
          );
        }
      } catch {
        // Not chunked — nothing extra to clean up
      }
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // Must be false for React Native — no window.location to parse
      detectSessionInUrl: false,
    },
  }
);
