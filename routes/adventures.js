import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listAdventuresForUser, getAdventureByIdForUser } from '../models/Adventure.js';

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const rows = listAdventuresForUser(req.user.id);
  res.json({ adventures: rows });
});

router.get('/:id', requireAuth, (req, res) => {
  const adv = getAdventureByIdForUser(Number(req.params.id), req.user.id);
  if (!adv) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: adv.id,
    genre: adv.genre,
    status: adv.status,
    main_quest_template: adv.main_quest_template,
    main_quest_filled: adv.main_quest_filled,
    history: JSON.parse(adv.history_json),
    state: JSON.parse(adv.state_json),
    created_at: adv.created_at,
    updated_at: adv.updated_at
  });
});

export default router;
