import express from 'express';
import { body, validationResult } from 'express-validator';
import { getDB } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { getOne, run } from '../utils/dbHelpers.js';

const router = express.Router();

/**
 * GET /api/balance
 * Get user balance by public key
 */
router.get(
  '/',
  [
    body('publicKey')
      .optional()
      .isString()
      .isLength({ min: 55, max: 55 })
      .withMessage('Public key must be exactly 55 characters'),
  ],
  async (req, res, next) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      let publicKey = req.query.publicKey || req.body.publicKey;

      if (!publicKey) {
        return res.status(400).json({
          success: false,
          error: 'Public key is required',
        });
      }

      // Normalize public key: trim whitespace and extract 55-character Qubic address
      publicKey = publicKey.trim();
      
      // Handle different formats:
      // - If it's 60 characters, it might be a WalletConnect address with prefix
      // - Extract the last 55 characters (Qubic address format)
      if (publicKey.length === 60) {
        // WalletConnect might return addresses with "qubic:" prefix or similar
        // Extract the last 55 characters which should be the Qubic address
        publicKey = publicKey.slice(-55);
      } else if (publicKey.length > 55) {
        // If longer than 55, try to extract 55 characters from the end
        publicKey = publicKey.slice(-55);
      }

      // Validate public key format
      if (publicKey.length !== 55) {
        return res.status(400).json({
          success: false,
          error: `Invalid public key format. Expected 55 characters, got ${req.query.publicKey?.length || req.body.publicKey?.length || 'unknown'} (normalized: ${publicKey.length}).`,
        });
      }

      // Get or create user
      let userData = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);

      if (!userData) {
        // Create new user with zero balance
        run('INSERT INTO users (public_key, balance) VALUES (?, ?)', [publicKey, 0]);
        userData = getOne('SELECT * FROM users WHERE public_key = ?', [publicKey]);
        logger.info(`New user created: ${publicKey}`);
      }

      // Return balance
      res.json({
        success: true,
        balance: parseFloat(userData.balance),
        lockedBalance: parseFloat(userData.locked_balance || 0),
        availableBalance: parseFloat(userData.balance) - parseFloat(userData.locked_balance || 0),
        currency: 'QUBIC',
        publicKey: userData.public_key,
      });
    } catch (error) {
      logger.error('Error fetching balance:', error);
      next(error);
    }
  }
);

export default router;

