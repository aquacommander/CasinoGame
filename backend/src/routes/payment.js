import express from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';
import { getOne, run, transaction } from '../utils/dbHelpers.js';

const router = express.Router();

/**
 * GET /api/payment/deposit-address
 * Get the casino deposit address
 */
router.get('/deposit-address', async (req, res) => {
  res.json({
    success: true,
    address: process.env.CASINO_ADDRESS || '',
    currency: 'QUBIC',
  });
});

/**
 * POST /api/payment/deposit
 * Record a deposit transaction
 */
router.post(
  '/deposit',
  [
    body('txHash').isString().notEmpty().withMessage('Transaction hash is required'),
    body('publicKey').isString().isLength({ min: 55, max: 55 }).withMessage('Public key must be 55 characters'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
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

      const { txHash, publicKey, amount } = req.body;

      // TODO: Verify transaction on-chain
      logger.info('Processing deposit:', { txHash, publicKey, amount });

      // Get or create user
      let user = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);

      if (!user) {
        run('INSERT INTO users (public_key, balance) VALUES (?, ?)', [publicKey, 0]);
        user = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);
      }

      const userId = user.id;

      // Check if transaction already processed
      const existingTx = getOne('SELECT * FROM transactions WHERE tx_hash = ?', [txHash]);

      if (existingTx) {
        return res.status(409).json({
          success: false,
          error: 'Transaction already processed',
        });
      }

      // Use transaction for atomic operations
      const result = transaction(() => {
        // Add to balance
        run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, userId]);

        // Create transaction record
        const txResult = run(
          `INSERT INTO transactions 
           (user_id, type, amount, tx_hash, status)
           VALUES (?, ?, ?, ?, ?)`,
          [userId, 'deposit', amount, txHash, 'confirmed']
        );

        // Get updated balance
        const updatedUser = getOne('SELECT * FROM users WHERE id = ?', [userId]);

        return { txId: txResult.lastInsertRowid, updatedUser };
      });

      res.json({
        success: true,
        depositId: result.txId,
        amount: amount,
        newBalance: parseFloat(result.updatedUser.balance),
        status: 'confirmed',
        message: 'Deposit confirmed',
      });
    } catch (error) {
      logger.error('Error processing deposit:', error);
      next(error);
    }
  }
);

/**
 * POST /api/payment/withdraw
 * Initiate a withdrawal
 */
router.post(
  '/withdraw',
  [
    body('publicKey').isString().isLength({ min: 55, max: 55 }).withMessage('Public key must be 55 characters'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('address').isString().notEmpty().withMessage('Destination address is required'),
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

      const { publicKey, amount, address } = req.body;

      // Get user
      const user = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const userId = user.id;
      const currentBalance = parseFloat(user.balance);
      const lockedBalance = parseFloat(user.locked_balance || 0);
      const availableBalance = currentBalance - lockedBalance;

      // Check sufficient balance
      if (availableBalance < amount) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient balance',
          availableBalance,
        });
      }

      // Use transaction for atomic operations
      const result = transaction(() => {
        // Lock withdrawal amount
        run('UPDATE users SET locked_balance = locked_balance + ? WHERE id = ?', [amount, userId]);

        // Create withdrawal transaction
        const txResult = run(
          `INSERT INTO transactions 
           (user_id, type, amount, status, metadata)
           VALUES (?, ?, ?, ?, ?)`,
          [
            userId,
            'withdrawal',
            amount,
            'pending',
            JSON.stringify({ address }),
          ]
        );

        return { txId: txResult.lastInsertRowid };
      });

      // TODO: Process withdrawal on blockchain
      // For now, we'll just mark it as pending

      res.json({
        success: true,
        withdrawalId: result.txId,
        amount: amount,
        status: 'pending',
        message: 'Withdrawal request submitted',
      });
    } catch (error) {
      logger.error('Error processing withdrawal:', error);
      next(error);
    }
  }
);

export default router;

