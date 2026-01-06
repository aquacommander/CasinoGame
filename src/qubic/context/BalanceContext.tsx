'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQubicConnect } from './QubicConnectContext';
import { useAuth } from './AuthContext';
import axiosServices from '@/util/axios';

interface Balance {
  currency: string; // 'QUBIC' or token symbol
  amount: number; // Balance amount
  available: number; // Available for betting
  locked: number; // Locked in active bets
}

interface BalanceContextType {
  balances: Balance[];
  isLoading: boolean;
  error: string | null;
  refreshBalance: () => Promise<void>;
  updateBalance: (currency: string, amount: number) => void;
  lockAmount: (currency: string, amount: number) => boolean;
  unlockAmount: (currency: string, amount: number) => void;
  getBalance: (currency?: string) => number;
  hasEnoughBalance: (amount: number, currency?: string) => boolean;
}

const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

interface BalanceProviderProps {
  children: ReactNode;
}

export function BalanceProvider({ children }: BalanceProviderProps) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connected, wallet } = useQubicConnect();
  const { isAuthenticated, user } = useAuth();

  // Fetch balance from backend
  const fetchBalance = async () => {
    if (!isAuthenticated || !user) {
      setBalances([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch balance from backend API with timeout
      const response = await Promise.race([
        axiosServices.get('/balance', {
          params: {
            publicKey: user.publicKey,
          },
          timeout: 5000, // 5 second timeout
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 5000)
        ),
      ]) as any;

      if (response.data?.success) {
        setBalances(response.data.balances || []);
        setError(null);
      } else {
        setError(response.data?.message || 'Failed to fetch balance');
        // Initialize with zero balance on API error
        if (balances.length === 0) {
          setBalances([{
            currency: 'QUBIC',
            amount: 0,
            available: 0,
            locked: 0,
          }]);
        }
      }
    } catch (err: any) {
      // Only log errors in development
      if (process.env.NODE_ENV === 'development') {
        console.warn('Balance API not available:', err.message || 'Network error');
      }
      
      // Don't set error for network issues - just use fallback
      const isNetworkError = err.code === 'ERR_NETWORK' || 
                            err.message === 'Network Error' ||
                            err.message === 'Request timeout';
      
      if (!isNetworkError) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch balance');
      }
      
      // Fallback: Initialize with zero balance if API fails
      if (balances.length === 0) {
        setBalances([{
          currency: 'QUBIC',
          amount: 0,
          available: 0,
          locked: 0,
        }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh balance
  const refreshBalance = async () => {
    await fetchBalance();
  };

  // Update balance locally (optimistic update)
  const updateBalance = (currency: string, amount: number) => {
    setBalances((prev) => {
      const existing = prev.find((b) => b.currency === currency);
      if (existing) {
        return prev.map((b) =>
          b.currency === currency
            ? {
                ...b,
                amount,
                available: amount - b.locked,
              }
            : b
        );
      } else {
        return [
          ...prev,
          {
            currency,
            amount,
            available: amount,
            locked: 0,
          },
        ];
      }
    });
  };

  // Lock amount for active bet
  const lockAmount = (currency: string, amount: number): boolean => {
    const balance = balances.find((b) => b.currency === currency);
    if (!balance || balance.available < amount) {
      return false;
    }

    setBalances((prev) =>
      prev.map((b) =>
        b.currency === currency
          ? {
              ...b,
              locked: b.locked + amount,
              available: b.available - amount,
            }
          : b
      )
    );
    return true;
  };

  // Unlock amount after bet is resolved
  const unlockAmount = (currency: string, amount: number) => {
    setBalances((prev) =>
      prev.map((b) =>
        b.currency === currency
          ? {
              ...b,
              locked: Math.max(0, b.locked - amount),
              available: b.available + amount,
            }
          : b
      )
    );
  };

  // Get balance for a currency
  const getBalance = (currency: string = 'QUBIC'): number => {
    const balance = balances.find((b) => b.currency === currency);
    return balance?.available || 0;
  };

  // Check if user has enough balance
  const hasEnoughBalance = (amount: number, currency: string = 'QUBIC'): boolean => {
    return getBalance(currency) >= amount;
  };

  // Fetch balance when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      // Initial fetch
      fetchBalance();
      
      // Set up periodic refresh (every 30 seconds) - only if API is working
      let interval: NodeJS.Timeout | null = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      const setupInterval = () => {
        interval = setInterval(() => {
          fetchBalance().then(() => {
            retryCount = 0; // Reset on success
          }).catch(() => {
            retryCount++;
            if (retryCount >= maxRetries && interval) {
              // Stop polling if API keeps failing
              clearInterval(interval);
              interval = null;
            }
          });
        }, 30000);
      };
      
      // Only start interval after first successful fetch or after delay
      const timeout = setTimeout(() => {
        setupInterval();
      }, 5000);

      return () => {
        clearTimeout(timeout);
        if (interval) {
          clearInterval(interval);
        }
      };
    } else {
      setBalances([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  const value: BalanceContextType = {
    balances,
    isLoading,
    error,
    refreshBalance,
    updateBalance,
    lockAmount,
    unlockAmount,
    getBalance,
    hasEnoughBalance,
  };

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

export function useBalance(): BalanceContextType {
  const context = useContext(BalanceContext);
  if (context === undefined) {
    throw new Error('useBalance must be used within a BalanceProvider');
  }
  return context;
}

