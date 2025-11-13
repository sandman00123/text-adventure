import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'adventure.db');

// Ensure file exists
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '');
}

export const db = new Database(dbPath);

// Create tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS adventures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  genre TEXT NOT NULL,
  main_quest_template TEXT NOT NULL,
  main_quest_filled TEXT,            -- optional, once AI concretizes
  status TEXT NOT NULL,              -- 'active' | 'completed'
  history_json TEXT NOT NULL,        -- full turn-by-turn (array of {role, content})
  state_json TEXT NOT NULL,          -- computed game state (flags, inventory, clues, etc.)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

export default db;
