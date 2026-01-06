import express from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';
import { getOne, run, transaction } from '../utils/dbHelpers.js';

const router = express.Router();

// Utility functions for deck operations
const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Create a standard 52-card deck
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

// Shuffle deck using Fisher-Yates algorithm
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Generate a random seed for provably fair gaming
function generateSeed() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * POST /api/video-poker/fetchgame
 * Fetch existing Video Poker game
 */
router.post('/fetchgame', async (req, res, next) => {
  try {
    const publicKey = req.body.publicKey || req.headers['x-public-key'];
    
    if (!publicKey) {
      return res.json({
        success: false,
        hand: [],
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
      return res.json({
        success: false,
        hand: [],
      });
    }

    // Get active Video Poker game
    const game = getOne(
      `SELECT * FROM games 
       WHERE user_id = ? AND game_type = 'videopoker' AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    if (!game) {
      return res.json({
        success: false,
        hand: [],
      });
    }

    // Parse game metadata
    const metadata = JSON.parse(game.metadata || '{}');
    const hand = metadata.hand || [];

    res.json({
      success: true,
      hand: hand,
      gameId: game.game_id,
    });
  } catch (error) {
    logger.error('Error fetching Video Poker game:', error);
    next(error);
  }
});

/**
 * POST /api/video-poker/init
 * Initialize a new Video Poker game
 */
router.post(
  '/init',
  [
    body('betAmount').isFloat({ min: 0 }).withMessage('Bet amount must be a positive number'),
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

      const { betAmount, txHash } = req.body;
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
      const gameId = `videopoker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Generate seeds for provably fair gaming
      const privateSeed = generateSeed();
      const publicSeed = generateSeed();
      const privateSeedHash = Buffer.from(privateSeed).toString('base64').substring(0, 32);

      // Create and shuffle deck
      const deck = shuffleDeck(createDeck());
      
      // Deal initial 5 cards
      const hand = deck.slice(0, 5);
      const remainingDeck = deck.slice(5);

      // Create game record
      const result = transaction(() => {
        run(
          `INSERT INTO games (game_id, user_id, game_type, bet_amount, status, metadata)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            gameId,
            userId,
            'videopoker',
            betAmount,
            'active',
            JSON.stringify({
              hand: hand,
              remainingDeck: remainingDeck,
              holds: [],
              privateSeed: privateSeed,
              publicSeed: publicSeed,
              privateSeedHash: privateSeedHash,
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
            'videopoker',
            betAmount,
            txHash,
            'pending',
            JSON.stringify({ gameId }),
          ]
        );

        return { gameId };
      });

      res.json({
        success: true,
        gameId: result.gameId,
        _id: result.gameId, // For backward compatibility
        hand: hand,
        privateSeedHash: privateSeedHash,
        publicSeed: publicSeed,
      });
    } catch (error) {
      logger.error('Error initializing Video Poker game:', error);
      next(error);
    }
  }
);

/**
 * POST /api/video-poker/draw
 * Draw new cards (replace non-held cards)
 */
router.post(
  '/draw',
  [
    body('holdIndexes').isArray().withMessage('Hold indexes must be an array'),
    body('gameId').optional().isString().withMessage('Game ID must be a string'),
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

      const { holdIndexes = [] } = req.body;
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

      // Get active game (use gameId if provided, otherwise get latest)
      let game;
      if (req.body.gameId) {
        game = getOne(
          'SELECT * FROM games WHERE game_id = ? AND user_id = ? AND status = ?',
          [req.body.gameId, user.id, 'active']
        );
      } else {
        game = getOne(
          `SELECT * FROM games 
           WHERE user_id = ? AND game_type = 'videopoker' AND status = 'active'
           ORDER BY created_at DESC LIMIT 1`,
          [user.id]
        );
      }

      if (!game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found or already completed',
        });
      }

      // Parse metadata
      const metadata = JSON.parse(game.metadata || '{}');
      let hand = metadata.hand || [];
      let remainingDeck = metadata.remainingDeck || [];

      // Replace cards that are not held
      const newHand = [...hand];
      for (let i = 0; i < newHand.length; i++) {
        if (!holdIndexes.includes(i)) {
          // Draw a new card from remaining deck
          if (remainingDeck.length > 0) {
            newHand[i] = remainingDeck.shift();
          }
        }
      }

      // Update game metadata
      metadata.hand = newHand;
      metadata.remainingDeck = remainingDeck;
      metadata.holds = holdIndexes;

      // Evaluate hand and calculate win
      const { ranking, multiplier } = evaluateHand(newHand);
      const betAmount = parseFloat(game.bet_amount);
      const winAmount = ranking ? betAmount * multiplier : 0;

      // Update game record
      if (winAmount > 0) {
        // Game won - process cashout
        transaction(() => {
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
             SET status = ?, win_amount = ?, completed_at = datetime('now'), metadata = ?
             WHERE id = ?`,
            ['completed', winAmount, JSON.stringify(metadata), game.id]
          );

          // Create cashout transaction
          run(
            `INSERT INTO transactions 
             (user_id, type, game_type, amount, win_amount, status, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              user.id,
              'cashout',
              'videopoker',
              betAmount,
              winAmount,
              'completed',
              JSON.stringify({ gameId: game.game_id, ranking, multiplier }),
            ]
          );
        });
      } else {
        // Game lost - just unlock bet amount
        transaction(() => {
          run(
            `UPDATE users 
             SET locked_balance = locked_balance - ?
             WHERE id = ?`,
            [betAmount, user.id]
          );

          // Update game status
          run(
            `UPDATE games 
             SET status = ?, completed_at = datetime('now'), metadata = ?
             WHERE id = ?`,
            ['lost', JSON.stringify(metadata), game.id]
          );
        });
      }

      // Return response in format expected by frontend
      res.json({
        success: true,
        hand: newHand,
        result: ranking || '',
        payout: multiplier || 0,
        privateSeed: metadata.privateSeed || '',
        winAmount: winAmount,
        gameOver: true,
      });
    } catch (error) {
      logger.error('Error drawing Video Poker cards:', error);
      next(error);
    }
  }
);

/**
 * Evaluate poker hand and return ranking and multiplier
 */
function evaluateHand(hand) {
  if (!hand || hand.length !== 5) {
    return { ranking: '', multiplier: 0 };
  }

  // Count ranks and suits
  const rankCounts = {};
  const suitCounts = {};
  
  for (const card of hand) {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }

  const ranks = Object.keys(rankCounts);
  const suits = Object.keys(suitCounts);
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  // Check for Royal Flush (A, K, Q, J, 10 of same suit)
  if (suits.length === 1 && ranks.includes('A') && ranks.includes('K') && 
      ranks.includes('Q') && ranks.includes('J') && ranks.includes('10')) {
    return { ranking: 'royal_flush', multiplier: 800 };
  }

  // Check for Straight Flush
  if (suits.length === 1 && isStraight(ranks)) {
    return { ranking: 'straight_flush', multiplier: 60 };
  }

  // Check for 4 of a Kind
  if (counts[0] === 4) {
    return { ranking: '4_of_a_kind', multiplier: 22 };
  }

  // Check for Full House
  if (counts[0] === 3 && counts[1] === 2) {
    return { ranking: 'full_house', multiplier: 9 };
  }

  // Check for Flush
  if (suits.length === 1) {
    return { ranking: 'flush', multiplier: 6 };
  }

  // Check for Straight
  if (isStraight(ranks)) {
    return { ranking: 'straight', multiplier: 4 };
  }

  // Check for 3 of a Kind
  if (counts[0] === 3) {
    return { ranking: '3_of_a_kind', multiplier: 3 };
  }

  // Check for Pair of Jacks or Better
  const pairRanks = ranks.filter(r => rankCounts[r] === 2);
  if (pairRanks.length > 0) {
    const highPair = pairRanks.find(r => ['J', 'Q', 'K', 'A'].includes(r));
    if (highPair) {
      return { ranking: 'pair', multiplier: 1 };
    }
  }

  return { ranking: '', multiplier: 0 };
}

/**
 * Check if ranks form a straight
 */
function isStraight(ranks) {
  const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const sortedRanks = ranks.sort((a, b) => rankOrder.indexOf(a) - rankOrder.indexOf(b));
  
  // Check for regular straight
  for (let i = 0; i < sortedRanks.length - 1; i++) {
    const currentIdx = rankOrder.indexOf(sortedRanks[i]);
    const nextIdx = rankOrder.indexOf(sortedRanks[i + 1]);
    if (nextIdx !== currentIdx + 1) {
      return false;
    }
  }
  
  // Check for A-2-3-4-5 straight (wheel)
  if (sortedRanks.join(',') === '2,3,4,5,A') {
    return true;
  }
  
  return true;
}

export default router;

