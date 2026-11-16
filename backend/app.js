const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const auth = require('./lib/auth');
const routes = require('./routes');
const config = require('./config');

function createApp({ mongoUrl, sessionSecret, production = false, sessionDays = 30, api = express.Router(), publicInfo }) {
  if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters (e.g. `openssl rand -hex 32`)');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy: needed for secure cookies and req.ip

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY', // no clickjacking via iframes
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      ...(production && { 'Strict-Transport-Security': 'max-age=31536000' }),
    });
    next();
  });

  // CSRF: a cross-site page can only send GET/HEAD/POST with form-like bodies without a CORS preflight (which we never
  // allow). PUT/PATCH/DELETE always preflight, so requiring JSON on POST (plus SameSite cookies) blocks forged requests.
  app.use('/api', (req, res, next) => (
    req.method !== 'POST' || req.is('application/json') ? next() : res.status(415).json({ error: 'JSON only' })
  ));
  app.use(express.json({ limit: '100kb' })); // shortcut: the scan route will get its own larger limit for photos

  const store = MongoStore.create({ mongoUrl, ttl: sessionDays * 24 * 3600 });
  app.locals.sessionStore = store; // so tests/shutdown can close its connection
  app.use(session({
    name: 'upm.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: { httpOnly: true, sameSite: 'lax', secure: production, maxAge: sessionDays * 24 * 3600 * 1000 },
  }));

  app.use('/api/auth', auth.router);
  if (publicInfo) app.get('/api/public', publicInfo); // the customer page, before the login check
  app.use('/api', auth.requireAuth);
  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  const web = path.join(__dirname, '..', 'web', 'dist');
  if (fs.existsSync(web)) {
    app.use(express.static(web));
    app.get('*', (req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: err.message });
    if (err.code === 11000) return res.status(409).json({ error: err.keyPattern?.phone ? 'That number already belongs to another customer' : 'That name is already used' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.expose === false ? 'Bad request' : err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}

if (require.main === module) {
  mongoose.connect(config.mongoUrl)
    .then(() => auth.seedAdmin())
    .then(() => routes.seedProducts())
    .then(() => routes.fixCustomerPhones())
    .then(() => createApp({ ...config, api: routes.api, publicInfo: routes.publicInfo }).listen(config.port, () => console.log(`Up-Marketing on :${config.port}`)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { createApp };
