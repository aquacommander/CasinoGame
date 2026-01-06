import express from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';
import { getOne, getAll, run, transaction } from '../utils/dbHelpers.js';

const router = express.Router();

/**
 * POST /api/mine/status
 * Check for active Mines game
 */
router.post('/status', async (req, res, next) => {
  try {
    // Get public key from request (should be in body or headers)
    const publicKey = req.body.publicKey || req.headers['x-public-key'];
    
    if (!publicKey) {
      return res.status(400).json({
        success: false,
        error: 'Public key is required',
      });
    }

    // Normalize public key (handle 60-character WalletConnect format)
    let normalizedPublicKey = publicKey.trim();
    if (normalizedPublicKey.length === 60) {
      normalizedPublicKey = normalizedPublicKey.slice(-55);
    } else if (normalizedPublicKey.length > 55) {
      normalizedPublicKey = normalizedPublicKey.slice(-55);
    }

    // Get user
    const user = getOne('SELECT * FROM users WHERE public_key = ?', [normalizedPublicKey]);
    
    if (!user) {
      return res.json({
        success: false,
        message: 'No active game found',
      });
    }

    // Get active Mines game
    const game = getOne(
      `SELECT * FROM games 
       WHERE user_id = ? AND game_type = 'mines' AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    if (!game) {
      return res.json({
        success: false,
        message: 'No active game found',
      });
    }

    // Parse game metadata
    const metadata = JSON.parse(game.metadata || '{}');
    const mineAreas = metadata.mineAreas || [];
    const mines = metadata.mines || 0;

    res.json({
      success: true,
      datas: mineAreas,
      amount: parseFloat(game.bet_amount),
      mines: mines,
      gameId: game.game_id,
    });
  } catch (error) {
    logger.error('Error checking Mines game status:', error);
    next(error);
  }
});

/**
 * POST /api/mine/create
 * Create a new Mines game
 */
router.post(
  '/create',
  [
    body('mines').isInt({ min: 1, max: 24 }).withMessage('Mines must be between 1 and 24'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
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

      const { mines, amount, txHash } = req.body;
      const publicKey = req.body.publicKey || req.headers['x-public-key'];

      if (!publicKey) {
        return res.status(400).json({
          success: false,
          error: 'Public key is required',
        });
      }

      // Normalize public key
      let normalizedPublicKey = publicKey.trim();
      if (normalizedPublicKey.length === 60) {
        normalizedPublicKey = normalizedPublicKey.slice(-55);
      } else if (normalizedPublicKey.length > 55) {
        normalizedPublicKey = normalizedPublicKey.slice(-55);
      }

      // Get or create user
      let user = getOne('SELECT * FROM users WHERE public_key = ?', [normalizedPublicKey]);
      if (!user) {
        run('INSERT INTO users (public_key, balance) VALUES (?, ?)', [normalizedPublicKey, 0]);
        user = getOne('SELECT * FROM users WHERE public_key = ?', [normalizedPublicKey]);
      }

      const userId = user.id;

      // Generate game ID
      const gameId = `mine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create game record
      const result = transaction(() => {
        run(
          `INSERT INTO games (game_id, user_id, game_type, bet_amount, status, metadata)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            gameId,
            userId,
            'mines',
            amount,
            'active',
            JSON.stringify({
              mines: mines,
              mineAreas: [],
              revealedAreas: [],
            }),
          ]
        );

        // Record transaction
        run(
          `INSERT INTO transactions 
           (user_id, type, game_type, amount, tx_hash, status, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            'bet',
            'mines',
            amount,
            txHash,
            'pending',
            JSON.stringify({ gameId, mines }),
          ]
        );

        return { gameId };
      });

      res.json({
        status: 'BET',
        gameId: result.gameId,
        _id: result.gameId, // For backward compatibility
        mines: mines,
        amount: amount,
      });
    } catch (error) {
      logger.error('Error creating Mines game:', error);
      next(error);
    }
  }
);

/**
 * POST /api/mine/bet
 * Reveal a point in the Mines game
 */
router.post(
  '/bet',
  [
    body('point').isInt({ min: 0, max: 24 }).withMessage('Point must be between 0 and 24'),
    body('gameId').isString().notEmpty().withMessage('Game ID is required'),
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

      const { point, gameId } = req.body;
      const publicKey = req.body.publicKey || req.headers['x-public-key'];

      if (!publicKey) {
        return res.status(400).json({
          success: false,
          error: 'Public key is required',
        });
      }

      // Normalize public key
      let normalizedPublicKey = publicKey.trim();
      if (normalizedPublicKey.length === 60) {
        normalizedPublicKey = normalizedPublicKey.slice(-55);
      } else if (normalizedPublicKey.length > 55) {
        normalizedPublicKey = normalizedPublicKey.slice(-55);
      }

      // Get user
      const user = getOne('SELECT * FROM users WHERE public_key = ?', [normalizedPublicKey]);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Get game
      const game = getOne(
        'SELECT * FROM games WHERE game_id = ? AND user_id = ? AND status = ?',
        [gameId, user.id, 'active']
      );

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found or already completed',
        });
      }

      // Parse metadata
      const metadata = JSON.parse(game.metadata || '{}');
      const mineAreas = metadata.mineAreas || [];
      const revealedAreas = metadata.revealedAreas || [];
      const mines = metadata.mines || 0;

      // Check if point already revealed
      if (revealedAreas.includes(point)) {
        return res.status(400).json({
          success: false,
          error: 'Point already revealed',
        });
      }

      // Generate mine positions if not already set
      if (mineAreas.length === 0) {
        // Generate random mine positions
        const allPoints = Array.from({ length: 25 }, (_, i) => i);
        const shuffled = allPoints.sort(() => Math.random() - 0.5);
        const minePositions = shuffled.slice(0, mines);
        
        metadata.mineAreas = minePositions;
        metadata.revealedAreas = [];
      }

      // Check if point is a mine
      const isMine = metadata.mineAreas.includes(point);
      const newRevealedAreas = [...revealedAreas, point];

      // Update game metadata
      metadata.revealedAreas = newRevealedAreas;

      // Update game record
      run(
        `UPDATE games SET metadata = ? WHERE id = ?`,
        [JSON.stringify(metadata), game.id]
      );

      // If it's a mine, game is over (lost)
      if (isMine) {
        run(
          `UPDATE games SET status = ?, completed_at = datetime('now') WHERE id = ?`,
          ['lost', game.id]
        );

        // Unlock balance (user loses the bet)
        const betAmount = parseFloat(game.bet_amount);
        run(
          `UPDATE users SET locked_balance = locked_balance - ? WHERE id = ?`,
          [betAmount, user.id]
        );

        return res.json({
          success: true,
          mine: true,
          gameOver: true,
          message: 'Mine hit! Game over.',
        });
      }

      // Calculate win amount based on revealed safe areas
      const safeRevealed = newRevealedAreas.filter(p => !metadata.mineAreas.includes(p)).length;
      const totalSafe = 25 - mines;
      const multiplier = safeRevealed > 0 ? (totalSafe / (totalSafe - safeRevealed + 1)) : 1;
      const winAmount = parseFloat(game.bet_amount) * multiplier;

      res.json({
        success: true,
        mine: false,
        point: point,
        revealedAreas: newRevealedAreas,
        safeRevealed: safeRevealed,
        totalSafe: totalSafe,
        multiplier: multiplier,
        winAmount: winAmount,
        gameOver: false,
      });
    } catch (error) {
      logger.error('Error processing Mines bet:', error);
      next(error);
    }
  }
);

