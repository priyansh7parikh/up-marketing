# Up-Marketing: Jar Delivery Business Tracker (Design)

## Context / why
The owner runs a delivery business that sells goods in returnable jars. The rule is that **jars come back within a day** and **payment is collected at delivery**. Today the tracking lives on paper registers (one page per day for orders, a separate page for returns and collections). The owner and manager need to see at a glance **who still holds our jars, who still owes money, and for how long**, at the start or end of each day and weekly. They also want to enter data by photographing the register pages instead of retyping them.

The repo is almost empty: [backend/app.js](backend/app.js) is a stub Express server, and `mongoose` and `bcrypt` are installed but unused. The look and feel is inspired by gterm (`/Users/priyanshparikh/Documents/GuardiumGDP/gterm`): a dark dashboard, one card per item, status chips, a filter bar, a sidebar, and React + Tailwind + Vite.

**Success** = at 8am the owner opens the app on a phone, the Today card shows every overdue jar and unpaid bill with its age, a payment link goes out on WhatsApp in one tap, and that evening's register page is scanned in under 2 minutes with review.

## Roles (decided)
| Role | Who | Can do |
|---|---|---|
| **Admin** | owner and manager | everything: customers, products/prices, users, delete, reports, audit view |
| **Employee** | delivery staff | view the Today card's pending lists and customers; **add and edit** orders, returns and cash (any date, audited); scan register pages. **Cannot** delete, settle, see the Week card, cash totals or the audit view, or manage prices or users (the visibility split is my call) |
| **Customer** | public, no login | public info page (what we sell, address, contact). Content to be designed later; v1 is a simple static page |

**Audit (decided):** every create and edit records who did it, when, and the before/after values. Rows show "added by X · edited by Y". Admins get an audit view that highlights changes made by employees.

## Domain model (decided with the owner)
- **Products (decided): 4.** Small jar, Big jar, Small bottle, Big bottle. Each has a price. **All four are returnable vessels.** Counts are kept per type underneath, but they are **shown together on one line per customer** (for example "2 big jar, 2 small jar"), not as separate lists or reports per product. "Jars held" in this document means vessels held.
- **Two ledgers per customer (decided).** Every movement is one dated, audited line, and balances are always the sum of those lines (nothing is stored that could drift):
  - **Vessel ledger**: per product, *out* (delivered), *in* (empties back at the door or in the collection register), *lost* (settled by admin). Running balance per product.
  - **Money ledger**: *billed* (order total including the delivery charge), *paid* (at delivery or a collection entry, cash/UPI), *settled* (discount or write-off by admin). Running balance owed.
  - The customer page shows both ledgers as a statement, with dates, who entered each line, and running balances.
- **Customer**: name, phone, address, category **Regular | Party order**, UPI/phone notes.
- **Order (delivery)**: date, customer, lines (product × qty), jars delivered, **empties taken back at the door**, delivery type **Self pickup | Our delivery**, **delivery charge** (separate, used when the address is far), total, **Paid | Not paid**, amount paid now, **return due date** (default delivery date + 1 day, editable for party orders), photo source (if scanned), createdBy/updatedBy.
- **Return/Collection entry** (the separate register): date, customer, jars returned, cash collected, method (cash/UPI), **collected by** (admin or employee), linked scan.
- **Payment** is recorded either on the order (paid at delivery) or as a collection entry. Payments can be partial and are not tied to one order.
- **Jars held by a customer** = Σ delivered − Σ returned (at the door + collection entries). Example: holding 3, then 5 delivered and 3 empties back → holding 5. Holding 3, then 5 delivered and 0 back → holding 8.
- **Money owed by a customer** = Σ order totals − Σ payments.
- **Cash credit (decided).** If a customer pays more than they owe, the extra is kept as **credit** and automatically pays their next bills. The customer page and report show credit separately.
- **Extra vessels are ignored (decided).** A customer can't hold a negative number of our jars. If more come back than they hold, the extra are their own jars (customers can buy jars themselves), so the balance stops at 0.
- **Lateness:** jars are aged oldest-first (FIFO). A jar is overdue once it is past its order's return due date. Money is aged the same way against the order date, and anything unpaid is late after 1 day.
- **No khata/credit cycles.** "Not paid" is simply recorded and added to what the customer owes.
- **Deposit:** out of v1. It may be added later as an optional per-customer field.
- **Paper stays the main record (decided).** The app is the digital copy that produces the reports. Register scans are the main way data gets in; adding by hand is for corrections and one-offs.
- **Back-dated entries (decided).** Any order or collection can be entered with a past date (for example, going live on 15 Nov and entering 10 Nov pages). There is no separate "opening balance" record: old balances come from entering old pages, and aging uses each entry's own date.
- **Pricing (decided).** Each product has one fixed price (admin-managed) that fills in the order line. Employees can't change prices.
- **Settle / Close (decided, admin only).** A "Settle" button on an order or customer. The admin enters a discount or write-off amount and a reason, and the remaining money is closed. My call: the same dialog can also close the remaining jars as "lost". It is fully audited and appears in the ledger as a settlement line, never as an edit to the original order.
- **Duplicate guard (my call).** Because paper is primary, scanning a page whose date and type (orders or returns) were already scanned shows a warning. The review step also flags rows matching an existing entry (same customer, date and quantity).

