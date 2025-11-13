import fs from 'fs';
import path from 'path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const HISTORY_DIR = path.join(ROOT, 'data', 'history');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function userFile(userId) {
  ensureDir(HISTORY_DIR);
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(HISTORY_DIR, `${safe}.json`);
}

async function readJSON(file) {
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeJSON(file, data) {
  await fs.promises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Adds or updates a history entry for a user.
 * Minimal fields: { id, title, createdAt, updatedAt }
 */
export async function addToHistory(userId, entry) {
  if (!userId) return;
  const file = userFile(userId);
  const list = await readJSON(file);

  const now = new Date().toISOString();
  const idx = list.findIndex(x => x.id === entry.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...entry, updatedAt: entry.updatedAt || now };
  } else {
    list.unshift({
      id: entry.id,
      title: entry.title || 'Untitled Adventure',
      createdAt: entry.createdAt || now,
      updatedAt: entry.updatedAt || now,
    });
  }
  await writeJSON(file, list.slice(0, 50)); // keep last 50
}

export async function getHistory(userId) {
  if (!userId) return [];
  const file = userFile(userId);
  return await readJSON(file);
}
