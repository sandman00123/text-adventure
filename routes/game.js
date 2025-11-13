import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createAdventure, getAdventureByIdForUser, updateAdventure } from '../models/Adventure.js';
import { buildSystemPrompt, callAI, pickRandom, loadJSON } from '../services/ai.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Start a new adventure
router.post('/start', requireAuth, async (req, res) => {
  try {
    const { genre } = req.body || {};
    if (!genre) return res.status(400).json({ error: 'genre required' });

    // Load main quest templates for genre
    const mainQuestPath = path.join(process.cwd(), 'game', 'templates', `${genre}_main_quests.json`);
    if (!fs.existsSync(mainQuestPath)) return res.status(400).json({ error: 'Unsupported genre' });
    const mainQuests = loadJSON(mainQuestPath).main_quests || [];
    if (!mainQuests.length) return res.status(500).json({ error: 'No main quests found' });

    const chosenQuest = pickRandom(mainQuests);
    const systemPrompt = await buildSystemPrompt({ genre, chosenQuest });

    // Ask AI to open the scene & concretize quest variables
    const initUser = { role: 'user', content: `Begin the ${genre} adventure. Present the setting in 4-7 sentences, introduce the main quest using the template, and fill all {variables}. Do NOT ask questions yet. End with: "Your move."` };
    const messages = [
      { role: 'system', content: systemPrompt },
      initUser
    ];
    const aiText = await callAI(messages);

    // Extract a fully rendered quest line by asking the AI to restate the main quest clearly
    const reflectMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(1),
      { role: 'assistant', content: aiText },
      { role: 'user', content: 'Restate the main quest in one sentence, fully resolved with variables, no extra text.' }
    ];
    const questLine = await callAI(reflectMessages);

    const advId = createAdventure({
      user_id: req.user.id,
      genre,
      main_quest_template: chosenQuest.quest,
      main_quest_filled: questLine
    });

    // Save opening turn
    const history = [
      { role: 'system', content: systemPrompt },
      initUser,
      { role: 'assistant', content: aiText }
    ];
    const ok = updateAdventure({
      id: advId,
      user_id: req.user.id,
      history_json: JSON.stringify(history),
      state_json: JSON.stringify({ flags: {}, inventory: [], clues: [], mainQuest: questLine }),
      main_quest_filled: questLine,
      status: 'active'
    });

    if (!ok) return res.status(500).json({ error: 'Failed to save adventure' });

    res.json({ adventure_id: advId, opening: aiText, main_quest: questLine });
  } catch (e) {
    res.status(500).json({ error: 'Failed to start adventure' });
  }
});

// Continue (player action)
router.post('/turn', requireAuth, async (req, res) => {
  try {
    const { adventure_id, action } = req.body || {};
    if (!adventure_id || !action) return res.status(400).json({ error: 'adventure_id and action required' });

    const adv = getAdventureByIdForUser(Number(adventure_id), req.user.id);
    if (!adv) return res.status(404).json({ error: 'Adventure not found' });
    if (adv.status !== 'active') return res.status(400).json({ error: 'Adventure already completed' });

    const history = JSON.parse(adv.history_json);
    const state = JSON.parse(adv.state_json);
    const systemPrompt = history.find(m => m.role === 'system')?.content;

    const userTurn = { role: 'user', content: `Player action: ${action}` };
    const messages = [...history, userTurn];

    // Ask AI to resolve the action AND optionally fire a side event
    const aiText = await callAI(messages);

    const newHistory = [...messages, { role: 'assistant', content: aiText }];

    // Ask AI if main quest is completed (yes/no) & any state updates (inventory/clues/flags)
    const judgeMessages = [
      { role: 'system', content: systemPrompt },
      ...newHistory.slice(1),
      { role: 'user', content: 'In JSON: {"completed": true|false, "add_inventory": [], "add_clues": [], "set_flags": {}}. Use strict JSON only.' }
    ];
    const judge = await callAI(judgeMessages);

    // Try to parse JSON safely
    let parsed = { completed: false, add_inventory: [], add_clues: [], set_flags: {} };
    try {
      parsed = JSON.parse(judge);
    } catch { /* ignore parse error; keep defaults */ }

    // Apply updates
    state.inventory.push(...(parsed.add_inventory || []));
    state.clues.push(...(parsed.add_clues || []));
    state.flags = { ...(state.flags || {}), ...(parsed.set_flags || {}) };

    const status = parsed.completed ? 'completed' : 'active';

    const ok = updateAdventure({
      id: adv.id,
      user_id: req.user.id,
      history_json: JSON.stringify(newHistory),
      state_json: JSON.stringify(state),
      main_quest_filled: adv.main_quest_filled,
      status
    });
    if (!ok) return res.status(500).json({ error: 'Failed to save turn' });

    res.json({
      reply: aiText,
      completed: parsed.completed === true,
      state
    });
  } catch {
    res.status(500).json({ error: 'Turn failed' });
  }
});

export default router;