## Features (v1)
1. **Daily report (Today card).** On 16 Nov it lists everything **not cleared from previous days**. There is **one row per customer** combining vessels and money, oldest first, for example:
   ```text
   Adam   taken 15 Nov (1 day)   2 big jar, 2 small jar pending   cash ✓ paid        [Call]
   John   taken 14 Nov (2 days)  2 big jar pending                ₹240 pending       [WhatsApp] [Call]
   ```
   - "Taken" is the date of the oldest uncleared delivery, and the age is counted from it.
   - **WhatsApp** opens a chat with a message filled in: what's pending, the amount, and the UPI pay link when money is due. **Call** opens the phone dialer (`tel:`).
   - Below the list: today's deliveries, and today's collections with the cash total by collector.
2. **Weekly report (This Week card).** The same per-customer rows for anything still pending at week end, plus week totals (delivered, returned, billed, collected).
3. **Orders**: list with filters (date, customer, paid/unpaid, delivery type), plus add/edit form.
4. **Collections tab**: log returns and cash, today's list, "who collected".
5. **Scan register page**: phone camera → upload → Claude vision extracts every row into an **editable review table** (unknown customers flagged; match by name/phone) → confirm → saved as entries. Order pages and return pages are separate modes. Nothing is saved without review.
6. **Customers**: list with jars held and money owed, plus a ledger/history per customer.
7. **Payment: Cash or UPI (decided).** Every payment (on an order or in a collection entry) is either **Cash** or **UPI**.
   - **UPI chosen → the QR appears right after the entry is saved.** It fills the screen with our UPI QR for the exact amount (`upi://pay?pa=<our VPA>&pn=<business>&am=<amount>&tn=<customer/date>`), so the customer scans it from the phone in the employee's hand.
   - The same screen has **"Send on WhatsApp"** (`https://wa.me/<phone>?text=…` with the pay link and amount) for when the customer isn't there.
   - Then **"Received ✓"** marks it paid, or **"Later"** leaves it pending so it appears in the daily report. Received can't be confirmed automatically without a payment gateway, so it's a manual tap (audited).
   - The UPI VPA and business name live in admin Settings.
8. **Admin**: users (add/disable employee, reset password), products and prices, business settings (UPI VPA, business info for the public page), audit view.
9. **Public page**: business name, products, address, contact.
10. **Pheras: daily circular routes (decided).** Each of the 3–5 **teams** runs one or more rounds a day for prepaid route customers. These customers use **tokens**, so there are no customer entries and no cash on a phera.
    - Each phera records: date, team, **start time**, **end time**, and per product (any of the four) **filled out**, **filled back** and **empties back**.
    - **Sold = filled out − filled back**, per product.
    - Phera ledger and report: per team per day (and per week), the sold count per product, empties back, the number of rounds and time on route. All teams together give the day's route sales.
    - Teams are admin-managed (name + members). Employees can add and edit pheras (audited), like orders.
    - Out of scope for now: token sales and balances, and cash on pheras.
11. **Works on every screen (decided).** The app must work well on a phone (staff in the field), a tablet, and a laptop or desktop browser (owner/manager in the office). One responsive web app: bottom tabs and stacked cards on a phone, a sidebar with multi-column cards and wide tables on a laptop. No separate mobile app.

## Non-goals / anti-goals
- No customer login, no automatic WhatsApp/SMS sending, no payment gateway (no fees, no KYC).
- No khata/monthly billing, no inventory or stock tracking beyond jar counts, no deposits in v1.
- **Anti-goal:** a scan that silently saves wrong data. A review step is mandatory.
- **Anti-goal:** employees changing records without a trace.

## App sections
Orders · Returns/Collections · **Pheras** · Customers · Reports (Today / Week, including team sales) · Scan · Admin (users, teams, products, settings, audit) · Public page.
Possible later: total vessel stock (owned / filled / empty in the godown).

## Customer identity (decided 15 Nov, replaces name matching)

**Why:** the same person is written many ways ("Nirav", "Nirav bhai", "Niravbhai Patel"). Matching on names would create duplicate accounts and split their pending vessels and money.

**Approaches considered**

