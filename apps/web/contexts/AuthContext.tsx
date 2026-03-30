'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';
import { api, setAuthContext } from '@/lib/api';

interface AuthProfile {
  userId: string;
  orgId: string;
  name: string;
  email: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeAmount: string;
  };
}

interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  session: Session | null;
  loading: boolean;
  needsOnboarding: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  needsOnboarding: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const data = await api.auth.me();
      const authProfile: AuthProfile = {
        userId: data.id,
        orgId: data.organizationId,
        name: data.name,
        email: data.email,
        role: data.role,
        organization: data.organization,
      };
      setProfile(authProfile);
      setNeedsOnboarding(false);
      setAuthContext(data.organizationId, data.id);
    } catch (err: any) {
      setProfile(null);
      if (err?.message?.includes('User account not found') || err?.message?.includes('onboarding')) {
        setNeedsOnboarding(true);
      }
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();

    // Get the initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile();
      } else {
        setProfile(null);
        setNeedsOnboarding(false);
        setAuthContext('', '');
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setProfile(null);
    setAuthContext('', '');
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, needsOnboarding, signOut, refreshProfile: fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
