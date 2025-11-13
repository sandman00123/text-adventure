import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, getUserByEmail } from '../models/User.js';

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const existing = getUserByEmail(email);
    if (existing) return res.status(400).json({ error: 'Email already in use' });
    const password_hash = await bcrypt.hash(password, 10);
    const userId = createUser({ email, password_hash });
    const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: 'Signup failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = getUserByEmail(email);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