/**
 * POST /api/mine/cashout
 * Cashout from Mines game
 */
router.post(
  '/cashout',
  [
    body('gameId').isString().notEmpty().withMessage('Game ID is required'),
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

      const { gameId } = req.body;
      const publicKey = req.body.publicKey || req.headers['x-public-key'];

      if (!publicKey) {
        return res.status(400).json({
          success: false,
          error: 'Public key is required',
        });
      }

      // Normalize public key
      let normalizedPublicKey = publicKey.trim();
      if (normalizedPublicKey.length === 60) {
        normalizedPublicKey = normalizedPublicKey.slice(-55);
      } else if (normalizedPublicKey.length > 55) {
        normalizedPublicKey = normalizedPublicKey.slice(-55);
      }

      // Get user
      const user = getOne('SELECT * FROM users WHERE public_key = ?', [normalizedPublicKey]);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Get game
      const game = getOne(
        'SELECT * FROM games WHERE game_id = ? AND user_id = ? AND status = ?',
        [gameId, user.id, 'active']
      );

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found or already completed',
        });
      }

      // Parse metadata
      const metadata = JSON.parse(game.metadata || '{}');
      const revealedAreas = metadata.revealedAreas || [];
      const mines = metadata.mines || 0;
      const betAmount = parseFloat(game.bet_amount);

      // Calculate win amount
      const safeRevealed = revealedAreas.filter(p => !metadata.mineAreas.includes(p)).length;
      const totalSafe = 25 - mines;
      const multiplier = safeRevealed > 0 ? (totalSafe / (totalSafe - safeRevealed + 1)) : 1;
      const winAmount = betAmount * multiplier;
      const netWin = winAmount - betAmount;

      // Process cashout
      const result = transaction(() => {
        // Unlock bet amount and add winnings
        run(
          `UPDATE users 
           SET locked_balance = locked_balance - ?,
               balance = balance - ? + ?
           WHERE id = ?`,
          [betAmount, betAmount, winAmount, user.id]
        );

        // Update game status
        run(
          `UPDATE games 
           SET status = ?, win_amount = ?, completed_at = datetime('now')
           WHERE id = ?`,
          ['completed', winAmount, game.id]
        );

        // Create cashout transaction
        run(
          `INSERT INTO transactions 
           (user_id, type, game_type, amount, win_amount, status, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            'cashout',
            'mines',
            betAmount,
            winAmount,
            'completed',
            JSON.stringify({ gameId, multiplier, safeRevealed }),
          ]
        );

        // Get updated balance
        const updatedUser = getOne('SELECT * FROM users WHERE id = ?', [user.id]);

        return { updatedUser };
      });

      res.json({
        success: true,
        winAmount: winAmount,
        netProfit: netWin,
        newBalance: parseFloat(result.updatedUser.balance),
        multiplier: multiplier,
        safeRevealed: safeRevealed,
        message: 'Cashout processed successfully',
      });
    } catch (error) {
      logger.error('Error processing Mines cashout:', error);
      next(error);
    }
  }
);

/**
 * POST /api/mine/autobet
 * Auto-bet functionality for Mines game
 */
router.post(
  '/autobet',
  [
    body('mines').isInt({ min: 1, max: 24 }).withMessage('Mines must be between 1 and 24'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('count').optional().isInt({ min: 1 }).withMessage('Count must be a positive integer'),
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

      // Auto-bet is mainly handled on the frontend
      // This endpoint can be used to track auto-bet sessions
      res.json({
        success: true,
        message: 'Auto-bet configuration received',
      });
    } catch (error) {
      logger.error('Error processing Mines autobet:', error);
      next(error);
    }
  }
);

export default router;

