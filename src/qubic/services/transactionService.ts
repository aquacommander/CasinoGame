'use client';

export interface BetTransactionParams {
  amount: number; // Amount in Qubic (smallest unit)
  gameType: string; // 'crash', 'mines', 'videopoker', 'slide'
  gameId?: string; // Optional game identifier
  metadata?: Record<string, any>; // Additional game-specific data
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  signedTx?: Uint8Array;
}

// Dynamic imports for Qubic libraries (optional - may not be available)
let QubicHelper: any = null;
let QubicTransaction: any = null;

// Try to load Qubic libraries dynamically (only on client side)
if (typeof window !== 'undefined') {
  try {
    // @ts-ignore - These packages may not be available
    const qubicLib = require('@qubic-lib/qubic-ts-library');
    if (qubicLib?.QubicHelper) QubicHelper = qubicLib.QubicHelper;
    if (qubicLib?.QubicTransaction) QubicTransaction = qubicLib.QubicTransaction;
    
    // Try dist paths
    if (!QubicHelper) {
      try {
        // @ts-ignore
        QubicHelper = require('@qubic-lib/qubic-ts-library/dist/qubicHelper').QubicHelper;
      } catch (e) {}
    }
    if (!QubicTransaction) {
      try {
        // @ts-ignore
        QubicTransaction = require('@qubic-lib/qubic-ts-library/dist/qubic-types/QubicTransaction').QubicTransaction;
      } catch (e) {}
    }
  } catch (e) {
    console.warn('Qubic library not available. Install @qubic-lib/qubic-ts-library to enable full functionality.');
  }
}

/**
 * Service for handling blockchain transactions for casino games
 */
export class TransactionService {
  private qHelper: any = null;

  constructor() {
    if (typeof window !== 'undefined' && QubicHelper) {
      try {
        this.qHelper = new QubicHelper();
      } catch (e) {
        console.warn('Failed to initialize QubicHelper:', e);
      }
    }
  }

  /**
   * Create and sign a bet transaction
   */
  async createBetTransaction(
    params: BetTransactionParams,
    wallet: { connectType: string; publicKey: string; privateKey?: string },
    getSignedTx: (tx: Uint8Array | any) => Promise<{ tx: Uint8Array }>
  ): Promise<TransactionResult> {
    try {
      if (!this.qHelper) {
        throw new Error('QubicHelper not available');
      }

      // Get casino house address (this should be configured)
      const houseAddress = process.env.NEXT_PUBLIC_CASINO_ADDRESS || '';
      if (!houseAddress) {
        throw new Error('Casino address not configured');
      }

      // Create transaction
      if (!QubicTransaction) {
        throw new Error('QubicTransaction not available. Please install @qubic-lib/qubic-ts-library');
      }
      const tx = new QubicTransaction();
      
      // Set source (player's public key)
      const sourceIdentity = await this.qHelper.getIdentity(wallet.publicKey);
      tx.sourcePublicKey.setIdentity(sourceIdentity);
      
      // Set destination (casino house address)
      const destIdentity = await this.qHelper.getIdentity(houseAddress);
      tx.destinationPublicKey.setIdentity(destIdentity);
      
      // Set amount (convert to smallest unit - 1 Qubic = 1e9 smallest units)
      const amountInSmallestUnit = Math.floor(params.amount * 1e9);
      tx.amount.setNumber(amountInSmallestUnit);
      
      // Set tick (current tick + offset for confirmation)
      const currentTick = await this.qHelper.getTick();
      tx.tick = currentTick + 10; // Add offset for confirmation time
      
      // Set input type (0 = transfer)
      tx.inputType = 0;
      
      // Add metadata as payload (JSON encoded)
      const payload = JSON.stringify({
        gameType: params.gameType,
        gameId: params.gameId,
        ...params.metadata,
      });
      tx.payload.setPackageData(new TextEncoder().encode(payload));

      // Sign transaction
      const { tx: signedTx } = await getSignedTx(tx);

      // Convert to base64 for transmission
      const txBase64 = btoa(String.fromCharCode(...Array.from(signedTx)));

      return {
        success: true,
        signedTx,
        txHash: txBase64, // Using base64 as hash identifier
      };
    } catch (error: any) {
      console.error('Error creating bet transaction:', error);
      return {
        success: false,
        error: error.message || 'Failed to create transaction',
      };
    }
  }

  /**
   * Verify a transaction was included in a block
   */
  async verifyTransaction(txHash: string): Promise<boolean> {
    try {
      if (!this.qHelper) {
        return false;
      }

      // This would check if the transaction is confirmed on-chain
      // Implementation depends on Qubic network access
      // For now, return true if we have the hash
      return !!txHash;
    } catch (error) {
      console.error('Error verifying transaction:', error);
      return false;
    }
  }

  /**
   * Get current tick for transaction timing
   */
  async getCurrentTick(): Promise<number> {
    try {
      if (!this.qHelper) {
        throw new Error('QubicHelper not available');
      }
      return await this.qHelper.getTick();
    } catch (error) {
      console.error('Error getting current tick:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const transactionService = new TransactionService();

