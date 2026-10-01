'use client';
import { createContext, useContext } from 'react';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

const AuthContext = createContext<{ user: AuthUser | null; loading: boolean }>({ user: null, loading: false });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={{ user: null, loading: false }}>{children}</AuthContext.Provider>;
}
