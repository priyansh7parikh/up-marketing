const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const auth = require('./lib/auth');
const routes = require('./routes');
const config = require('./config');

function createApp({ sessionSecret, production = false, sessionDays = 30, api = express.Router(), publicInfo }) {
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

  // Sessions share the app's database connection (one pool, not two). Call after mongoose.connect().
  const store = MongoStore.create({ client: mongoose.connection.getClient(), ttl: sessionDays * 24 * 3600 });
  app.use(session({
    name: 'upm.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: { httpOnly: true, sameSite: 'lax', secure: production, maxAge: sessionDays * 24 * 3600 * 1000 },
  }));

  // Requests slower than a second go to the log: the sign that the customer list needs its next speed-up.
  app.use('/api', (req, res, next) => {
    const t = Date.now();
    res.on('finish', () => { const ms = Date.now() - t; if (ms > 1000) console.warn(`slow ${req.method} ${req.originalUrl.split('?')[0]} ${ms}ms`); });
    next();
  });
  // For the host's health check: up and connected to the database. No login, says nothing else.
  app.get('/healthz', (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).send('ok'));

  app.use('/api/auth', auth.router);
  if (publicInfo) app.get('/api/public', publicInfo); // the customer page, before the login check
  app.use('/api', auth.requireAuth);
  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  const web = path.join(__dirname, '..', 'web', 'dist');
  if (fs.existsSync(web)) {
    // Built files have a hash in their name, so phones can keep them a year; index.html is always re-checked.
    app.use(express.static(web, { setHeaders: (res, file) => res.set('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache') }));
    app.get('*', (req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.name === 'VersionError') return res.status(409).json({ error: 'Someone saved this at the same moment. Reload and try again.' });
    // Only the field messages ("Enter a sign-in name"), not Mongoose's "User validation failed: username: …" prefix.
    if (err.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors).map((e) => (e.name === 'CastError' ? `"${e.value}" is not a valid ${e.path}` : e.message)).join('. ') });
    if (err.name === 'CastError') return res.status(400).json({ error: `"${err.value}" is not a valid ${err.path}` });
    if (err.code === 11000) return res.status(409).json({ error: err.keyPattern?.phone ? 'That number already belongs to another customer'
      : err.keyPattern?.username ? `Sign-in name "${err.keyValue.username}" is already taken. Pick another, like their first name.` : 'That name is already used' });
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
    .then(() => routes.numberOldEntries())
    .then(() => {
      const server = createApp({ ...config, api: routes.api, publicInfo: routes.publicInfo }).listen(config.port, () => console.log(`Up-Marketing on :${config.port}`));
      // On deploy/restart the host sends SIGTERM: finish requests in flight (a save half-done is a lost entry), then exit.
      process.once('SIGTERM', () => server.close(() => mongoose.disconnect().then(() => process.exit(0))));
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { createApp };
