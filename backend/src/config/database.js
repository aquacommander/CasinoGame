import initSqlJs from 'sql.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/casino.db');

// SQL.js instance and database
let SQL;
let db;

/**
 * Initialize SQL.js and load/create database
 */
async function initDatabase() {
  try {
    // Initialize SQL.js
    // For Node.js, we need to load the WASM file from node_modules
    const wasmPath = path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
    
    let wasmBinary;
    if (fs.existsSync(wasmPath)) {
      wasmBinary = fs.readFileSync(wasmPath);
      logger.info('Loading SQL.js WASM from local file');
    } else {
      logger.warn('WASM file not found locally, sql.js will try to download it');
    }

    SQL = await initSqlJs({
      locateFile: (file) => {
        // Try local path first
        const localPath = path.join(__dirname, '../../node_modules/sql.js/dist', file);
        if (fs.existsSync(localPath)) {
          return localPath;
        }
        // Fallback to CDN (won't work in Node.js, but sql.js handles this)
        return `https://sql.js.org/dist/${file}`;
      },
      wasmBinary: wasmBinary,
    });

    // Create data directory if it doesn't exist
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
      logger.info('SQLite database loaded from file');
    } else {
      db = new SQL.Database();
      logger.info('New SQLite database created');
    }

    // Run migrations
    runMigrations();
    
    logger.info('SQLite database connection established');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

/**
 * Save database to file
 */
function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    logger.error('Failed to save database:', error);
  }
}

/**
 * Connect to database and run migrations
 */
export async function connectDB() {
  await initDatabase();
  
  // Set up auto-save (save every 5 seconds)
  setInterval(() => {
    saveDatabase();
  }, 5000);
  
  // Save on process exit
  process.on('SIGINT', () => {
    saveDatabase();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    saveDatabase();
    process.exit(0);
  });
}

/**
 * Run database migrations
 */
function runMigrations() {
  try {
    // Create users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_key TEXT UNIQUE NOT NULL,
        balance REAL DEFAULT 0,
        locked_balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create transactions table
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        game_type TEXT,
        amount REAL NOT NULL,
        win_amount REAL DEFAULT 0,
        tx_hash TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Create games table
    db.run(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        game_type TEXT NOT NULL,
        bet_amount REAL NOT NULL,
        win_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Create indexes
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_users_public_key ON users(public_key);
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id);
      CREATE INDEX IF NOT EXISTS idx_games_game_id ON games(game_id);
      CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
    `);

    // Save after migrations
    saveDatabase();
    
    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Get database instance
 */
export function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return db;
}

// Export db for direct use (for compatibility)
export { db };
