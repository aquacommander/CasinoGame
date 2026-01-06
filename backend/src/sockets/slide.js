import { logger } from '../utils/logger.js';
import { getOne, run, transaction } from '../utils/dbHelpers.js';

// Game state management
const gameState = {
  currentGame: null,
  players: new Map(), // socketId -> player data
  status: 'WAITTING', // WAITTING, STARTING, BETTING, PLAYING
  result: null,
  history: [],
};

// Generate slide result (provably fair)
function generateSlideResult() {
  // Simple provably fair result generation
  // In production, use a proper provably fair algorithm
  const hash = Math.random().toString(36).substring(2, 15);
  const seed = parseInt(hash, 36) % 1000000;
  const e = 2 ** 32;
  const h = seed / e;
  
  // Generate result between 1.01x and 100x
  let result = 1.01 + (h * 98.99);
  result = Math.floor(result * 100) / 100;
  
  return result;
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
 * Setup Slide game socket handlers
 */
export function setupSlideSocket(io) {
  const slideNamespace = io.of('/slide');

  // Game loop
  const startGameLoop = () => {
    if (gameState.status !== 'WAITTING') return;

    // Start betting phase
    gameState.status = 'STARTING';
    slideNamespace.emit('status', {
      status: 'STARTING',
      countdown: 5,
    });

    setTimeout(() => {
      gameState.status = 'BETTING';
      slideNamespace.emit('status', {
        status: 'BETTING',
        countdown: 10, // 10 seconds to place bets
      });

      setTimeout(() => {
        // Generate result
        const result = generateSlideResult();
        gameState.result = result;
        gameState.status = 'PLAYING';

        // Generate public/private seeds for provably fair
        const publicSeed = Math.random().toString(36).substring(2, 15);
        const privateHash = Buffer.from(Math.random().toString(36)).toString('base64').substring(0, 32);

        const gameId = `slide-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        gameState.currentGame = {
          gameId,
          result,
          publicSeed,
          privateHash,
          startTime: Date.now(),
        };

        slideNamespace.emit('status', {
          status: 'PLAYING',
          _id: gameId,
          publicSeed,
          privateHash,
          resultpoint: result,
        });

        // Process all players
        setTimeout(() => {
          gameState.players.forEach((player, socketId) => {
            const winAmount = player.betAmount * result;
            const betAmount = player.betAmount;

            if (result >= player.target) {
              // Player won
              transaction(() => {
                run(
                  `UPDATE users 
                   SET locked_balance = locked_balance - ?,
                       balance = balance - ? + ?
                   WHERE id = ?`,
                  [betAmount, betAmount, winAmount, player.userId]
                );

                run(
                  `UPDATE games 
                   SET status = ?, win_amount = ?, completed_at = datetime('now')
                   WHERE id = ?`,
                  ['completed', winAmount, player.gameId]
                );

                run(
                  `INSERT INTO transactions 
                   (user_id, type, game_type, amount, win_amount, status, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [
                    player.userId,
                    'cashout',
                    'slide',
                    betAmount,
                    winAmount,
                    'completed',
                    JSON.stringify({ gameId: player.gameId, multiplier: result, target: player.target }),
                  ]
                );
              });
            } else {
              // Player lost
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
            }
          });

          // Add to history
          gameState.history.unshift({
            resultpoint: result,
            timestamp: Date.now(),
          });
          if (gameState.history.length > 100) {
            gameState.history.pop();
          }

          // Emit history update
          slideNamespace.emit('history', gameState.history.slice(0, 10));

          // Reset for next game
          gameState.players.clear();
          gameState.status = 'WAITTING';
          gameState.currentGame = null;

          // Start next game after delay
          setTimeout(() => {
            startGameLoop();
          }, 5000);
        }, 3000); // Wait 3 seconds for animation
      }, 10000); // 10 second betting phase
    }, 5000); // 5 second countdown
  };

  // Start game loop
  startGameLoop();

  slideNamespace.on('connection', (socket) => {
    logger.info('Slide game client connected:', socket.id);

    // Send current status
    socket.emit('status', {
      status: gameState.status,
      _id: gameState.currentGame?.gameId,
      publicSeed: gameState.currentGame?.publicSeed,
      privateHash: gameState.currentGame?.privateHash,
      resultpoint: gameState.result,
    });

    // Send history
    socket.emit('history', gameState.history.slice(0, 10));

    // Handle join game
    socket.on('join-game', async (target, betAmount, currencyId) => {
      try {
        logger.info('Slide join game request:', {
          socketId: socket.id,
          target,
          betAmount,
          currencyId,
        });

        if (gameState.status !== 'BETTING') {
          socket.emit('game-join-error', {
            message: 'Game is not in betting phase',
          });
          return;
        }

        // Get public key from socket handshake or auth
        const publicKey = socket.handshake.auth?.publicKey || socket.handshake.query?.publicKey;
        const normalizedPublicKey = normalizePublicKey(publicKey);

        if (!normalizedPublicKey) {
          socket.emit('game-join-error', { message: 'Public key required' });
          return;
        }

        // Get or create user
        let user = getOne('SELECT * FROM users WHERE public_key = ?', [normalizedPublicKey]);
        if (!user) {
          run('INSERT INTO users (public_key, balance) VALUES (?, ?)', [normalizedPublicKey, 0]);
          user = getOne('SELECT * FROM users WHERE public_key = ?', [normalizedPublicKey]);
        }

        const gameId = gameState.currentGame?.gameId || `slide-${Date.now()}`;

        // Add player to game
        const playerData = {
          socketId: socket.id,
          userId: user.id,
          betAmount: parseFloat(betAmount),
          target: parseFloat(target) || 1.01,
          currencyId: currencyId || '',
          gameId,
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
              'slide',
              betAmount,
              'active',
              JSON.stringify({ target, currencyId }),
            ]
          );
        });

        socket.emit('game-join-sucess', {
          playerId: socket.id,
          target,
          betAmount,
          gameId,
          _id: gameId,
        });

        // Emit bet to all clients
        slideNamespace.emit('bet', {
          playerId: socket.id,
          betAmount,
          target,
        });
      } catch (error) {
        logger.error('Error joining slide game:', error);
        socket.emit('game-join-error', { message: 'Failed to join game' });
      }
    });

    socket.on('disconnect', () => {
      logger.info('Slide game client disconnected:', socket.id);
      gameState.players.delete(socket.id);
    });
  });
}
