import type { AuthenticatedUser, LoginInput, Permission } from '@lemuria/shared';
import type { ReactNode } from 'react';
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';
import { api, setAccessToken } from '@/lib/api';

interface AuthState {
  user: AuthenticatedUser | null;
  /** True until the initial silent refresh has settled. */
  initialising: boolean;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Hides UI the caller cannot use. The server still enforces every rule. */
  can: (...permissions: Permission[]) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [initialising, setInitialising] = useState(true);

  /**
   * On boot, try to mint an access token from the httpOnly refresh cookie. This
   * is what keeps a page reload from bouncing the user back to the login screen
   * even though no token is persisted in JavaScript-readable storage.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const refreshed = await api.refresh();
      if (cancelled) return;
      if (refreshed) {
        try {
          setUser(await api.get<AuthenticatedUser>('/auth/me'));
        } catch {
          setUser(null);
        }
      }
      setInitialising(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The API client raises this when a refresh finally fails mid-session.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('lemuria:session-expired', onExpired);
    return () => window.removeEventListener('lemuria:session-expired', onExpired);
  }, []);

  const signIn = useCallback(async (input: LoginInput) => {
    const result = await api.post<LoginResponse>('/auth/login', input);
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(() => {
    const held = new Set(user?.permissions ?? []);
    return {
      user,
      initialising,
      signIn,
      signOut,
      can: (...permissions) => permissions.every((p) => held.has(p)),
      hasRole: (...roles) => roles.some((r) => user?.roles.includes(r)),
    };
  }, [user, initialising, signIn, signOut]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
