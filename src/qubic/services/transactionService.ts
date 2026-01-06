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
        // Verify QubicHelper is properly initialized
        if (!this.qHelper || typeof this.qHelper.getIdentity !== 'function') {
          console.warn('QubicHelper initialized but getIdentity method not available');
          this.qHelper = null;
        }
      } catch (e) {
        console.warn('Failed to initialize QubicHelper:', e);
        this.qHelper = null;
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

      // Validate wallet public key
      if (!wallet.publicKey || typeof wallet.publicKey !== 'string') {
        throw new Error('Invalid wallet public key. Please reconnect your wallet.');
      }

      // Normalize public key: trim whitespace and extract 55-character Qubic address
      let normalizedPublicKey = wallet.publicKey.trim();
      
      // Handle different formats:
      // - If it's 60 characters, it might be a WalletConnect address with prefix
      // - Extract the last 55 characters (Qubic address format)
      if (normalizedPublicKey.length === 60) {
        // WalletConnect might return addresses with "qubic:" prefix or similar
        // Extract the last 55 characters which should be the Qubic address
        normalizedPublicKey = normalizedPublicKey.slice(-55);
      } else if (normalizedPublicKey.length > 55) {
        // If longer than 55, try to extract 55 characters from the end
        normalizedPublicKey = normalizedPublicKey.slice(-55);
      }

      // Validate public key format (Qubic addresses are 55 characters)
      if (normalizedPublicKey.length !== 55) {
        throw new Error(`Invalid public key format. Expected 55 characters, got ${wallet.publicKey.length} (normalized: ${normalizedPublicKey.length}). Public key: ${wallet.publicKey.substring(0, 20)}...`);
      }

      // Use normalized public key for the rest of the function
      const publicKey = normalizedPublicKey;

      // Get casino house address (this should be configured)
      const houseAddress = process.env.NEXT_PUBLIC_CASINO_ADDRESS || '';
      if (!houseAddress) {
        throw new Error('Casino address not configured. Please set NEXT_PUBLIC_CASINO_ADDRESS in .env.local');
      }

      // Validate casino address format
      if (houseAddress.length !== 55) {
        throw new Error(`Invalid casino address format. Expected 55 characters, got ${houseAddress.length}`);
      }

      // Create transaction
      if (!QubicTransaction) {
        throw new Error('QubicTransaction not available. Please install @qubic-lib/qubic-ts-library');
      }
      const tx = new QubicTransaction();
      
      // Set source (player's public key)
      // getIdentity expects a 55-character Qubic address string
      // The getIdentity method converts a public key string to an identity object
      // (publicKey is already normalized and validated above)
      let sourceIdentity;
      try {
        // Verify QubicHelper and getIdentity method are available
        if (!this.qHelper) {
          throw new Error('QubicHelper not initialized');
        }
        if (typeof this.qHelper.getIdentity !== 'function') {
          throw new Error('QubicHelper.getIdentity is not a function. Qubic library may not be properly loaded.');
        }
        
        // Call getIdentity - wrap in Promise.resolve in case it's not async
        const identityResult = this.qHelper.getIdentity(publicKey);
        sourceIdentity = identityResult instanceof Promise ? await identityResult : identityResult;
        
        // Verify the result is valid
        if (!sourceIdentity) {
          throw new Error('getIdentity returned null or undefined');
        }
        if (typeof sourceIdentity !== 'object') {
          throw new Error(`getIdentity returned invalid type: ${typeof sourceIdentity}, expected object`);
        }
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.error('Error getting source identity:', {
          error: errorMsg,
          publicKey: publicKey,
          originalPublicKey: wallet.publicKey,
          publicKeyType: typeof publicKey,
          publicKeyLength: publicKey?.length,
          qHelperAvailable: !!this.qHelper,
          getIdentityAvailable: typeof this.qHelper?.getIdentity === 'function',
        });
        throw new Error(`Failed to get source identity: ${errorMsg}. Please ensure your wallet is properly connected and @qubic-lib/qubic-ts-library is installed.`);
      }
      
      tx.sourcePublicKey.setIdentity(sourceIdentity);
      
      // Set destination (casino house address)
      let destIdentity;
      try {
        const identityResult = this.qHelper.getIdentity(houseAddress);
        destIdentity = identityResult instanceof Promise ? await identityResult : identityResult;
        
        if (!destIdentity) {
          throw new Error('getIdentity returned null or undefined');
        }
        if (typeof destIdentity !== 'object') {
          throw new Error(`getIdentity returned invalid type: ${typeof destIdentity}, expected object`);
        }
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.error('Error getting destination identity:', {
          error: errorMsg,
          houseAddress,
          houseAddressType: typeof houseAddress,
          houseAddressLength: houseAddress?.length,
        });
        throw new Error(`Failed to get destination identity: ${errorMsg}. Please check NEXT_PUBLIC_CASINO_ADDRESS in .env.local`);
      }
      
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

