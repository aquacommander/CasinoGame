import { transactionVerificationService } from '../services/transactionVerification.js';
import { logger } from '../utils/logger.js';
import { getOne } from '../utils/dbHelpers.js';

/**
 * Middleware to verify blockchain transactions
 * Can be used as a route middleware or called directly
 */
export async function verifyTransactionMiddleware(req, res, next) {
  try {
    const { txHash, publicKey, amount, gameType } = req.body;

    if (!txHash) {
      return res.status(400).json({
        success: false,
        error: 'Transaction hash is required',
      });
    }

    // Check if transaction already verified
    const existingTx = getOne('SELECT * FROM transactions WHERE tx_hash = ?', [txHash]);
    if (existingTx && existingTx.status === 'confirmed') {
      logger.info(`Transaction ${txHash} already verified`);
      req.transactionVerified = true;
      req.existingTransaction = existingTx;
      return next();
    }

    // Prepare expected transaction details
    const expectedTx = {
      from: publicKey,
      to: process.env.CASINO_ADDRESS,
      amount: amount,
    };

    // Verify transaction on blockchain
    logger.info(`Verifying transaction ${txHash}...`);
    const verificationResult = await transactionVerificationService.verifyTransactionWithRetry(
      txHash,
      expectedTx,
      2, // 2 retries
      3000 // 3 second delay
    );

    if (!verificationResult.verified && !verificationResult.confirmed) {
      logger.warn(`Transaction ${txHash} verification failed:`, verificationResult.error);

      // In development, allow unverified transactions with warning
      if (process.env.NODE_ENV === 'development' && process.env.ALLOW_UNVERIFIED_TX === 'true') {
        logger.warn('⚠️  ALLOWING UNVERIFIED TRANSACTION (development mode)');
        req.transactionVerified = false;
        req.verificationResult = verificationResult;
        return next();
      }

      return res.status(400).json({
        success: false,
        error: 'Transaction verification failed',
        details: verificationResult.error,
      });
    }

    // Transaction verified
    logger.info(`Transaction ${txHash} verified successfully`);
    req.transactionVerified = true;
    req.verificationResult = verificationResult;
    next();
  } catch (error) {
    logger.error('Error in transaction verification middleware:', error);

    // In development, allow errors to pass through with warning
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_UNVERIFIED_TX === 'true') {
      logger.warn('⚠️  ALLOWING TRANSACTION DESPITE VERIFICATION ERROR (development mode)');
      req.transactionVerified = false;
      req.verificationError = error.message;
      return next();
    }

    return res.status(500).json({
      success: false,
      error: 'Transaction verification error',
      details: error.message,
    });
  }
}

/**
 * Optional verification - doesn't block request if verification fails
 */
export async function optionalVerifyTransaction(req, res, next) {
  try {
    const { txHash } = req.body;

    if (!txHash) {
      return next();
    }

    // Try to verify in background (non-blocking)
    transactionVerificationService
      .verifyTransaction(txHash)
      .then((result) => {
        if (result.verified || result.confirmed) {
          logger.info(`Transaction ${txHash} verified (background)`);
          // Update transaction status in database
          // This would be done by a background job in production
        } else {
          logger.warn(`Transaction ${txHash} verification failed (background):`, result.error);
        }
      })
      .catch((error) => {
        logger.error(`Background verification error for ${txHash}:`, error);
      });

    next();
  } catch (error) {
    // Don't block on optional verification errors
    logger.error('Error in optional verification:', error);
    next();
  }
}