| Option | Trade-off | Verdict |
|---|---|---|
| Match on the typed name | no phone needed; duplicates whenever spelling varies | rejected |
| Fuzzy name matching | fewer duplicates, but can attach an order to the wrong person silently | rejected |
| **Phone number is the account** | needs a number on every order; no duplicates, orders collate by themselves | **picked** |

**Rules**
- A customer is a **10-digit Indian mobile number** (starts 6-9). Spaces, dashes, a leading 0 and +91 are stripped. Landlines are refused.
- A phone number is **required**: no number, no order, and no customers without one.
- **One number is one account.** A known number always goes to that account, whatever name is typed.
- **A different number is a different customer**, even with the same name. There are no extra numbers on an account and no Merge button.
- The name is a label. A different name typed for a known number does not change the saved name; renaming is a deliberate link in the form.
- **Name search is a finder only**: it lists matching customers and fills in the number when one is tapped. A name alone never selects or creates a customer.
- **Address belongs to the order.** Each order keeps the address typed on it. The order form never pre-fills or suggests an address, so staff must ask each time. The customer record keeps the latest one for reference, and the ledger shows each order's address.
- Only **admins** can change a customer's number; a number already in use is refused. Employees can rename and edit the address. Every change is in the edit history.
- The same picker is used for orders and returns. Returns require an existing customer.
- The register scanner matches entries by phone number (each register entry has name, phone and address).
- **One-time repair at startup:** customers that already share a number are merged into the one with the most entries (this folds PP into Udit), then the unique index is built.

**My calls:** changing the number on an existing order moves the order and shows a warning first; the Customers page keeps search by name or number.

## Security (required, built in phase 2)

**Login**
- Passwords are bcrypt-hashed (cost 12), at least 8 characters.
- Login runs in constant time, so it doesn't reveal whether a username exists.
- Lockout: 10 failures per user/IP or 30 per IP → 15 minutes.

**Sessions**
- Server-side, stored in Mongo, httpOnly + SameSite=Lax cookie, Secure in production, and a new session id on login.
- The user is re-checked on every request, so disabling an employee or changing a role takes effect immediately.

**Access**
- Every `/api` route needs a login. Admin-only routes use `requireRole('admin')`, and the server enforces it as well as the UI hiding it.

**Requests**
- CSRF: POSTs must be JSON, plus SameSite cookies.
- NoSQL injection: `sanitizeFilter`, `strictQuery`, and type checks on input.
- Request bodies are capped at 100 KB (the scan route gets its own limit).

**Headers**
- CSP, X-Frame-Options DENY, nosniff, same-origin referrer, HSTS in production, no `x-powered-by`.

**Secrets**
- `SESSION_SECRET` must be 32+ characters. All secrets come from env vars, never the repo (`.env` is gitignored).

**Audit**
- Every write is logged with the user, and writes that would bypass the log are refused.

**Dependencies**
- `npm audit` shows 0 known issues. `body-parser` and `nodemon` were removed (Express has its own JSON parser, and `node --watch` replaces nodemon).

**Every new feature must**
- put admin-only actions behind `requireRole`;
- validate input in the model schema;
- write only through `doc.save()` / `doc.deleteOne()`;
- add a 403 test for any admin-only route.

## Database (decided: MongoDB)
MongoDB stays. It's free (Atlas M0, 512MB; the Community server is free), it was already in the repo and the auth/audit layer is built and tested on it. Postgres (Neon free) was considered: an equal fit, but switching would mean redoing the data layer for no gain. SQLite was rejected because free hosts wipe the disk.

## Approach (picked: A)
| Option | Trade-off | Verdict |
|---|---|---|
| **A. Express + MongoDB (this repo) + React/Tailwind PWA** | builds on the installed mongoose/bcrypt; we own the auth and audit code | **Picked** (cheapest and best fit) |
| B. Next.js + Supabase | built-in auth and storage; replaces the repo; free tier pauses when idle and Vercel's free plan bars commercial use | rejected |
| C. Sheets + AppSheet | fastest, but can't do page scans, the card UI or audit highlights | rejected |

**Hosting (my call):** one Express service serves the API plus the built React app on Render free, with MongoDB Atlas M0 free. ₹0/month. Shortcut: Render free sleeps after 15 minutes, so the first open takes ~30–50s. Upgrade to $7/mo Starter if that becomes annoying. Scan cost is ~₹1–2 per page via the Claude API (`claude-sonnet-5-5`, which handles handwriting), so ~₹50–100/mo.

