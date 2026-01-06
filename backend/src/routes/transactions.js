import express from 'express';
import { query, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';
import { getOne, getAll } from '../utils/dbHelpers.js';

const router = express.Router();

/**
 * GET /api/transactions/history
 * Get transaction history for a user
 */
router.get(
  '/history',
  [
    query('publicKey').isString().isLength({ min: 55, max: 55 }).withMessage('Public key must be 55 characters'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
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

      const { publicKey, limit = 50, offset = 0, type, gameType } = req.query;

      // Get user
      const user = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);

      if (!user) {
        return res.json({
          success: true,
          transactions: [],
          total: 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
        });
      }

      const userId = user.id;

      // Build query
      let queryText = 'SELECT * FROM transactions WHERE user_id = ?';
      const queryParams = [userId];

      if (type) {
        queryText += ' AND type = ?';
        queryParams.push(type);
      }

      if (gameType) {
        queryText += ' AND game_type = ?';
        queryParams.push(gameType);
      }

      queryText += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      queryParams.push(parseInt(limit), parseInt(offset));

      // Get total count
      let countQuery = 'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?';
      const countParams = [userId];

      if (type) {
        countQuery += ' AND type = ?';
        countParams.push(type);
      }

      if (gameType) {
        countQuery += ' AND game_type = ?';
        countParams.push(gameType);
      }

      const transactions = getAll(queryText, queryParams);
      const countResult = getOne(countQuery, countParams);
      const total = parseInt(countResult.count || 0);

      res.json({
        success: true,
        transactions: transactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          gameType: tx.game_type,
          amount: parseFloat(tx.amount),
          winAmount: parseFloat(tx.win_amount || 0),
          status: tx.status,
          txHash: tx.tx_hash,
          metadata: tx.metadata ? JSON.parse(tx.metadata) : null,
          createdAt: tx.created_at,
        })),
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (error) {
      logger.error('Error fetching transaction history:', error);
      next(error);
    }
  }
);

/**
 * GET /api/transactions/statistics
 * Get transaction statistics for a user
 */
router.get(
  '/statistics',
  [
    query('publicKey').isString().isLength({ min: 55, max: 55 }).withMessage('Public key must be 55 characters'),
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

      const { publicKey } = req.query;

      // Get user
      const user = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);

      if (!user) {
        return res.json({
          success: true,
          statistics: {
            totalBets: 0,
            totalWins: 0,
            totalLosses: 0,
            totalWagered: 0,
            totalWon: 0,
            totalLost: 0,
            netProfit: 0,
            winRate: 0,
            averageBet: 0,
            biggestWin: 0,
            biggestLoss: 0,
          },
        });
      }

      const userId = user.id;

      // Get statistics (SQLite doesn't support FILTER, using CASE instead)
      const stats = getOne(
        `SELECT 
          COUNT(CASE WHEN type = 'bet' THEN 1 END) as total_bets,
          COUNT(CASE WHEN type = 'cashout' AND win_amount > amount THEN 1 END) as total_wins,
          COUNT(CASE WHEN type = 'cashout' AND win_amount <= amount THEN 1 END) as total_losses,
          COALESCE(SUM(CASE WHEN type = 'bet' THEN amount END), 0) as total_wagered,
          COALESCE(SUM(CASE WHEN type = 'cashout' THEN win_amount END), 0) as total_won,
          COALESCE(SUM(CASE WHEN type = 'cashout' AND win_amount <= amount THEN amount END), 0) as total_lost,
          COALESCE(MAX(CASE WHEN type = 'cashout' THEN win_amount END), 0) as biggest_win,
          COALESCE(MAX(CASE WHEN type = 'cashout' AND win_amount <= amount THEN amount END), 0) as biggest_loss
        FROM transactions
        WHERE user_id = ?`,
        [userId]
      );

      const totalBets = parseInt(stats.total_bets) || 0;
      const totalWins = parseInt(stats.total_wins) || 0;
      const totalLosses = parseInt(stats.total_losses) || 0;
      const totalWagered = parseFloat(stats.total_wagered) || 0;
      const totalWon = parseFloat(stats.total_won) || 0;
      const totalLost = parseFloat(stats.total_lost) || 0;
      const biggestWin = parseFloat(stats.biggest_win) || 0;
      const biggestLoss = parseFloat(stats.biggest_loss) || 0;

      const netProfit = totalWon - totalWagered;
      const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;
      const averageBet = totalBets > 0 ? totalWagered / totalBets : 0;

      res.json({
        success: true,
        statistics: {
          totalBets,
          totalWins,
          totalLosses,
          totalWagered,
          totalWon,
          totalLost,
          netProfit,
          winRate: parseFloat(winRate.toFixed(2)),
          averageBet: parseFloat(averageBet.toFixed(9)),
          biggestWin,
          biggestLoss,
        },
      });
    } catch (error) {
      logger.error('Error fetching statistics:', error);
      next(error);
    }
  }
);

export default router;

