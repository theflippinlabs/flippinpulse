import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, AccessStatus } from '../types';
import { resolveAccessStatus } from '../lib/wallet';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  accessStatus: AccessStatus | null;
  loading: boolean;
  refreshAccessStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  accessStatus: null,
  loading: true,
  refreshAccessStatus: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data as Profile);
  };

  const refreshAccessStatus = async () => {
    if (!user) return;
    try {
      const status = await resolveAccessStatus(user.id);
      setAccessStatus(status);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        resolveAccessStatus(session.user.id)
          .then(setAccessStatus)
          .catch(() => {});
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
          const status = await resolveAccessStatus(session.user.id).catch(() => null);
          setAccessStatus(status);
        } else {
          setProfile(null);
          setAccessStatus(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, profile, accessStatus, loading, refreshAccessStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
