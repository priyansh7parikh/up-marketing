# Jar Tracker: Implementation Plan

Spec: [2026-11-15-jar-tracker-design.md](../specs/2026-11-15-jar-tracker-design.md)

Node 22, Express 4, Mongoose 8 (MongoDB), React 19 + Vite + Tailwind 4.
Vessel keys everywhere: `small_jar`, `big_jar`, `small_bottle`, `big_bottle`.
**No auto-commits.** The owner commits.

## Done

- **Phase 1: ledger logic.** [backend/lib/balances.js](../../../backend/lib/balances.js): held, owed, cash credit, FIFO aging, due/late in India time. 14 tests.
- **Phase 2: server foundation.**
  - [backend/app.js](../../../backend/app.js) `createApp({mongoUrl, sessionSecret, api})`: sessions in Mongo, `/api/auth`, everything else under `/api` needs a login, serves `web/dist`.
  - [backend/lib/auth.js](../../../backend/lib/auth.js): login with a rate limit, a new session on login, re-checking the user on each request (disabled = logged out), `requireRole('admin')`, first admin seeded from `ADMIN_USER`/`ADMIN_PASSWORD`.
  - [backend/lib/audit.js](../../../backend/lib/audit.js): a plugin that logs create/update (field diff)/delete with the user. Update/delete queries that would skip the log are refused.
  - [backend/models/index.js](../../../backend/models/index.js): User, Customer, Product, Order, Collection, Settlement, Settings. Dates are `YYYY-MM-DD` strings.
  - Tests: `MONGO_TEST_URL=… npm test` (they skip if no Mongo). 23 passing.

## Next: feature by feature (each usable on screen before the next)

Feature 1 also sets up the `web/` app shell: login, responsive layout (bottom tabs on a phone, sidebar on a laptop) and gterm-style cards.
Responsive check on every feature at 375 / 768 / 1440px.

1. **Customers + Orders.** API (`/api/customers`, `/api/orders`, `/api/products`; prices snapshotted into `total`, admin-only delete) + screens (customer list with held/owed, customer ledger, order form, order list). Includes the UPI QR screen after a UPI save.
2. **Returns / Collections.** API + screen (log returns + cash/UPI, who collected, today's list).
3. **Pheras.**
   - Model: `Team {name, members[User], active}` (admin) and `Phera {date, team, startTime, endTime, filledOut, filledBack, emptiesBack (Vessels)}` (audited; employees add/edit).
   - `sold = filledOut − filledBack` per product, computed and never stored.
   - Validate filledBack ≤ filledOut and endTime ≥ startTime.
   - Screens: start a phera (team, time, filled out) → close it (end time, filled back, empties back); today's pheras per team.
4. **Reports.**
   - Today: one row per pending customer (due today / late N days, vessels, money, WhatsApp/Call) + team sales today from pheras + today's deliveries/collections.
   - Week (admin): pending + week totals + team sales per day.
5. **Admin.** Users, teams, products/prices, settings (UPI VPA, business info), audit view (highlighting employee edits), Settle dialog, public page.
6. **Scan + Quick entry.** Gated on sample register photos and an accuracy check with the owner (see spec).
7. **Deploy.** Render + Atlas M0, env vars: `MONGO_URL`, `SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `NODE_ENV=production`.
