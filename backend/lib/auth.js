const express = require('express');
const bcrypt = require('bcrypt');
const { User } = require('../models');
const { als } = require('./audit');
const config = require('../config');

const router = express.Router();

// shortcut: in-memory, per process; fine for one server instance. Move to Mongo if we ever run more than one.
const failures = new Map();
const LIMIT = config.loginMaxAttempts;
const WINDOW_MS = config.loginLockMinutes * 60 * 1000;
const blocked = (k, max) => { const f = failures.get(k); return f && f.n >= max && Date.now() - f.at < WINDOW_MS; };
const fail = (k) => {
  const f = failures.get(k);
  failures.set(k, { n: (f && Date.now() - f.at < WINDOW_MS ? f.n : 0) + 1, at: Date.now() });
};
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'username and password required' });
    // Two limits: per user from this IP, and per IP across all usernames (stops guessing many accounts).
    const keys = [[`${req.ip}|${username.toLowerCase()}`, LIMIT], [req.ip, LIMIT * 3]];
    if (keys.some(([k, max]) => blocked(k, max))) return res.status(429).json({ error: `Too many attempts, try again in ${config.loginLockMinutes} minutes` });

    const user = await User.findOne({ username: username.toLowerCase(), active: true });
    // Always run bcrypt, so response time doesn't reveal whether the username exists.
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) {
      keys.forEach(([k]) => fail(k));
      return res.status(401).json({ error: 'Wrong username or password' });
    }
    failures.delete(keys[0][0]);
    req.session.regenerate((err) => { // new session id on login (prevents fixation)
      if (err) return next(err);
      req.session.user = { id: String(user._id), name: user.name, role: user.role };
      res.json(req.session.user);
    });
  } catch (e) { next(e); }
});

// Anyone can change their own password, by proving the current one.
router.post('/password', async (req, res, next) => {
  try {
    const s = req.session.user;
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    const { current, next: fresh } = req.body || {};
    const user = await User.findById(s.id);
    if (!user?.active || typeof current !== 'string' || !(await bcrypt.compare(current, user.passwordHash))) {
      return res.status(400).json({ error: 'Current password is wrong' });
    }
    user.passwordHash = await hashPassword(fresh);
    await user.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res, next) => req.session.destroy((err) => (err ? next(err) : res.json({ ok: true }))));

router.get('/me', (req, res) => (req.session.user ? res.json(req.session.user) : res.status(401).json({ error: 'Not logged in' })));

// Every /api route after this runs as the logged-in user (audit reads it from here).
async function requireAuth(req, res, next) {
  const s = req.session.user;
  if (!s) return res.status(401).json({ error: 'Not logged in' });
  try {
    // Re-check so a disabled employee or a role change takes effect immediately.
    const user = await User.findById(s.id, 'name role active').lean();
    if (!user?.active) return req.session.destroy(() => res.status(401).json({ error: 'Account disabled' }));
    req.user = { id: s.id, name: user.name, role: user.role };
    als.run({ user: req.user }, next);
  } catch (e) { next(e); }
}

const requireRole = (role) => (req, res, next) => (req.user?.role === role ? next() : res.status(403).json({ error: 'Admins only' }));

// Single choke point for every password we store (seed, new user, reset).
function hashPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
  return bcrypt.hash(pw, 12);
}

// First boot: create the owner's admin account from env, only when there are no users at all.
async function seedAdmin({ username: ADMIN_USER, password: ADMIN_PASSWORD, name: ADMIN_NAME } = config.admin) {
  if (await User.estimatedDocumentCount()) return;
  if (!ADMIN_USER || !ADMIN_PASSWORD) throw new Error('No users yet: set ADMIN_USER and ADMIN_PASSWORD to create the first admin');
  await User.create({ username: ADMIN_USER, name: ADMIN_NAME || ADMIN_USER, role: 'admin', passwordHash: await hashPassword(ADMIN_PASSWORD) });
  console.log(`Created admin user "${ADMIN_USER}"`);
}

module.exports = { router, requireAuth, requireRole, hashPassword, seedAdmin };
