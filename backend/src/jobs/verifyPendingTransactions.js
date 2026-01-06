import { logger } from '../utils/logger.js';
import { getAll, run, transaction } from '../utils/dbHelpers.js';
import { transactionVerificationService } from '../services/transactionVerification.js';

/**
 * Background job to verify pending transactions
 * Runs periodically to check and update transaction status
 */
export class VerifyPendingTransactionsJob {
  constructor(intervalMs = 60000) {
    // Default: run every 60 seconds
    this.intervalMs = intervalMs;
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Start the verification job
   */
  start() {
    if (this.isRunning) {
      logger.warn('Transaction verification job already running');
      return;
    }

    logger.info(`Starting transaction verification job (interval: ${this.intervalMs}ms)`);
    this.isRunning = true;

    // Run immediately
    this.verifyPendingTransactions();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.verifyPendingTransactions();
    }, this.intervalMs);
  }

  /**
   * Stop the verification job
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Transaction verification job stopped');
  }

  /**
   * Verify all pending transactions
   */
  async verifyPendingTransactions() {
    try {
      // Get all pending transactions
      const pendingTxs = getAll(
        `SELECT t.*, u.public_key 
         FROM transactions t 
         JOIN users u ON t.user_id = u.id 
         WHERE t.status = 'pending' 
         AND t.tx_hash IS NOT NULL
         ORDER BY t.created_at ASC
         LIMIT 50`
      );

      if (pendingTxs.length === 0) {
        return;
      }

      logger.info(`Verifying ${pendingTxs.length} pending transactions...`);

      // Verify each transaction
      for (const tx of pendingTxs) {
        try {
          await this.verifyTransaction(tx);
        } catch (error) {
          logger.error(`Error verifying transaction ${tx.tx_hash}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error in transaction verification job:', error);
    }
  }

  /**
   * Verify a single transaction
   */
  async verifyTransaction(tx) {
    const { tx_hash, amount, game_type, public_key } = tx;

    if (!tx_hash) {
      logger.warn(`Transaction ${tx.id} has no tx_hash, skipping`);
      return;
    }

    // Prepare expected transaction details
    const expectedTx = {
      from: public_key,
      to: process.env.CASINO_ADDRESS,
      amount: amount,
    };

    // Verify transaction
    const result = await transactionVerificationService.verifyTransactionWithRetry(
      tx_hash,
      expectedTx,
      1, // 1 retry
      2000 // 2 second delay
    );

    // Update transaction status
    if (result.verified || result.confirmed) {
      transaction(() => {
        run(
          `UPDATE transactions 
           SET status = 'confirmed', 
               updated_at = datetime('now')
           WHERE id = ?`,
          [tx.id]
        );

        // If it's a bet transaction, unlock the amount (it's already locked)
        if (tx.type === 'bet' && result.verified) {
          logger.info(`Transaction ${tx_hash} verified and confirmed`);
        }
      });
    } else {
      // Check if transaction is old enough to be considered failed
      const txAge = Date.now() - new Date(tx.created_at).getTime();
      const maxAge = 10 * 60 * 1000; // 10 minutes

      if (txAge > maxAge) {
        logger.warn(`Transaction ${tx_hash} failed verification after ${Math.round(txAge / 1000)}s`);
        
        // Mark as failed if old enough
        transaction(() => {
          run(
            `UPDATE transactions 
             SET status = 'failed', 
                 updated_at = datetime('now')
             WHERE id = ?`,
            [tx.id]
          );

          // Unlock the amount if it was locked
          if (tx.type === 'bet') {
            run(
              `UPDATE users 
               SET locked_balance = locked_balance - ?
               WHERE id = ?`,
              [amount, tx.user_id]
            );
          }
        });
      }
    }
  }
}

// Export singleton instance
export const verifyPendingTransactionsJob = new VerifyPendingTransactionsJob(
  parseInt(process.env.TX_VERIFICATION_INTERVAL_MS) || 60000 // Default: 60 seconds
);