## Architecture (my calls, builder may refine)
```
backend/                       (existing; Express 4 + Mongoose 8)
  app.js                       mount routes, serve web/dist, session auth
  models/  Customer, Product, Order, Collection, User, AuditLog, Scan, Settings
  routes/  auth, customers, orders, collections, reports, scans, admin, public
  lib/     auth.js (bcrypt + cookie session, requireRole), audit.js (one mongoose
           plugin that writes AuditLog on save/update), balances.js (jars-held,
           owed, FIFO aging — the one piece of real logic; unit-tested), scan.js
web/                           React + Vite + Tailwind PWA (gterm visual style)
  pages: Today, Week, Orders, Collections, Scan, Customers, Admin, Public
```
- Auth: username + password (bcrypt), httpOnly cookie session (`express-session` + `connect-mongo`). No JWT.
- Audit: a Mongoose plugin on Order, Collection and Customer stamps `createdBy/updatedBy` and writes an AuditLog diff, so there is no per-route audit code.
- Reports are computed on read with aggregation (volume is small), so there are no stored report tables.
- Scan photos: compressed on the client (~150KB) and stored in Mongo with the Scan record, linked from the entries it produced. Shortcut: if Atlas 512MB gets tight, move them to Cloudinary free.
- Dates: all "day" boundaries are in Asia/Kolkata.
- Tests: `node --test` on `balances.js` (FIFO aging, partial returns, the owner's examples above) and on scan-output parsing.

## Left to the builder
Exact UI layout and colours within the gterm style, API shapes, field validation details, the Claude prompt and JSON schema for extraction, how customers are matched during scan review.

- Online only (decided). There is no offline queue.

## Open items (to confirm with the owner)
- **Sample photos of both register pages** (orders and returns) are needed before building the scan step. They settle the columns and become the test fixtures for scan parsing. Everything else can be built first.

## Scanner (decided: Gujarati input)
- Registers may be handwritten in **Gujarati**. The engine is Claude vision (`claude-sonnet-5-5`) with a fixed JSON output schema: `date`, then rows of `customer`, `small_jar`, `big_jar`, `small_bottle`, `big_bottle`, `amount`, `method`.
- The prompt includes the **known customer list** (Gujarati name, English name, phone), and the model returns a `customerId` or `"new"`. This matches names against known customers instead of transcribing them. It also converts Gujarati digits (૦–૯) to numbers.
- **Review before saving (decided).** The photo is shown next to an editable table, with every row pre-filled with the model's reading. Unmatched or low-confidence rows are highlighted.
  - **Missed rows:** the model also returns `rows_seen` (every row on the page, readable or not) plus the positions it couldn't read. The screen says "10 rows found, 8 filled. Rows 4 and 7 need you" and puts **empty rows in their original positions**, to be filled by typing or with the Gboard mic in the Quick entry box.
  - **+ Add row** covers anything the model missed entirely.
  - **Every scanned cell is editable** in the review (customer, each vessel count, amount, Cash/UPI, the page date), and any row can be removed.
  - Nothing is written until **Save all**, which saves all rows in one go and links each to the scan.
  - After saving, scanned entries are normal entries: editable by admins and employees. The audit keeps the original scanned value against the edit ("scanned 2 → edited to 3 by Ravi").
- Customer records get an optional **Gujarati name** field, so matching and display work in both scripts.
- **Voice / quick entry (decided).** Staff use Android phones with **Gboard voice typing** (Gujarati/Hindi), so there's no speech-to-text code. The order and collection forms get one **Quick entry** text box: dictate "Adam બે મોટા જગ ૨૦૦ cash" and it goes through the same Claude parsing step as a scan (text in, not an image), fills the form, and the user confirms. Shortcut: browser/Gboard speech only; upgrade to Sarvam AI or Google Speech if iPhones or noisy conditions become a problem.
- **Gate:** run 5–10 real register photos through it and show the owner the accuracy before building the scan UI. Fallback if handwriting accuracy is poor: Google Cloud Vision OCR (strong Gujarati handwriting support, 1,000 pages/month free) to read the text, then Claude to structure it.
- Prices for each product (admin enters them in the app).

## Next steps after approval
1. Save this design as `docs/superpowers/specs/2026-11-15-jar-tracker-design.md` and commit it on branch `pp-test-15-nov`.
2. Write a step-by-step implementation plan. Build order: models + balances.js (with tests) → auth/roles/audit → orders/collections/customers API → Today/Week cards UI → UPI share → admin + settle → scan (once the sample photos arrive) → public page → deploy to Render + Atlas.

## Verification
- `node --test backend/test` passes the balance/aging cases.
- Run locally (`npm run dev`) and seed a customer: deliver 5, return 3 next day → Today shows 2 jars, 1 day late. Unpaid order → appears in pending money, and the UPI link opens with the correct amount.
- Log in as an employee: the delete button and reports are hidden and the API returns 403. Their edit shows in the admin audit view, highlighted.
- Scan a real register photo → the review table matches the page → confirm → entries show "added by" with the scan link.
