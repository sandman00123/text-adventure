import db from '../config/db.js';

export function createAdventure({ user_id, genre, main_quest_template, main_quest_filled }) {
  const stmt = db.prepare(`
    INSERT INTO adventures
    (user_id, genre, main_quest_template, main_quest_filled, status, history_json, state_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', '[]', '{"flags":{}, "inventory":[], "clues":[]}', datetime('now'), datetime('now'))
  `);
  const info = stmt.run(user_id, genre, main_quest_template, main_quest_filled || null);
  return info.lastInsertRowid;
}

export function getAdventureByIdForUser(id, user_id) {
  const stmt = db.prepare(`SELECT * FROM adventures WHERE id = ? AND user_id = ?`);
  return stmt.get(id, user_id);
}

export function listAdventuresForUser(user_id) {
  const stmt = db.prepare(`
    SELECT id, genre, status, created_at, updated_at
    FROM adventures
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `);
  return stmt.all(user_id);
}

export function updateAdventure({ id, user_id, history_json, state_json, main_quest_filled, status }) {
  const stmt = db.prepare(`
    UPDATE adventures
    SET history_json = ?, state_json = ?, main_quest_filled = COALESCE(?, main_quest_filled),
        status = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `);
  const info = stmt.run(history_json, state_json, main_quest_filled || null, status, id, user_id);
  return info.changes > 0;
}
