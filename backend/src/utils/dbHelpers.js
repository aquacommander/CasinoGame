import { getDB } from '../config/database.js';

/**
 * Helper functions for SQLite database operations using sql.js
 */

/**
 * Get a single row
 */
export function getOne(query, params = []) {
  const db = getDB();
  const stmt = db.prepare(query);
  stmt.bind(params);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

/**
 * Get multiple rows
 */
export function getAll(query, params = []) {
  const db = getDB();
  const stmt = db.prepare(query);
  stmt.bind(params);
  
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Execute a query (INSERT, UPDATE, DELETE)
 */
export function run(query, params = []) {
  const db = getDB();
  const stmt = db.prepare(query);
  stmt.bind(params);
  stmt.step();
  
  // Get last insert rowid
  let lastInsertRowid = null;
  try {
    const result = db.exec("SELECT last_insert_rowid() as id");
    if (result && result.length > 0 && result[0].values && result[0].values.length > 0) {
      lastInsertRowid = result[0].values[0][0];
    }
  } catch (e) {
    // Ignore if not an INSERT or if query fails
  }
  
  const result = {
    lastInsertRowid: lastInsertRowid,
    changes: stmt.getRowsModified() || 0,
  };
  stmt.free();
  return result;
}

/**
 * Execute multiple queries in a transaction
 */
export function transaction(callback) {
  const db = getDB();
  try {
    db.run('BEGIN TRANSACTION');
    const result = callback();
    db.run('COMMIT');
    return result;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
