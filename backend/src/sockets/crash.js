import { logger } from '../utils/logger.js';
import { getOne, run, transaction } from '../utils/dbHelpers.js';

// Game state management
const gameState = {
  currentGame: null,
  players: new Map(), // socketId -> player data
  multiplier: 1.0,
  isRunning: false,
  startTime: null,
};

// Generate crash multiplier (provably fair)
function generateCrashMultiplier() {
  // Simple provably fair multiplier generation
  // In production, use a proper provably fair algorithm
  const hash = Math.random().toString(36).substring(2, 15);
  const seed = parseInt(hash, 36) % 1000000;
  const e = 2 ** 32;
  const h = seed / e;
  let point = (1 - h) / (1 - h * 0.99);
  point = Math.floor(point * 100) / 100;
  return Math.max(1.01, Math.min(point, 1000)); // Between 1.01x and 1000x
}

// Normalize public key (handle 60-character WalletConnect format)
function normalizePublicKey(publicKey) {
  if (!publicKey) return null;
  let normalized = publicKey.trim();
  if (normalized.length === 60) {
    normalized = normalized.slice(-55);
  } else if (normalized.length > 55) {
    normalized = normalized.slice(-55);
  }
  return normalized.length === 55 ? normalized : null;
}

/**
 * Setup Crash game socket handlers
 */
export function setupCrashSocket(io) {
  const crashNamespace = io.of('/crashx');

  crashNamespace.on('connection', (socket) => {
    logger.info('Crash game client connected:', socket.id);

    // Handle authentication
    socket.on('auth', (token) => {
      // TODO: Verify token
      logger.info('Crash game authentication:', socket.id);
      socket.emit('auth-success');
    });

    // Handle join game
    socket.on('join-game', async (target, betAmount, currencyId) => {
      try {
        logger.info('Join game request:', { socketId: socket.id, target, betAmount, currencyId });

        // Get public key from socket handshake or auth
        const publicKey = socket.handshake.auth?.publicKey || socket.handshake.query?.publicKey;
        const normalizedPublicKey = normalizePublicKey(publicKey);

        if (!normalizedPublicKey) {
          socket.emit('bet-join-error', { message: 'Public key required' });
          return;
        }

        // Get or create user
        let user = getOne('SELECT * FROM users WHERE public_key = ?', [normalizedPublicKey]);
        if (!user) {
          run('INSERT INTO users (public_key, balance) VALUES (?, ?)', [normalizedPublicKey, 0]);
          user = getOne('SELECT * FROM users WHERE public_key = ?', [normalizedPublicKey]);
        }

        // Check if game is in starting state
        if (!gameState.isRunning && !gameState.currentGame) {
          // Start new game
          const crashPoint = generateCrashMultiplier();
          const gameId = `crash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          gameState.currentGame = {
            gameId,
            crashPoint,
            startTime: Date.now(),
            players: [],
          };
          gameState.isRunning = true;
          gameState.startTime = Date.now();
          gameState.multiplier = 1.0;

          // Emit game starting
          crashNamespace.emit('game-starting', {
            gameId,
            countdown: 5,
          });

          // Start game after countdown
          setTimeout(() => {
            crashNamespace.emit('game-started', {
              gameId,
              crashPoint,
            });

            // Simulate multiplier growth
            let currentMultiplier = 1.0;
            const interval = setInterval(() => {
              if (!gameState.isRunning) {
                clearInterval(interval);
                return;
              }

              currentMultiplier += 0.01;
              gameState.multiplier = currentMultiplier;

              crashNamespace.emit('multiplier-update', {
                multiplier: currentMultiplier.toFixed(2),
              });

              // Check if crashed
              if (currentMultiplier >= crashPoint) {
                clearInterval(interval);
                gameState.isRunning = false;

                // Process all players
                gameState.players.forEach((player, socketId) => {
                  if (player.cashedOut) {
                    // Player already cashed out
                    return;
                  }

                  // Player crashed - lost bet
                  const betAmount = parseFloat(player.betAmount);
                  transaction(() => {
                    run(
                      `UPDATE users SET locked_balance = locked_balance - ? WHERE id = ?`,
                      [betAmount, player.userId]
                    );

                    run(
                      `UPDATE games SET status = ?, completed_at = datetime('now') WHERE id = ?`,
                      ['lost', player.gameId]
                    );
                  });
                });

                crashNamespace.emit('game-crashed', {
                  crashPoint: crashPoint.toFixed(2),
                });

                // Reset game state
                setTimeout(() => {
                  gameState.currentGame = null;
                  gameState.players.clear();
                  gameState.multiplier = 1.0;
                }, 5000);
              }
            }, 100); // Update every 100ms
          }, 5000);
        }

        // Add player to game
        const gameId = gameState.currentGame?.gameId || `crash-${Date.now()}`;
        const playerData = {
          socketId: socket.id,
          userId: user.id,
          betAmount: parseFloat(betAmount),
          target: parseFloat(target) || 0,
          currencyId: currencyId || '',
          gameId,
          cashedOut: false,
        };

        gameState.players.set(socket.id, playerData);

        // Create game record in database
        transaction(() => {
          run(
            `INSERT INTO games (game_id, user_id, game_type, bet_amount, status, metadata)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              gameId,
              user.id,
              'crash',
              betAmount,
              'active',
              JSON.stringify({ target, currencyId }),
            ]
          );
        });

        socket.emit('bet-join-success', {
          playerID: socket.id,
          betAmount: betAmount,
          gameId,
        });
      } catch (error) {
        logger.error('Error joining crash game:', error);
        socket.emit('bet-join-error', { message: 'Failed to join game' });
      }
    });

    // Handle cashout
    socket.on('bet-cashout', async () => {
      try {
        const player = gameState.players.get(socket.id);
        if (!player || player.cashedOut) {
          socket.emit('bet-cashout-error', { message: 'No active bet found' });
          return;
        }

        if (!gameState.isRunning) {
          socket.emit('bet-cashout-error', { message: 'Game is not running' });
          return;
        }

        // Calculate win amount
        const currentMultiplier = gameState.multiplier;
        const winAmount = player.betAmount * currentMultiplier;
        const betAmount = player.betAmount;

        // Mark as cashed out
        player.cashedOut = true;
        player.cashoutMultiplier = currentMultiplier;

        // Process cashout in database
        transaction(() => {
          // Unlock bet amount and add winnings
          run(
            `UPDATE users 
             SET locked_balance = locked_balance - ?,
                 balance = balance - ? + ?
             WHERE id = ?`,
            [betAmount, betAmount, winAmount, player.userId]
          );

          // Update game status
          run(
            `UPDATE games 
             SET status = ?, win_amount = ?, completed_at = datetime('now')
             WHERE id = ?`,
            ['completed', winAmount, player.gameId]
          );

          // Create cashout transaction
          run(
            `INSERT INTO transactions 
             (user_id, type, game_type, amount, win_amount, status, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              player.userId,
              'cashout',
              'crash',
              betAmount,
              winAmount,
              'completed',
              JSON.stringify({ gameId: player.gameId, multiplier: currentMultiplier }),
            ]
          );
        });

        socket.emit('bet-cashout-success', {
          playerID: socket.id,
          multiplier: currentMultiplier.toFixed(2),
          winAmount: winAmount.toFixed(4),
        });
      } catch (error) {
        logger.error('Error processing cashout:', error);
        socket.emit('bet-cashout-error', { message: 'Cashout failed' });
      }
    });

    socket.on('disconnect', () => {
      logger.info('Crash game client disconnected:', socket.id);
      gameState.players.delete(socket.id);
    });
  });
}
