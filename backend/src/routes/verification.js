import express from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';
import { transactionVerificationService } from '../services/transactionVerification.js';
import { getOne, getAll } from '../utils/dbHelpers.js';

const router = express.Router();

/**
 * POST /api/verification/verify
 * Manually verify a transaction
 */
router.post(
  '/verify',
  [
    body('txHash').isString().notEmpty().withMessage('Transaction hash is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { txHash, expectedTx } = req.body;

      logger.info(`Manual verification request for transaction: ${txHash}`);

      // Get transaction from database if exists
      const dbTx = getOne('SELECT * FROM transactions WHERE tx_hash = ?', [txHash]);

      // Verify transaction
      const result = await transactionVerificationService.verifyTransaction(txHash, expectedTx || null);

      res.json({
        success: result.verified || result.confirmed,
        verified: result.verified,
        confirmed: result.confirmed,
        details: result.details,
        error: result.error,
        databaseRecord: dbTx || null,
      });
    } catch (error) {
      logger.error('Error in manual verification:', error);
      next(error);
    }
  }
);

/**
 * GET /api/verification/status
 * Get verification status of pending transactions
 */
router.get('/status', async (req, res, next) => {
  try {
    const pendingTxs = getAll(
      `SELECT t.*, u.public_key 
       FROM transactions t 
       JOIN users u ON t.user_id = u.id 
       WHERE t.status = 'pending' 
       AND t.tx_hash IS NOT NULL
       ORDER BY t.created_at DESC
       LIMIT 20`
    );

    res.json({
      success: true,
      pendingCount: pendingTxs.length,
      transactions: pendingTxs.map((tx) => ({
        id: tx.id,
        txHash: tx.tx_hash,
        type: tx.type,
        gameType: tx.game_type,
        amount: tx.amount,
        status: tx.status,
        createdAt: tx.created_at,
        publicKey: tx.public_key,
      })),
    });
  } catch (error) {
    logger.error('Error getting verification status:', error);
    next(error);
  }
});

export default router;

