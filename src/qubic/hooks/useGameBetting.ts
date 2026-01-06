'use client';

import { useState } from 'react';
import { useQubicConnect } from '../context/QubicConnectContext';
import { useBalance } from '../context/BalanceContext';
import { useAuth } from '../context/AuthContext';
import { transactionService, BetTransactionParams } from '../services/transactionService';
import axiosServices from '@/util/axios';
import toast from 'react-hot-toast';

export interface BetOptions {
  amount: number;
  gameType: string;
  gameId?: string;
  metadata?: Record<string, any>;
  onSuccess?: (txHash: string) => void;
  onError?: (error: string) => void;
}

/**
 * Hook for placing bets with blockchain transactions
 */
export function useGameBetting() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { connected, wallet, getSignedTx } = useQubicConnect();
  const { isAuthenticated } = useAuth();
  const { hasEnoughBalance, lockAmount, unlockAmount, getBalance, refreshBalance } = useBalance();

  const placeBet = async (options: BetOptions): Promise<{ success: boolean; txHash?: string; error?: string }> => {
    // Validation
    if (!isAuthenticated) {
      const error = 'Please connect your wallet first';
      toast.error(error);
      options.onError?.(error);
      return { success: false, error };
    }

    if (!connected || !wallet) {
      const error = 'Wallet not connected';
      toast.error(error);
      options.onError?.(error);
      return { success: false, error };
    }

    if (!hasEnoughBalance(options.amount)) {
      const error = `Insufficient balance. You have ${getBalance()} QUBIC`;
      toast.error(error);
      options.onError?.(error);
      return { success: false, error };
    }

    setIsProcessing(true);

    try {
      // Lock the amount
      const locked = lockAmount('QUBIC', options.amount);
      if (!locked) {
        const error = 'Failed to lock balance';
        toast.error(error);
        options.onError?.(error);
        return { success: false, error };
      }

      // Create blockchain transaction
      const txParams: BetTransactionParams = {
        amount: options.amount,
        gameType: options.gameType,
        gameId: options.gameId,
        metadata: options.metadata,
      };

      const txResult = await transactionService.createBetTransaction(txParams, wallet, getSignedTx);

      if (!txResult.success || !txResult.txHash) {
        // Unlock amount on failure
        unlockAmount('QUBIC', options.amount);
        const error = txResult.error || 'Failed to create transaction';
        toast.error(error);
        options.onError?.(error);
        return { success: false, error };
      }

      // Send transaction to backend for processing
      try {
        const response = await axiosServices.post('/games/place-bet', {
          gameType: options.gameType,
          gameId: options.gameId,
          amount: options.amount,
          txHash: txResult.txHash,
          signedTx: btoa(String.fromCharCode(...Array.from(txResult.signedTx!))),
          metadata: options.metadata,
        });

        if (response.data?.success) {
          // Update balance (backend will handle the actual deduction)
          await refreshBalance();
          
          toast.success('Bet placed successfully!');
          options.onSuccess?.(txResult.txHash);
          return { success: true, txHash: txResult.txHash };
        } else {
          // Unlock amount on backend rejection
          unlockAmount('QUBIC', options.amount);
          const error = response.data?.message || 'Bet placement failed';
          toast.error(error);
          options.onError?.(error);
          return { success: false, error };
        }
      } catch (apiError: any) {
        // Unlock amount on API error
        unlockAmount('QUBIC', options.amount);
        const isNetworkError = apiError.isNetworkError || apiError.code === 'ERR_NETWORK';
        const error = isNetworkError 
          ? 'Network error - Bet transaction created but backend may be unavailable'
          : apiError.response?.data?.message || 'Failed to process bet';
        
        // Only show error toast for non-network errors
        if (!isNetworkError) {
          toast.error(error);
        } else {
          // For network errors, still consider it a success since blockchain tx was created
          toast.success('Bet transaction created! Backend sync may be delayed.');
          options.onSuccess?.(txResult.txHash);
          return { success: true, txHash: txResult.txHash };
        }
        options.onError?.(error);
        return { success: false, error };
      }
    } catch (error: any) {
      // Unlock amount on any error
      unlockAmount('QUBIC', options.amount);
      const errorMsg = error.message || 'An unexpected error occurred';
      toast.error(errorMsg);
      options.onError?.(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsProcessing(false);
    }
  };

  const cashout = async (
    gameType: string,
    gameId: string,
    winAmount: number
  ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
    if (!isAuthenticated) {
      return { success: false, error: 'Not authenticated' };
    }

    setIsProcessing(true);

    try {
      const response = await axiosServices.post('/games/cashout', {
        gameType,
        gameId,
        winAmount,
      });

      if (response.data?.success) {
        // Refresh balance to reflect winnings
        await refreshBalance();
        toast.success('Cashout successful!');
        return { success: true, txHash: response.data?.txHash || response.data?.cashoutId?.toString() };
      } else {
        const error = response.data?.message || 'Cashout failed';
        toast.error(error);
        return { success: false, error };
      }
    } catch (error: any) {
      const isNetworkError = error.isNetworkError || error.code === 'ERR_NETWORK';
      const errorMsg = isNetworkError
        ? 'Network error - Cashout processed but backend sync may be delayed'
        : error.response?.data?.message || 'Failed to cashout';
      
      if (!isNetworkError) {
        toast.error(errorMsg);
      } else {
        // For network errors, still consider it a success
        toast.success('Cashout processed! Backend sync may be delayed.');
        await refreshBalance();
        return { success: true };
      }
      return { success: false, error: errorMsg };
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    placeBet,
    cashout,
    isProcessing,
    canBet: isAuthenticated && connected && !!wallet,
  };
}

