import React, { createContext, useContext, useState, useEffect } from 'react';
import { subscribeWebPush, unsubscribeWebPush } from '../services/webPushService';

interface AuthState {
  accessToken: string | null;
  role: string | null;
  userId: number | null;
  fullName: string | null;
  permissions: string[] | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  saveTokens: (payload: {
    accessToken: string;
    refreshToken: string;
    role: string;
    userId: number;
    fullName?: string;
  }) => void;
  setPermissions: (permissions: string[]) => void;
  /** Keep the top-bar name/initials in step after the user renames themselves. */
  setFullName: (fullName: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    role: null,
    userId: null,
    fullName: null,
    permissions: null,
    isLoading: true,
  });

  useEffect(() => {
    const accessToken = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role');
    const userId = localStorage.getItem('user_id');
    const fullName = localStorage.getItem('user_full_name');
    const permsRaw = localStorage.getItem('user_permissions');
    const permissions = permsRaw ? JSON.parse(permsRaw) : null;
    setState({
      accessToken,
      role,
      userId: userId ? parseInt(userId, 10) : null,
      fullName,
      permissions,
      isLoading: false,
    });
    // Re-sync the Web Push subscription on every page load for existing sessions
    if (accessToken) {
      subscribeWebPush().catch(() => {});
    }
  }, []);

  const setPermissions = (permissions: string[]) => {
    localStorage.setItem('user_permissions', JSON.stringify(permissions));
    setState((prev) => ({ ...prev, permissions }));
  };

  const saveTokens = (payload: {
    accessToken: string;
    refreshToken: string;
    role: string;
    userId: number;
    fullName?: string;
  }) => {
    localStorage.setItem('access_token', payload.accessToken);
    localStorage.setItem('refresh_token', payload.refreshToken);
    localStorage.setItem('user_role', payload.role);
    localStorage.setItem('user_id', String(payload.userId));
    if (payload.fullName) localStorage.setItem('user_full_name', payload.fullName);
    // Clear stale permissions — will be fetched fresh by Layout
    localStorage.removeItem('user_permissions');
    setState({
      accessToken: payload.accessToken,
      role: payload.role,
      userId: payload.userId,
      fullName: payload.fullName ?? null,
      permissions: null,
      isLoading: false,
    });
    // Subscribe to Web Push after login — fire-and-forget
    subscribeWebPush().catch(() => {});
  };

  const setFullName = (fullName: string) => {
    localStorage.setItem('user_full_name', fullName);
    setState((s) => ({ ...s, fullName }));
  };

  const logout = () => {
    // Best-effort unsubscribe before clearing the token
    unsubscribeWebPush().catch(() => {});
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_full_name');
    localStorage.removeItem('user_permissions');
    setState({ accessToken: null, role: null, userId: null, fullName: null, permissions: null, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, saveTokens, setPermissions, setFullName, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
