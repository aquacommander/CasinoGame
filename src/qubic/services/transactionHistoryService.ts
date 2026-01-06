'use client';

import axiosServices from '@/util/axios';
import { useAuth } from '../context/AuthContext';

export interface Transaction {
  id: string;
  type: 'bet' | 'win' | 'deposit' | 'withdrawal';
  gameType?: string;
  gameId?: string;
  amount: number;
  currency: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface TransactionHistoryParams {
  limit?: number;
  offset?: number;
  type?: Transaction['type'];
  gameType?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Service for managing transaction history
 */
export class TransactionHistoryService {
  /**
   * Get transaction history
   */
  async getHistory(params: TransactionHistoryParams = {}): Promise<Transaction[]> {
    try {
      const response = await axiosServices.get('/transactions/history', {
        params: {
          limit: params.limit || 50,
          offset: params.offset || 0,
          type: params.type,
          gameType: params.gameType,
          startDate: params.startDate?.toISOString(),
          endDate: params.endDate?.toISOString(),
        },
      });

      if (response.data?.success) {
        return (response.data.transactions || []).map((tx: any) => ({
          ...tx,
          timestamp: new Date(tx.timestamp),
        }));
      }

      return [];
    } catch (error: any) {
      const isNetworkError = error.isNetworkError || error.code === 'ERR_NETWORK';
      if (!isNetworkError && process.env.NODE_ENV === 'development') {
        console.warn('Error fetching transaction history:', error);
      }
      return [];
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(id: string): Promise<Transaction | null> {
    try {
      const response = await axiosServices.get(`/transactions/${id}`);
      if (response.data?.success) {
        return {
          ...response.data.transaction,
          timestamp: new Date(response.data.transaction.timestamp),
        };
      }
      return null;
    } catch (error: any) {
      const isNetworkError = error.isNetworkError || error.code === 'ERR_NETWORK';
      if (!isNetworkError && process.env.NODE_ENV === 'development') {
        console.warn('Error fetching transaction:', error);
      }
      return null;
    }
  }

  /**
   * Get transaction by hash
   */
  async getTransactionByHash(txHash: string): Promise<Transaction | null> {
    try {
      const response = await axiosServices.get(`/transactions/hash/${txHash}`);
      if (response.data?.success) {
        return {
          ...response.data.transaction,
          timestamp: new Date(response.data.transaction.timestamp),
        };
      }
      return null;
    } catch (error: any) {
      const isNetworkError = error.isNetworkError || error.code === 'ERR_NETWORK';
      if (!isNetworkError && process.env.NODE_ENV === 'development') {
        console.warn('Error fetching transaction by hash:', error);
      }
      return null;
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalBets: number;
    totalWins: number;
    totalDeposits: number;
    totalWithdrawals: number;
    totalWagered: number;
    totalWon: number;
  }> {
    try {
      const response = await axiosServices.get('/transactions/statistics');
      if (response.data?.success) {
        return response.data.statistics;
      }
      return {
        totalBets: 0,
        totalWins: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalWagered: 0,
        totalWon: 0,
      };
    } catch (error: any) {
      const isNetworkError = error.isNetworkError || error.code === 'ERR_NETWORK';
      if (!isNetworkError && process.env.NODE_ENV === 'development') {
        console.warn('Error fetching statistics:', error);
      }
      return {
        totalBets: 0,
        totalWins: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalWagered: 0,
        totalWon: 0,
      };
    }
  }
}

// Export singleton instance
export const transactionHistoryService = new TransactionHistoryService();

