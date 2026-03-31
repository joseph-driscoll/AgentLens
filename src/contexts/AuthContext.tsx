import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { authenticate, storeToken, getStoredToken, removeToken, getUserFromToken, isTokenValid } from '../utils/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = getStoredToken();
    return stored && isTokenValid(stored) ? stored : null;
  });

  const user = token ? getUserFromToken(token) : null;

  useEffect(() => {
    if (token && !isTokenValid(token)) {
      removeToken();
      setToken(null);
    }
  }, [token]);

  const login = useCallback((email: string, password: string): boolean => {
    const newToken = authenticate(email, password);
    if (newToken) {
      storeToken(newToken);
      setToken(newToken);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setToken(null);
  }, []);

  return (
    <AuthContext value={{ user, token, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
