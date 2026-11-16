# UP MARKETING backlog

Status as of 16 Nov 2026. ✅ = built, 🟡 = partly built, ⬜ = not started, ❓ = needs your decision.

## Queue (in order)

1. ✅ **Cancel / restore orders and returns.** Anyone can cancel; the entry is kept, struck through and counts for nothing. Edits already keep old → new values in Edit history.
2. ✅ **Separate item switches for Pheras, Regular orders and Party orders** (your item 2). Admin → Items on sale: On/Off per item for regular orders, party orders and pheras.
3. 🟡 **Reason on corrections.** Done for cancelling (asked, shown in the ledger and on the entry). Not yet for plain edits of old entries.
4. ✅ **Search everywhere.** Find box on Today; admins also match any address used on an order.
5. ✅ **Address history.** "Addresses used" on the customer page, admin only.
6. ✅ **"Upcoming" on Today.** "Coming up" lists orders booked for the next 7 days.
7. 🟡 **No double entries.** Done: a double tap or a retry saves an order or return only once. Not yet: warning for the same payment twice in a day.
8. ✅ **Practice day.** Played 16 Nov: admin + 2 employees, regular and party orders, 4 phera rounds, part returns, cash, overpayment, a wrong return fixed, a cancelled order, a +5 change. All 16 numbers matched. Found and fixed: a round still out was counted as sold.
9. ⬜ **Register scan (Gujarati).** Waiting for 2–3 photos each of the order page and the return page. Every row is reviewed before saving; no customer is created from an unsure reading.
10. 🟡 **Go live.** Done: Render blueprint ([render.yaml](../render.yaml)), health check, secure cookies on automatically, clean restarts, deploy steps in the README. Left: create the Atlas + Render accounts, data export (CSV) for admins.
14. ⬜ **Nightly backups (must have before go-live).** Atlas's free plan keeps no backups. A free scheduled job runs `mongodump` every night and keeps 30 days; one restore tested. Until then: the weekly manual backup in the README. Decide where copies live (GitHub private or Google Drive).
15. ✅ **Two people editing the same entry.** The second save on an old copy is refused ("Amit changed this order at 10:02 while you had it open. Reload…") instead of quietly undoing the first change. Orders, returns, pheras, customers.
16. ✅ **Long date ranges.** Lists hold up to 5000 entries (~50 days at 100 entries/day) and warn when cut short, so totals are never silently wrong.
17. 🟡 **Speed of the customer list (Today, Pending, new order).** Done: it reads only what the math needs; 3 years of data went from 1.05 s to 0.43 s on a laptop (1 year ≈ 0.15 s). Later, only if the server log shows `slow GET /api/customers`: keep each customer's balance in memory and recompute only customers whose entries changed. Decided 16 Nov: enough for the first 6–12 months; revisit with real data.
11. ✅ **Logo goes home.** Tapping the UP MARKETING logo opens Today (the home page), from any screen.
12. ✅ **Entry numbers.** Every order and return has its own number (Order #12, Return #4), shown on the lists, the edit page, the customer ledger and Edit history. Numbers are never reused, not even after a delete. Older entries were numbered once by date.
13. ✅ **Recover a delete.** Edit history shows what a deleted entry held and has a **Restore** button (admin) that puts it back exactly: same number, items, money and who first entered it. Cancel remains the everyday "soft delete"; Delete is admin-only and now undoable too.

## Review checklist (your item 1)

### Customers
- ✅ 10-digit mobile required; one number = one customer; same number always finds the same customer.
- ✅ Records are linked by an internal ID, not the phone, so an admin can change a customer's number and the ledger stays.
- ✅ Typing an existing number selects that customer instead of creating a duplicate.
- ✅ Two people sharing one number: not supported, by decision. Use a different number for the second person.
- ✅ Address history: "Addresses used" on the customer page (admin).

### Orders
- ✅ Bill = quantity × price, from the Regular or Party list.
- ✅ Item on/off switch; old entries with a switched-off item stay visible.
- ✅ Party address per order. Future dates ("Booked for later"). Return by = date + 1, changeable.
- ✅ Paid, part paid, unpaid; cash or UPI.
- ✅ Add or reduce quantity by editing; old and new values are kept in Edit history (not overwritten silently).
- ⬜ "20 today, +5 tomorrow" can be a second order for the next day (works now) or an edit; no link between the two orders. Add one only if you need it.

### Pheras (rounds)
- ✅ A team can do several rounds a day; one box per team, rounds numbered in time order, totals added once.
- ✅ A round is started and closed (end time + what came back); it stays "out now" until closed.
- ❓ The review suggests listing customers inside a round. Pheras were decided as prepaid token routes with no customer entries. Keep it that way unless that has changed.

### Items and returns
- ✅ Outstanding = given − returned, per item, oldest first, across many orders and days.
- ✅ A return is its own entry, never a change to the order.
- ✅ Wrong count (5 said, 4 given): edit the return. Wrong customer: cancel it and enter it again for the right customer.

### Money (Ughrani)
- ✅ Items and money are tracked separately.
- ✅ Part payment, full payment, payment before the order, overpayment: extra money becomes credit and is used by the next bill automatically.
- ✅ Correct a payment by editing it; reverse it by cancelling the entry.
- ✅ A payment that doesn't name an order clears the oldest dues first.

### Ledger and reports
- ✅ Full ledger with every entry, including closed and cancelled ones.
- ✅ Pending items and Ughrani reports; Today shows *due today* and *late* separately.
- ✅ Coming up (booked orders, next 7 days).

### Admin, settings, staff
- ✅ Home: Pending items and Ughrani buttons, New order button, today's orders, returns and cash.
- ✅ Save settings; prices (regular and party); item switches; UPI ID; customer page details; teams.
- ✅ Staff: add, switch off (signed out at once; history kept), reset password; Edit history with employee changes marked.

## Decisions still open
Answers to the review questions were not in the message, so these use my recommendation until you say otherwise:

| Question | Using now |
|---|---|
| Payment that doesn't name an order | Clears the oldest dues first (already built) |
| Start/close each phera round | Yes (already built) |
| Offline entry | Online only for now |
| Who corrects old entries | Today: everyone can edit any date (audited). Recommended: employees edit only today's and yesterday's entries; admin edits older ones. Say yes and I'll add it. |
| Address history | Keep every address, admin can view (item 5) |
| Register scan | Review every row before saving |
| Restore a delete older than the last 300 changes | Not needed: mistakes are checked within a day (16 Nov). |
