'use client';

import { useQubicConnect } from '../context/QubicConnectContext';
import { transactionService, BetTransactionParams } from './transactionService';
import axiosServices from '@/util/axios';
import { useBalance } from '../context/BalanceContext';

export interface DepositParams {
  amount: number;
  currency?: string;
}

export interface WithdrawalParams {
  amount: number;
  currency?: string;
  address: string;
}

export interface PaymentResult {
  success: boolean;
  txHash?: string;
  error?: string;
  message?: string;
}

/**
 * Service for handling deposits and withdrawals
 */
export class PaymentService {
  /**
   * Process a deposit
   * This would typically involve:
   * 1. User sends funds to casino address
   * 2. Casino detects the deposit
   * 3. Updates user balance
   */
  async deposit(params: DepositParams): Promise<PaymentResult> {
    try {
      // In a real implementation, this would:
      // 1. Generate a deposit address for the user
      // 2. Wait for the transaction to be confirmed
      // 3. Update the user's balance

      const response = await axiosServices.post('/payment/deposit', {
        amount: params.amount,
        currency: params.currency || 'QUBIC',
      });

      if (response.data?.success) {
        return {
          success: true,
          txHash: response.data.txHash,
          message: 'Deposit successful',
        };
      } else {
        return {
          success: false,
          error: response.data?.message || 'Deposit failed',
        };
      }
    } catch (error: any) {
      const isNetworkError = error.isNetworkError || error.code === 'ERR_NETWORK';
      if (!isNetworkError && process.env.NODE_ENV === 'development') {
        console.error('Error processing deposit:', error);
      }
      return {
        success: false,
        error: isNetworkError 
          ? 'Network error - API may be unavailable' 
          : error.response?.data?.message || error.message || 'Failed to process deposit',
      };
    }
  }

  /**
   * Process a withdrawal
   */
  async withdraw(params: WithdrawalParams): Promise<PaymentResult> {
    try {
      const response = await axiosServices.post('/payment/withdraw', {
        amount: params.amount,
        currency: params.currency || 'QUBIC',
        address: params.address,
      });

      if (response.data?.success) {
        return {
          success: true,
          txHash: response.data.txHash,
          message: 'Withdrawal initiated',
        };
      } else {
        return {
          success: false,
          error: response.data?.message || 'Withdrawal failed',
        };
      }
    } catch (error: any) {
      const isNetworkError = error.isNetworkError || error.code === 'ERR_NETWORK';
      if (!isNetworkError && process.env.NODE_ENV === 'development') {
        console.error('Error processing withdrawal:', error);
      }
      return {
        success: false,
        error: isNetworkError 
          ? 'Network error - API may be unavailable' 
          : error.response?.data?.message || error.message || 'Failed to process withdrawal',
      };
    }
  }

  /**
   * Get deposit address for user
   */
  async getDepositAddress(): Promise<string> {
    try {
      const response = await axiosServices.get('/payment/deposit-address');
      return response.data?.address || '';
    } catch (error: any) {
      const isNetworkError = error.isNetworkError || error.code === 'ERR_NETWORK';
      if (!isNetworkError && process.env.NODE_ENV === 'development') {
        console.error('Error getting deposit address:', error);
      }
      // Return empty string instead of throwing for network errors
      if (isNetworkError) {
        return '';
      }
      throw error;
    }
  }

  /**
   * Check deposit status
   */
  async checkDepositStatus(txHash: string): Promise<{
    confirmed: boolean;
    amount?: number;
  }> {
    try {
      const response = await axiosServices.get(`/payment/deposit-status/${txHash}`);
      return {
        confirmed: response.data?.confirmed || false,
        amount: response.data?.amount,
      };
    } catch (error: any) {
      const isNetworkError = error.isNetworkError || error.code === 'ERR_NETWORK';
      if (!isNetworkError && process.env.NODE_ENV === 'development') {
        console.error('Error checking deposit status:', error);
      }
      return { confirmed: false };
    }
  }
}

// Export singleton instance
export const paymentService = new PaymentService();

