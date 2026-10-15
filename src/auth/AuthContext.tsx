import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../data';
import type { Profile } from '../lib/types';

interface AuthState {
  me: Profile | null;
  loading: boolean;
  /** Pengguna datang dari tautan reset kata sandi. */
  recovery: boolean;
  refresh: () => Promise<void>;
  clearRecovery: () => void;
}

const Ctx = createContext<AuthState>({ me: null, loading: true, recovery: false, refresh: async () => {}, clearRecovery: () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  const refresh = useCallback(async () => {
    try { setMe(await api.currentUser()); } catch { setMe(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    return api.onAuthChange((ev) => {
      if (ev === 'password_recovery') setRecovery(true);
      // tunda agar tidak memanggil Supabase di dalam callback auth-nya sendiri
      setTimeout(refresh, 0);
    });
  }, [refresh]);

  return (
    <Ctx.Provider value={{ me, loading, recovery, refresh, clearRecovery: () => setRecovery(false) }}>
      {children}
    </Ctx.Provider>
  );
}
