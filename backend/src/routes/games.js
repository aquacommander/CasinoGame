import express from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';
import { getOne, run, transaction, getAll } from '../utils/dbHelpers.js';
import { verifyTransactionMiddleware, optionalVerifyTransaction } from '../middleware/verifyTransaction.js';

const router = express.Router();

/**
 * POST /api/games/place-bet
 * Record a bet transaction
 */
router.post(
  '/place-bet',
  [
    body('txHash').isString().notEmpty().withMessage('Transaction hash is required'),
    body('gameType').isIn(['crash', 'mines', 'videopoker', 'slide']).withMessage('Invalid game type'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('publicKey').isString().isLength({ min: 55, max: 55 }).withMessage('Public key must be 55 characters'),
  ],
  optionalVerifyTransaction, // Optional verification (non-blocking in dev)
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

      const { txHash, gameType, amount, publicKey, gameId, metadata } = req.body;

      logger.info('Placing bet:', { txHash, gameType, amount, publicKey });

      // Get or create user
      let user = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);

      if (!user) {
        run('INSERT INTO users (public_key, balance) VALUES (?, ?)', [publicKey, 0]);
        user = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);
      }

      const userId = user.id;
      const currentBalance = parseFloat(user.balance);
      const lockedBalance = parseFloat(user.locked_balance || 0);

      // Check if transaction hash already used (prevent double-spending)
      const existingTx = getOne('SELECT * FROM transactions WHERE tx_hash = ?', [txHash]);

      if (existingTx) {
        return res.status(409).json({
          success: false,
          error: 'Transaction already processed',
        });
      }

      // Check sufficient balance
      if (currentBalance - lockedBalance < amount) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient balance',
        });
      }

      // Use transaction for atomic operations
      const result = transaction(() => {
        // Lock the amount
        run('UPDATE users SET locked_balance = locked_balance + ? WHERE id = ?', [amount, userId]);

        // Create transaction record
        const txResult = run(
          `INSERT INTO transactions 
           (user_id, type, game_type, amount, tx_hash, status, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, 'bet', gameType, amount, txHash, 'pending', JSON.stringify(metadata || {})]
        );

        // Create or update game record
        let gameRecord;
        if (gameId) {
          gameRecord = getOne('SELECT * FROM games WHERE game_id = ?', [gameId]);
        }

        if (!gameRecord) {
          const newGameId = gameId || `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          run(
            `INSERT INTO games (game_id, user_id, game_type, bet_amount, status, metadata)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [newGameId, userId, gameType, amount, 'active', JSON.stringify(metadata || {})]
          );
          gameRecord = getOne('SELECT * FROM games WHERE game_id = ?', [newGameId]);
        }

        return { txId: txResult.lastInsertRowid, gameRecord };
      });

      res.json({
        success: true,
        betId: result.txId,
        gameId: result.gameRecord.game_id,
        lockedAmount: amount,
        message: 'Bet placed successfully',
      });
    } catch (error) {
      logger.error('Error placing bet:', error);
      next(error);
    }
  }
);

/**
 * POST /api/games/cashout
 * Process a cashout
 */
router.post(
  '/cashout',
  [
    body('gameType').isIn(['crash', 'mines', 'videopoker', 'slide']).withMessage('Invalid game type'),
    body('gameId').isString().notEmpty().withMessage('Game ID is required'),
    body('publicKey').isString().isLength({ min: 55, max: 55 }).withMessage('Public key must be 55 characters'),
    body('winAmount').isFloat({ min: 0 }).withMessage('Win amount must be a positive number'),
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

      const { gameType, gameId, publicKey, winAmount, multiplier } = req.body;

      // Get user
      const user = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const userId = user.id;

      // Get game
      const game = getOne(
        'SELECT * FROM games WHERE game_id = ? AND user_id = ? AND status = ?',
        [gameId, userId, 'active']
      );

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found or already completed',
        });
      }

      const betAmount = parseFloat(game.bet_amount);
      const netWin = winAmount - betAmount; // Net profit

      // Use transaction for atomic operations
      const result = transaction(() => {
        // Unlock bet amount and add winnings
        run(
          `UPDATE users 
           SET locked_balance = locked_balance - ?,
               balance = balance - ? + ?
           WHERE id = ?`,
          [betAmount, betAmount, winAmount, userId]
        );

        // Update game status
        run(
          `UPDATE games 
           SET status = ?, win_amount = ?, completed_at = datetime('now')
           WHERE id = ?`,
          ['completed', winAmount, game.id]
        );

        // Create cashout transaction
        const txResult = run(
          `INSERT INTO transactions 
           (user_id, type, game_type, amount, win_amount, status, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            'cashout',
            gameType,
            betAmount,
            winAmount,
            'completed',
            JSON.stringify({ multiplier, gameId }),
          ]
        );

        // Get updated balance
        const updatedUser = getOne('SELECT * FROM users WHERE id = ?', [userId]);

        return { txId: txResult.lastInsertRowid, updatedUser };
      });

      res.json({
        success: true,
        cashoutId: result.txId,
        winAmount: winAmount,
        netProfit: netWin,
        newBalance: parseFloat(result.updatedUser.balance),
        message: 'Cashout processed successfully',
      });
    } catch (error) {
      logger.error('Error processing cashout:', error);
      next(error);
    }
  }
);

export default router;

