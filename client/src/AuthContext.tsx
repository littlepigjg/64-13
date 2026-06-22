import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api, setAuthToken, getAuthToken } from './api';
import type { User, LoginRequest } from './types';

interface AuthContextType {
  user: User | null;
  authEnabled: boolean;
  loading: boolean;
  error: string | null;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  isAdmin: () => boolean;
  isPackageOwner: (pkg: { ownerId?: number }) => boolean;
  canDeletePackage: (pkg: { ownerId?: number; source: string }) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authEnabled, setAuthEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const info = await api.getAuthInfo();
      setAuthEnabled(info.authEnabled);
      if (info.authEnabled && info.user) {
        setUser(info.user);
      } else {
        setUser(null);
        setAuthToken(null);
      }
    } catch (e) {
      setUser(null);
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const handleLogout = () => {
      setUser(null);
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [checkAuth]);

  const login = async (data: LoginRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.login(data);
      setAuthToken(response.user.token);
      setUser(response.user);
      const info = await api.getAuthInfo();
      setAuthEnabled(info.authEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
  };

  const isAdmin = () => {
    if (!authEnabled) return true;
    return user?.role === 'admin';
  };

  const isPackageOwner = (pkg: { ownerId?: number }) => {
    if (!authEnabled) return true;
    if (!user) return false;
    return pkg.ownerId === user.id;
  };

  const canDeletePackage = (pkg: { ownerId?: number; source: string }) => {
    if (!authEnabled) return true;
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (pkg.source !== 'private') return false;
    return pkg.ownerId === user.id;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authEnabled,
        loading,
        error,
        login,
        logout,
        checkAuth,
        isAdmin,
        isPackageOwner,
        canDeletePackage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
