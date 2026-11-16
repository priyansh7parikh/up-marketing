// Every environment setting in one place. Set them in backend/.env locally (see .env.example) or in the host's dashboard.
const { env } = process;
const num = (name, fallback) => {
  const n = Number(env[name] ?? fallback);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
};

module.exports = {
  mongoUrl: env.MONGO_URL || 'mongodb://127.0.0.1:27017/upmarketing',
  sessionSecret: env.SESSION_SECRET,
  port: num('PORT', 3000),
  production: env.NODE_ENV === 'production' || Boolean(env.RENDER), // Render sets RENDER: secure cookies + HSTS can't be forgotten
  sessionDays: num('SESSION_DAYS', 30), // how long a login lasts
  loginMaxAttempts: num('LOGIN_MAX_ATTEMPTS', 10), // wrong passwords before lockout
  loginLockMinutes: num('LOGIN_LOCK_MINUTES', 15),
  admin: { username: env.ADMIN_USER, password: env.ADMIN_PASSWORD, name: env.ADMIN_NAME }, // first admin, used once
};
