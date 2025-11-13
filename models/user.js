import db from '../config/db.js';

export function createUser({ email, password_hash }) {
  const stmt = db.prepare(`
    INSERT INTO users (email, password_hash, created_at)
    VALUES (?, ?, datetime('now'))
  `);
  const info = stmt.run(email, password_hash);
  return info.lastInsertRowid;
}

export function getUserByEmail(email) {
  const stmt = db.prepare(`SELECT * FROM users WHERE email = ?`);
  return stmt.get(email);
}

export function getUserById(id) {
  const stmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
  return stmt.get(id);
}
