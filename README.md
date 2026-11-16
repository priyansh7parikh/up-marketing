# UP MARKETING

Orders, returns, pheras (delivery rounds), pending jars and money (Ughrani) for a water-jar business.
One Node server (Express + MongoDB) serves the API and the built React app.

## Run on your computer

Needs Node 22.9+ and MongoDB running locally.

```bash
npm run setup                       # install backend + web
cp backend/.env.example backend/.env # then fill SESSION_SECRET and ADMIN_PASSWORD
npm run build && npm start           # http://localhost:3000
npm test                             # needs local MongoDB
```

For screen work: `npm run dev` (server) and `npm run dev:web` (Vite, hot reload) in two terminals.

## Settings (environment variables)

All in [backend/.env.example](backend/.env.example). Secrets live only in `.env` locally or in the host's dashboard, never in git.

| Name | What |
|---|---|
| `MONGO_URL` | Database address |
| `SESSION_SECRET` | 32+ random characters (`openssl rand -hex 32`) |
| `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_NAME` | First admin, created once when there are no users |
| `NODE_ENV=production` | Secure cookies + HTTPS-only header (also on automatically on Render) |
| `SESSION_DAYS`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES` | Optional, see the example file |

## Go live (Render + MongoDB Atlas, free)

1. **Atlas:** create a free M0 cluster (Mumbai region), a database user, and allow access from anywhere (`0.0.0.0/0`, Render has no fixed IP). Copy the `mongodb+srv://…` string and add the database name: `…mongodb.net/upmarketing?…`.
2. **Render:** Dashboard → New → Blueprint → this repo. It reads [render.yaml](render.yaml). Paste `MONGO_URL` and an `ADMIN_PASSWORD` when asked.
3. Open the site, sign in as `admin`, change the password (More → Password), then set prices, items, UPI ID and teams under Admin.
4. Check `https://<your-app>.onrender.com/healthz` says `ok`.

The free plan sleeps after 15 idle minutes; the first open then takes 30–50 s. Upgrade the service to Starter ($7/month) to stop that.

## Backups

Atlas's free plan keeps **no backups**. Until the nightly backup job is set up (see [docs/backlog.md](docs/backlog.md)), take one by hand weekly:

```bash
mongodump --uri "$MONGO_URL" --gzip --archive=upm-$(date +%F).gz       # back up
mongorestore --uri "$MONGO_URL" --gzip --archive=upm-2026-11-16.gz --drop # restore (replaces everything)
```

A single deleted entry doesn't need a backup: Admin → Edit history → Restore.

## Logs worth watching

- `slow GET /api/customers 1200ms`: the customer list is getting slow; time for its next speed-up (backlog).
- `Something went wrong` in the app means a 500: the server log has the details.
