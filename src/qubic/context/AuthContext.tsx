'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQubicConnect } from './QubicConnectContext';

interface User {
  walletAddress: string;
  publicKey: string;
  connectType: string;
  authenticated: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (walletAddress: string, publicKey: string, connectType: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const { connected, wallet, disconnect } = useQubicConnect();

  // Load auth state from localStorage on mount
  useEffect(() => {
    const storedAuth = localStorage.getItem('casino_auth');
    if (storedAuth) {
      try {
        const parsedUser = JSON.parse(storedAuth);
        setUser(parsedUser);
      } catch (error) {
        console.error('Error parsing stored auth:', error);
        localStorage.removeItem('casino_auth');
      }
    }
  }, []);

  // Sync with wallet connection
  useEffect(() => {
    if (connected && wallet) {
      // Auto-login if wallet is connected
      if (!user || user.publicKey !== wallet.publicKey) {
        login(wallet.publicKey, wallet.publicKey, wallet.connectType);
      }
    } else if (!connected && user) {
      // Auto-logout if wallet is disconnected
      logout();
    }
  }, [connected, wallet]);

  const login = async (walletAddress: string, publicKey: string, connectType: string) => {
    const newUser: User = {
      walletAddress,
      publicKey,
      connectType,
      authenticated: true,
    };

    setUser(newUser);
    localStorage.setItem('casino_auth', JSON.stringify(newUser));

    // Optionally notify backend of login
    try {
      // await axiosServices.post('/auth/login', { publicKey, connectType });
    } catch (error) {
      console.error('Error notifying backend of login:', error);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('casino_auth');
    disconnect();
  };

  const refreshAuth = async () => {
    if (user) {
      // Verify user is still authenticated
      // This could check with backend or verify wallet connection
      if (!connected) {
        logout();
      }
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user && user.authenticated,
    login,
    logout,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

