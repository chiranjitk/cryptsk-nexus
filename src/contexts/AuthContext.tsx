'use client';
import { createContext, useContext } from 'react';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
}

const defaultValue: AuthContextValue = {
  user: {
    id: 'default',
    name: 'Admin',
    email: 'admin@cryptsk.com',
    role: 'SUPER_ADMIN',
    permissions: ['*'],
  },
  loading: false,
  hasPermission: () => true,
  hasAnyPermission: () => true,
};

const AuthContext = createContext<AuthContextValue>(defaultValue);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={defaultValue}>{children}</AuthContext.Provider>;
}
