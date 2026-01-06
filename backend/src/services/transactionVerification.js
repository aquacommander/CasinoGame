import { logger } from '../utils/logger.js';
import axios from 'axios';

/**
 * Transaction Verification Service
 * Verifies Qubic blockchain transactions on-chain
 */
class TransactionVerificationService {
  constructor() {
    // Qubic RPC endpoints (adjust based on actual Qubic network)
    this.rpcEndpoints = [
      process.env.QUBIC_RPC_URL || 'https://rpc.qubic.org',
      'https://api.qubic.org',
      'https://explorer.qubic.org/api',
    ];
    this.currentEndpointIndex = 0;
  }

  /**
   * Get the current RPC endpoint
   */
  getCurrentEndpoint() {
    return this.rpcEndpoints[this.currentEndpointIndex];
  }

  /**
   * Rotate to next RPC endpoint if current one fails
   */
  rotateEndpoint() {
    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.rpcEndpoints.length;
    logger.info(`Switched to RPC endpoint: ${this.getCurrentEndpoint()}`);
  }

  /**
   * Verify a transaction hash on the Qubic blockchain
   * @param {string} txHash - Transaction hash to verify
   * @param {object} expectedTx - Expected transaction details (optional, for validation)
   * @returns {Promise<{verified: boolean, confirmed: boolean, details?: object, error?: string}>}
   */
  async verifyTransaction(txHash, expectedTx = null) {
    if (!txHash || typeof txHash !== 'string') {
      return {
        verified: false,
        confirmed: false,
        error: 'Invalid transaction hash',
      };
    }

    // Try each RPC endpoint
    let lastError = null;
    for (let i = 0; i < this.rpcEndpoints.length; i++) {
      try {
        const result = await this.verifyTransactionOnEndpoint(txHash, expectedTx);
        if (result.verified || result.confirmed) {
          return result;
        }
        lastError = result.error;
      } catch (error) {
        logger.warn(`RPC endpoint ${this.getCurrentEndpoint()} failed:`, error.message);
        this.rotateEndpoint();
        lastError = error.message;
      }
    }

    // If all endpoints failed, return error
    return {
      verified: false,
      confirmed: false,
      error: lastError || 'All RPC endpoints failed',
    };
  }

  /**
   * Verify transaction on a specific endpoint
   */
  async verifyTransactionOnEndpoint(txHash, expectedTx) {
    const endpoint = this.getCurrentEndpoint();

    try {
      // Method 1: Try RPC-style request
      try {
        const rpcResponse = await axios.post(
          endpoint,
          {
            jsonrpc: '2.0',
            method: 'getTransaction',
            params: [txHash],
            id: 1,
          },
          {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (rpcResponse.data?.result) {
          const txData = rpcResponse.data.result;
          return this.validateTransactionData(txData, expectedTx, txHash);
        }
      } catch (rpcError) {
        // RPC method failed, try REST API
        logger.debug('RPC method failed, trying REST API');
      }

      // Method 2: Try REST API
      try {
        const restResponse = await axios.get(`${endpoint}/transaction/${txHash}`, {
          timeout: 10000,
        });

        if (restResponse.data) {
          return this.validateTransactionData(restResponse.data, expectedTx, txHash);
        }
      } catch (restError) {
        // REST API also failed
        logger.debug('REST API method failed');
      }

      // Method 3: Try explorer API
      try {
        const explorerResponse = await axios.get(`${endpoint}/tx/${txHash}`, {
          timeout: 10000,
        });

        if (explorerResponse.data) {
          return this.validateTransactionData(explorerResponse.data, expectedTx, txHash);
        }
      } catch (explorerError) {
        logger.debug('Explorer API method failed');
      }

      // If we reach here, transaction not found
      return {
        verified: false,
        confirmed: false,
        error: 'Transaction not found on blockchain',
      };
    } catch (error) {
      logger.error(`Error verifying transaction ${txHash}:`, error);
      return {
        verified: false,
        confirmed: false,
        error: error.message || 'Verification failed',
      };
    }
  }

  /**
   * Validate transaction data against expected values
   */
  validateTransactionData(txData, expectedTx, txHash) {
    // Basic validation: transaction exists
    if (!txData || !txHash) {
      return {
        verified: false,
        confirmed: false,
        error: 'Transaction data invalid',
      };
    }

    // Check if transaction is confirmed
    const confirmed = txData.confirmed || txData.status === 'confirmed' || txData.blockNumber !== null;

    // If expected transaction details provided, validate them
    if (expectedTx) {
      const validations = [];

      if (expectedTx.from && txData.from) {
        validations.push(this.normalizeAddress(txData.from) === this.normalizeAddress(expectedTx.from));
      }

      if (expectedTx.to && txData.to) {
        validations.push(this.normalizeAddress(txData.to) === this.normalizeAddress(expectedTx.to));
      }

      if (expectedTx.amount && txData.amount) {
        // Allow small difference due to precision
        const amountDiff = Math.abs(parseFloat(txData.amount) - parseFloat(expectedTx.amount));
        validations.push(amountDiff < 0.0001);
      }

      const allValid = validations.length === 0 || validations.every((v) => v === true);

      return {
        verified: allValid && confirmed,
        confirmed: confirmed,
        details: {
          hash: txHash,
          from: txData.from,
          to: txData.to,
          amount: txData.amount,
          status: txData.status,
          blockNumber: txData.blockNumber,
          timestamp: txData.timestamp,
        },
      };
    }

    // No expected values, just check if confirmed
    return {
      verified: confirmed,
      confirmed: confirmed,
      details: {
        hash: txHash,
        from: txData.from,
        to: txData.to,
        amount: txData.amount,
        status: txData.status,
        blockNumber: txData.blockNumber,
        timestamp: txData.timestamp,
      },
    };
  }

  /**
   * Normalize Qubic address (handle 60-char WalletConnect format)
   */
  normalizeAddress(address) {
    if (!address) return '';
    let normalized = address.trim();
    if (normalized.length === 60) {
      normalized = normalized.slice(-55);
    } else if (normalized.length > 55) {
      normalized = normalized.slice(-55);
    }
    return normalized;
  }

  /**
   * Batch verify multiple transactions
   */
  async verifyTransactions(txHashes, expectedTxs = []) {
    const results = await Promise.all(
      txHashes.map((txHash, index) => {
        const expectedTx = expectedTxs[index] || null;
        return this.verifyTransaction(txHash, expectedTx);
      })
    );

    return results;
  }

  /**
   * Verify transaction with retry logic
   */
  async verifyTransactionWithRetry(txHash, expectedTx = null, maxRetries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.verifyTransaction(txHash, expectedTx);

      if (result.verified || result.confirmed) {
        return result;
      }

      if (attempt < maxRetries) {
        logger.info(`Transaction verification attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return {
      verified: false,
      confirmed: false,
      error: 'Transaction verification failed after retries',
    };
  }
}

// Export singleton instance
export const transactionVerificationService = new TransactionVerificationService();

